/**
 * Postgres migration helper — pg-migrate.ts
 *
 * Copies all data from the SQLite production database to the target Postgres
 * database (Supabase). Designed to be run ONCE during the maintenance window.
 *
 * Prerequisites (run these first):
 *   1. Set env vars: DATABASE_URL (SQLite), POSTGRES_URL, POSTGRES_DIRECT_URL
 *   2. On the Postgres side, push the schema:
 *        DATABASE_URL=$POSTGRES_DIRECT_URL npx prisma db push --schema prisma/schema.postgres.prisma
 *   3. Run this script:
 *        npx ts-node --esm scripts/pg-migrate.ts
 *      or with dotenv-cli:
 *        npx dotenv -e .env.migration -- npx ts-node --esm scripts/pg-migrate.ts
 *
 * Safety:
 *   - Each table uses createMany with skipDuplicates:true — safe to re-run.
 *   - We insert tables in FK-dependency order (parents before children).
 *   - Progress is logged to stdout + a timestamped log file in scripts/logs/.
 *   - A dry-run mode (DRY_RUN=1) prints row counts without inserting anything.
 *
 * The script does NOT stop the Next.js server. For zero data loss you must:
 *   1. Put the Next.js app in maintenance mode.
 *   2. Run this script.
 *   3. Verify row counts.
 *   4. Swap DATABASE_URL to POSTGRES_URL in .env.
 *   5. Rebuild + restart.
 */

import { PrismaClient as SqliteClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";

// ---------------------------------------------------------------------------
// Postgres client — constructed from POSTGRES_DIRECT_URL so we bypass the
// connection pooler during bulk inserts (pooler has row-count limits).
// ---------------------------------------------------------------------------
const POSTGRES_URL = process.env.POSTGRES_DIRECT_URL || process.env.POSTGRES_URL;
if (!POSTGRES_URL) {
  console.error(
    "ERROR: POSTGRES_DIRECT_URL (or POSTGRES_URL) is not set.\n" +
      "Set it in your .env.migration file or export it before running this script."
  );
  process.exit(1);
}

// Dynamically import @prisma/client for Postgres.
// The normal @prisma/client is compiled against the schema in prisma/schema.prisma
// (SQLite). To get a Postgres-aware client you must:
//   npx prisma generate --schema prisma/schema.postgres.prisma --generator-output prisma/pg-client
// For this script we use the SAME Prisma client but point it to a Postgres
// DATABASE_URL. Prisma Client is provider-agnostic at runtime; only the
// migrations differ. We override DATABASE_URL just for the pg client.
process.env._PG_MIGRATION_URL = POSTGRES_URL;

const DRY_RUN = process.env.DRY_RUN === "1";
const LOG_DIR = path.resolve(__dirname, "logs");

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------
fs.mkdirSync(LOG_DIR, { recursive: true });
const logFile = path.join(
  LOG_DIR,
  `pg-migrate-${new Date().toISOString().replace(/[:.]/g, "-")}.log`
);
const logStream = fs.createWriteStream(logFile, { flags: "a" });

function log(...args: unknown[]): void {
  const line = args.map(String).join(" ");
  const ts = new Date().toISOString();
  const full = `[${ts}] ${line}`;
  console.log(full);
  logStream.write(full + "\n");
}

function logError(...args: unknown[]): void {
  const line = args.map(String).join(" ");
  const ts = new Date().toISOString();
  const full = `[${ts}] ERROR: ${line}`;
  console.error(full);
  logStream.write(full + "\n");
}

// ---------------------------------------------------------------------------
// Table migration order (FK dependency order — parents before children)
// ---------------------------------------------------------------------------
const TABLE_ORDER: string[] = [
  // Tier 0: independent
  "siteConfig",
  "plan",
  "user",
  // Tier 1: depend on User / Plan
  "bot",
  "subscription",
  "safetyState",
  // Tier 2: depend on User
  "customer",
  "document",
  "broadcast",
  "knowledgeGap",
  "apiCall",
  "safetyEvent",
  "safetyAudit",
  "metricEvent",
  "providerUsage",
  // Tier 3: depend on Bot
  "quickReply",
  "llmCache",
  // Tier 4: depend on Customer
  "customerMemory",
  "conversation",
  "order",
  "waConsent",
  // Tier 5: depend on Conversation / Order
  "message",
  "broadcastItem",
  "orderItem",
  "orderTimeline",
  // Tier 6: WhatsApp models
  "waTemplate",
  "waMessage",
  "waWebhookEvent",
  "waComplianceAudit",
];

// ---------------------------------------------------------------------------
// Migration runner
// ---------------------------------------------------------------------------

async function migrateTable(
  src: SqliteClient,
  dst: SqliteClient,
  tableName: string
): Promise<{ table: string; count: number; inserted: number; skipped: number }> {
  const srcRepo = (src as any)[tableName];
  const dstRepo = (dst as any)[tableName];

  if (!srcRepo || !dstRepo) {
    log(`  SKIP ${tableName} — model not found in Prisma client (check spelling)`);
    return { table: tableName, count: 0, inserted: 0, skipped: 0 };
  }

  const rows: unknown[] = await srcRepo.findMany();
  const count = rows.length;

  if (count === 0) {
    log(`  ${tableName}: 0 rows — skipped`);
    return { table: tableName, count: 0, inserted: 0, skipped: 0 };
  }

  if (DRY_RUN) {
    log(`  [DRY RUN] ${tableName}: ${count} rows — would insert`);
    return { table: tableName, count, inserted: 0, skipped: count };
  }

  // Insert in batches to avoid "too many parameters" errors in Postgres
  const CHUNK = 500;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    try {
      const result = await dstRepo.createMany({ data: chunk, skipDuplicates: true });
      inserted += result.count;
    } catch (e: any) {
      logError(`  ${tableName} chunk ${i}-${i + CHUNK} failed:`, e.message);
      throw e; // Halt — don't silently lose data
    }
  }

  const skipped = count - inserted;
  log(
    `  ${tableName}: ${count} rows → ${inserted} inserted, ${skipped} skipped (duplicates)`
  );
  return { table: tableName, count, inserted, skipped };
}

