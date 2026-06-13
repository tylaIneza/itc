const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

const PERMISSIONS = [
  // Sales
  { name: 'create_sale', module: 'Sales', description: 'Create Sale' },
  { name: 'edit_sale', module: 'Sales', description: 'Edit Sale' },
  { name: 'delete_sale', module: 'Sales', description: 'Delete Sale' },
  { name: 'view_sales', module: 'Sales', description: 'View Sales' },
  // Products
  { name: 'create_product', module: 'Products', description: 'Create Product' },
  { name: 'edit_product', module: 'Products', description: 'Edit Product' },
  { name: 'delete_product', module: 'Products', description: 'Delete Product' },
  { name: 'adjust_stock', module: 'Products', description: 'Adjust Stock' },
  { name: 'view_stock', module: 'Products', description: 'View Stock' },
  // Expenses
  { name: 'create_expense', module: 'Expenses', description: 'Create Expense' },
  { name: 'edit_expense', module: 'Expenses', description: 'Edit Expense' },
  { name: 'delete_expense', module: 'Expenses', description: 'Delete Expense' },
  { name: 'approve_expense_requests', module: 'Expenses', description: 'Approve Expense Requests' },
  // Co-opera
  { name: 'record_co_opera', module: 'Co-opera', description: 'Record Co-opera' },
  { name: 'edit_co_opera_amount', module: 'Co-opera', description: 'Edit Co-opera Amount' },
  { name: 'view_co_opera_history', module: 'Co-opera', description: 'View Co-opera History' },
  { name: 'fix_co_opera_records', module: 'Co-opera', description: 'Fix Co-opera Records' },
  // Reports
  { name: 'view_reports', module: 'Reports', description: 'View Reports' },
  { name: 'export_pdf', module: 'Reports', description: 'Export PDF' },
  { name: 'export_excel', module: 'Reports', description: 'Export Excel' },
  // Users
  { name: 'create_users', module: 'Users', description: 'Create Users' },
  { name: 'edit_users', module: 'Users', description: 'Edit Users' },
  { name: 'deactivate_users', module: 'Users', description: 'Deactivate Users' },
  { name: 'manage_permissions', module: 'Users', description: 'Manage Permissions' },
  // Capital
  { name: 'add_capital_injection', module: 'Capital', description: 'Add Capital Injection' },
  // Audit Logs
  { name: 'view_audit_logs', module: 'Audit Logs', description: 'View Audit Logs' },
  // Settings
  { name: 'manage_settings', module: 'Settings', description: 'Manage Settings' },
];

async function main() {
  console.log('🌱 Starting database seed...');

  // Create branch
  const branch = await prisma.branch.upsert({
    where: { name: 'Main Branch' },
    update: {},
    create: { name: 'Main Branch', location: 'Kigali, Rwanda' },
  });
  console.log('✅ Branch created');

  // Create roles
  const adminRole = await prisma.role.upsert({
    where: { name: 'Admin' },
    update: {},
    create: { name: 'Admin', description: 'System Administrator' },
  });
  const managerRole = await prisma.role.upsert({
    where: { name: 'Manager' },
    update: {},
    create: { name: 'Manager', description: 'Store Manager' },
  });
  const sellerRole = await prisma.role.upsert({
    where: { name: 'Seller' },
    update: {},
    create: { name: 'Seller', description: 'Sales Person' },
  });
  console.log('✅ Roles created');

  // Create permissions
  for (const perm of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { name: perm.name },
      update: {},
      create: perm,
    });
  }
  console.log('✅ Permissions created');

  // Create admin user
  const hashedPassword = await bcrypt.hash('Admin@123', 12);
  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@tylaShop.com' },
    update: {},
    create: {
      fullName: 'Tyla Admin',
      email: 'admin@tylaShop.com',
      phoneNumber: '+250780000001',
      password: hashedPassword,
      roleId: adminRole.id,
      branchId: branch.id,
      isActive: true,
      forcePasswordChange: false,
    },
  });
  console.log('✅ Admin user created');

  // Assign all permissions to admin
  const allPermissions = await prisma.permission.findMany();
  for (const perm of allPermissions) {
    await prisma.userPermission.upsert({
      where: { userId_permissionId: { userId: adminUser.id, permissionId: perm.id } },
      update: {},
      create: { userId: adminUser.id, permissionId: perm.id, grantedBy: adminUser.id },
    });
  }
  console.log('✅ Admin permissions assigned');

  // Create Co-opera config
  await prisma.coOperaConfig.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      targetAmount: 17500,
      minimumAmount: 17500,
      startDate: new Date('2026-06-14'),
    },
  });
  console.log('✅ Co-opera config created');

  // Create sample categories
  const categories = ['Smartphones', 'Laptops', 'Tablets', 'Accessories', 'Audio', 'Cameras', 'Gaming'];
  for (const cat of categories) {
    await prisma.category.upsert({
      where: { name: cat },
      update: {},
      create: { name: cat },
    });
  }
  console.log('✅ Categories created');

  // Create expense categories
  const expenseCategories = ['Rent', 'Utilities', 'Salaries', 'Transport', 'Marketing', 'Supplies', 'Maintenance', 'Other'];
  for (const cat of expenseCategories) {
    await prisma.expenseCategory.upsert({
      where: { name: cat },
      update: {},
      create: { name: cat },
    });
  }
  console.log('✅ Expense categories created');

  console.log('\n🎉 Database seeded successfully!');
  console.log('📧 Admin Email: admin@tylaShop.com');
  console.log('🔑 Admin Password: Admin@123');
  console.log('⚠️  Please change the admin password after first login!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
