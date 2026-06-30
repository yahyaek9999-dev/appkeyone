// Database client singleton.
//
// Supports:
//   - SQLite (current production) with optional WAL mode for 3-5× write throughput
//   - PostgreSQL (migration target) with Supabase dual-URL pattern
//
// WAL mode: set PRAGMAS_SKIP=true or DATABASE_WAL=false to disable.
// Connection pooling: set DATABASE_DIRECT_URL for Supabase direct connection.
// Both PRAGMAs are silently ignored by PostgreSQL (no-op error catch).

import { PrismaClient } from "@prisma/client";

// BigInt JSON serialization. The Meta usage/invoice aggregates use BigInt
// columns (overflow-safe micro-USD sums); JSON.stringify throws on BigInt
// without this. Additive, global, idempotent.
if (typeof (BigInt.prototype as unknown as { toJSON?: () => string }).toJSON !== "function") {
  (BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function () {
    return this.toString();
  };
}

const globalForPrisma = global as unknown as { prisma?: PrismaClient };

function createClient(): PrismaClient {
  const url = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;

  const client = new PrismaClient(
    url
      ? {
          datasources: {
            db: { url },
          },
        }
      : undefined,
  );

  // Enable SQLite WAL mode for concurrent read/write performance.
  // Adds 3-5× write throughput; silently ignored by PostgreSQL.
  if (process.env.DATABASE_WAL !== "false" && process.env.PRAGMAS_SKIP !== "true") {
    client
      .$executeRawUnsafe("PRAGMA journal_mode=WAL")
      .catch(() => {
        /* ignored — not SQLite */
      });
    client
      .$executeRawUnsafe("PRAGMA synchronous=NORMAL")
      .catch(() => {
        /* ignored — not SQLite */
      });
    client
      .$executeRawUnsafe("PRAGMA busy_timeout=5000")
      .catch(() => {
        /* ignored — not SQLite */
      });
  }

  return client;
}

export const prisma = globalForPrisma.prisma ?? createClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

/**
 * Returns a Date object suitable for raw SQL query parameters.
 *
 * On SQLite: Prisma's raw adapter converts Date → INTEGER epoch-ms.
 * On PostgreSQL: Prisma's raw adapter converts Date → ISO TIMESTAMP.
 * Using Date objects instead of .getTime() or .toISOString() ensures
 * compatibility across both database backends.
 *
 * Usage:
 *   prisma.$queryRawUnsafe(`SELECT ... WHERE createdAt >= ?`, userId, rawDate(someDate))
 */
export function rawDate(d: Date): Date {
  return d;
}