async function main(): Promise<void> {
  log("=".repeat(60));
  log("KEYONE Postgres Migration");
  log("DRY_RUN:", DRY_RUN ? "YES (no data will be written)" : "NO (live migration)");
  log("SOURCE: SQLite (DATABASE_URL)");
  log("TARGET: Postgres (POSTGRES_DIRECT_URL)");
  log("Log file:", logFile);
  log("=".repeat(60));

  // Source client — reads from SQLite
  const srcClient = new SqliteClient({
    datasources: { db: { url: process.env.DATABASE_URL } },
    log: [],
  });

  // Destination client — writes to Postgres
  // We reuse the same @prisma/client but override the DB URL at runtime.
  // This works because Prisma Client uses the connection string at connect
  // time, not at generate time, for non-migration operations.
  const dstClient = new SqliteClient({
    datasources: { db: { url: POSTGRES_URL } },
    log: [],
  }) as unknown as SqliteClient; // cast: structurally identical

  try {
    await srcClient.$connect();
    log("Connected to SQLite source.");

    await dstClient.$connect();
    log("Connected to Postgres destination.");

    const results: Array<{ table: string; count: number; inserted: number; skipped: number }> = [];

    for (const table of TABLE_ORDER) {
      log(`\nMigrating: ${table}`);
      try {
        const r = await migrateTable(srcClient, dstClient, table);
        results.push(r);
      } catch (e: any) {
        logError(`FATAL: migration of ${table} failed:`, e.message);
        logError("Halting migration. Fix the error and re-run (skipDuplicates=true is safe).");
        process.exit(1);
      }
    }

    // Summary
    log("\n" + "=".repeat(60));
    log("MIGRATION SUMMARY");
    log("=".repeat(60));
    let totalRows = 0;
    let totalInserted = 0;
    for (const r of results) {
      if (r.count > 0) {
        log(`  ${r.table.padEnd(28)} ${String(r.count).padStart(6)} rows  →  ${String(r.inserted).padStart(6)} inserted`);
        totalRows += r.count;
        totalInserted += r.inserted;
      }
    }
    log("-".repeat(60));
    log(`  TOTAL                        ${String(totalRows).padStart(6)} rows  →  ${String(totalInserted).padStart(6)} inserted`);
    log("=".repeat(60));

    if (DRY_RUN) {
      log("\n[DRY RUN] No data was written. Re-run without DRY_RUN=1 to migrate.");
    } else {
      log("\nMigration complete! Next steps:");
      log("  1. Verify row counts in Postgres match SQLite:");
      log("     Run:  npx prisma studio  (against each DB)");
      log("  2. Update .env: DATABASE_URL=<POSTGRES_URL>");
      log("  3. Run: npx prisma generate");
      log("  4. Run: npm run build && npm run start");
      log("  5. Smoke test the app.");
    }
  } finally {
    await srcClient.$disconnect();
    await dstClient.$disconnect();
    logStream.end();
  }
}

main().catch((err) => {
  logError("Unhandled error:", err);
  process.exit(1);
});
