// prisma/seed.js — run with: node prisma/seed.js
require('dotenv').config();
const { PrismaClient } = require('../src/generated/prisma');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database…');

  // ── Roles ──────────────────────────────────────────────────────────────────
  const admin      = await prisma.role.upsert({ where: { name: 'admin'      }, update: {}, create: { name: 'admin',      description: 'Full system access' } });
  const seller     = await prisma.role.upsert({ where: { name: 'seller'     }, update: {}, create: { name: 'seller',     description: 'Sales and limited access' } });
  const manager    = await prisma.role.upsert({ where: { name: 'manager'    }, update: {}, create: { name: 'manager',    description: 'Approve expenses, manage stock, view reports' } });
  await prisma.role.upsert({ where: { name: 'superadmin' }, update: {}, create: { name: 'superadmin', description: 'Platform owner — manages company accounts, no access to any company\'s business data' } });
  console.log('  ✓ Roles');

  // ── Permissions ────────────────────────────────────────────────────────────
  const permDefs = [
    { name: 'can_sell',             description: 'Create and manage sales' },
    { name: 'can_view_reports',     description: 'View analytics and reports' },
    { name: 'can_manage_stock',     description: 'Add and edit products/stock' },
    { name: 'can_manage_expenses',  description: 'Add and edit expenses' },
    { name: 'can_manage_users',     description: 'Create and manage users' },
    { name: 'can_view_audit_logs',  description: 'View system audit logs' },
    { name: 'can_export_reports',   description: 'Export reports to PDF/CSV' },
    { name: 'can_approve_expenses', description: 'Approve or reject expense edit requests' },
  ];
  for (const p of permDefs) {
    await prisma.permission.upsert({ where: { name: p.name }, update: {}, create: p });
  }
  const perms = await prisma.permission.findMany();
  const perm  = (name) => perms.find(p => p.name === name).id;
  console.log('  ✓ Permissions');

  // ── Role → Permission assignments ──────────────────────────────────────────
  // Admin: all permissions
  for (const p of perms) {
    await prisma.rolePermission.upsert({
      where:  { role_id_permission_id: { role_id: admin.id, permission_id: p.id } },
      update: {},
      create: { role_id: admin.id, permission_id: p.id },
    });
  }
  // Seller: sell + manage expenses
  for (const name of ['can_sell', 'can_manage_expenses']) {
    await prisma.rolePermission.upsert({
      where:  { role_id_permission_id: { role_id: seller.id, permission_id: perm(name) } },
      update: {},
      create: { role_id: seller.id, permission_id: perm(name) },
    });
  }
  // Manager: everything except user management
  for (const name of ['can_sell','can_view_reports','can_manage_stock','can_manage_expenses','can_view_audit_logs','can_export_reports','can_approve_expenses']) {
    await prisma.rolePermission.upsert({
      where:  { role_id_permission_id: { role_id: manager.id, permission_id: perm(name) } },
      update: {},
      create: { role_id: manager.id, permission_id: perm(name) },
    });
  }
  console.log('  ✓ Role permissions');

  // ── Expense categories ─────────────────────────────────────────────────────
  const categories = [
    { name: 'Rent',        description: 'Shop rent and lease',            color: '#6366f1' },
    { name: 'Salaries',    description: 'Staff salaries and wages',       color: '#8b5cf6' },
    { name: 'Electricity', description: 'Power and utility bills',        color: '#f59e0b' },
    { name: 'Transport',   description: 'Delivery and logistics',         color: '#10b981' },
    { name: 'Maintenance', description: 'Equipment and shop maintenance', color: '#ef4444' },
    { name: 'Marketing',   description: 'Advertising and promotions',     color: '#3b82f6' },
    { name: 'Other',       description: 'Miscellaneous expenses',         color: '#6b7280' },
  ];
  for (const c of categories) {
    await prisma.expenseCategory.upsert({ where: { name: c.name }, update: {}, create: c });
  }
  console.log('  ✓ Expense categories');

  // ── Admin users ────────────────────────────────────────────────────────────
  const adminUsers = [
    {
      name:          'System Admin',
      email:         'admin@electroshop.com',
      password_hash: '$2a$12$B3FxFRFi2Jt/cJuPKrSKTOPU1Upt1rna9N71HFK3IZr2IRnkM61H.',
    },
    {
      name:          'Tyla',
      email:         'tyla@iwacuflix.com',
      password_hash: '$2a$12$uLZqFY5ProHHKt3wzl3.y.EHhbPrGwoB24BnRMhjMcCR8RJnkkkEa',
    },
  ];
  for (const u of adminUsers) {
    const exists = await prisma.user.findUnique({ where: { email: u.email } });
    if (!exists) {
      await prisma.user.create({ data: { ...u, role_id: admin.id, company_id: 1, branch_id: 1 } });
      console.log(`  ✓ Admin created: ${u.email}`);
    } else {
      console.log(`  – Already exists, skipped: ${u.email}`);
    }
  }

  console.log('\n✅ Seed complete.');
}

main()
  .catch(e => { console.error('Seed failed:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
