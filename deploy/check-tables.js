// Verify new Prisma tables exist in production DB
// Usage: node check-tables.js
const path = require('path');
const dbPath = path.join('C:', 'app', 'saas', 'prisma', 'dev.db');

let Database;
try {
  Database = require(path.join('C:', 'app', 'saas', 'node_modules', 'better-sqlite3'));
} catch {
  // fallback: try to get table list via Prisma client
  const { PrismaClient } = require(path.join('C:', 'app', 'saas', 'node_modules', '.prisma', 'client'));
  const prisma = new PrismaClient();
  prisma.$queryRawUnsafe("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    .then(rows => {
      const names = rows.map(r => r.name);
      checkTables(names);
    })
    .finally(() => prisma.$disconnect());
  return;
}

const db = new Database(dbPath, { readonly: true });
const rows = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
const names = rows.map(r => r.name);
db.close();
checkTables(names);

function checkTables(names) {
  const required = [
    'EscalationTicket',
    'EscalationTimeline',
    'UsageLedger',
    'UsageDailySnapshot',
    'FollowUpTask',
    'DailyReportDelivery',
    'ProtectionLog',
    'BanEvent',
    'Conversation',
    'Customer',
    'Message',
    'Order',
    'User',
    'Bot',
    'Subscription',
  ];
  let passed = 0;
  let failed = 0;
  for (const tbl of required) {
    const found = names.includes(tbl);
    console.log((found ? '[OK]  ' : '[MISS]') + ' ' + tbl);
    if (found) passed++; else failed++;
  }
  console.log('\nAll tables in DB:', names.join(', '));
  console.log(`\nResult: ${passed} OK, ${failed} MISSING`);
  process.exit(failed > 0 ? 1 : 0);
}
