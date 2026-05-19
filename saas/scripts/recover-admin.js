/**
 * recover-admin.js
 * Run on the server: node scripts/recover-admin.js
 *
 * Checks the SQLite DB and creates/resets the admin user directly.
 * No HTTP calls needed — works even if the app is down.
 */

const path = require("path");
const { execSync } = require("child_process");

// ── Config — change these if needed ──────────────────────────────────────────
const ADMIN_EMAIL    = "admin@keyone1.com";
const ADMIN_PASSWORD = "Admin@Keyone2026";
const ADMIN_NAME     = "Admin";
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  // Load env
  require("dotenv").config({ path: path.join(__dirname, "../.env") });

  const { PrismaClient } = require("@prisma/client");
  const bcrypt = require("bcryptjs");

  const prisma = new PrismaClient();

  console.log("\n══════════════════════════════════════════");
  console.log("  KEYONE Admin Recovery Script");
  console.log("══════════════════════════════════════════\n");

  // 1. Show DB path
  const dbUrl = process.env.DATABASE_URL || "file:./dev.db";
  console.log(`📁 Database URL: ${dbUrl}`);

  // 2. Count all users
  const total = await prisma.user.count();
  console.log(`👥 Total users in DB: ${total}`);

  // 3. List admins
  const admins = await prisma.user.findMany({
    where: { role: "admin" },
    select: { id: true, email: true, createdAt: true },
  });
  console.log(`🛡️  Admin accounts: ${admins.length}`);
  admins.forEach(a => console.log(`   → ${a.email} (${a.id})`));

  // 4. List all users (first 20)
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { id: true, email: true, role: true, createdAt: true,
              suspended: true, subscription: { select: { status: true } } },
  });
  console.log(`\n📋 Recent users (last 20):`);
  users.forEach(u => {
    const sub = u.subscription?.status || "no-sub";
    const flag = u.suspended ? "🚫" : u.role === "admin" ? "🛡️" : "👤";
    console.log(`   ${flag} ${u.email} | ${u.role} | ${sub} | ${u.createdAt.toISOString().slice(0,10)}`);
  });

  // 5. Create / reset admin
  console.log(`\n🔧 Setting up admin: ${ADMIN_EMAIL}`);
  const hash = await bcrypt.hash(ADMIN_PASSWORD, 10);

  const existing = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } });

  if (existing) {
    await prisma.user.update({
      where: { email: ADMIN_EMAIL },
      data: { role: "admin", passwordHash: hash, suspended: false },
    });
    console.log(`✅ Updated existing user → role=admin, password reset`);
  } else {
    await prisma.user.create({
      data: {
        email: ADMIN_EMAIL,
        passwordHash: hash,
        name: ADMIN_NAME,
        role: "admin",
        bot: { create: {} },
      },
    });
    console.log(`✅ Created new admin user`);
  }

  // 6. Verify
  const verify = await prisma.user.findUnique({
    where: { email: ADMIN_EMAIL },
    select: { id: true, email: true, role: true, suspended: true },
  });
  console.log(`\n🔍 Verification:`);
  console.log(`   id:        ${verify.id}`);
  console.log(`   email:     ${verify.email}`);
  console.log(`   role:      ${verify.role}`);
  console.log(`   suspended: ${verify.suspended}`);
  console.log(`\n✅ Done! Login at /login with:`);
  console.log(`   Email:    ${ADMIN_EMAIL}`);
  console.log(`   Password: ${ADMIN_PASSWORD}`);
  console.log("══════════════════════════════════════════\n");

  await prisma.$disconnect();
}

main().catch(e => {
  console.error("❌ Error:", e.message);
  process.exit(1);
});
