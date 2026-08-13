// One-time ETL: import the old itc/tylaShop production data (a different,
// unrelated schema — camelCase, no company concept, no branch scoping) into
// this codebase's multi-tenant schema as one new Company.
//
// Usage:
//   SOURCE_HOST=127.0.0.1 SOURCE_PORT=13306 SOURCE_USER=tylauser \
//   SOURCE_PASSWORD=*** SOURCE_DATABASE=tyla_shop_mis \
//   node scripts/migrate-production-import.js
//
// SOURCE_* must point at a reachable MySQL host running the OLD schema
// (e.g. an SSH tunnel to the production box). TARGET is read from this
// project's own DATABASE_URL (.env) — defaults to local dev.
//
// Everything runs inside one transaction on the target; nothing is written
// to the source. Safe to re-run against an empty target — NOT idempotent
// against a target that already has this company (would create a duplicate).

require('dotenv').config();
const mysql = require('mysql2/promise');

const COMPANY_NAME = process.env.IMPORT_COMPANY_NAME || 'Tyla Shop (Imported)';
const COMPANY_SLUG = process.env.IMPORT_COMPANY_SLUG || 'tyla-shop-imported';
const BRANCH_NAME  = process.env.IMPORT_BRANCH_NAME  || 'Main Branch';

// Every permission name here already matches 1:1 between the old schema's
// `permissions` table and this codebase's seeded catalog (deliberately
// aligned) — CoOpera permissions are intentionally excluded (feature retired).
const EXCLUDED_PERMISSION_MODULES = ['Co-opera'];

// Batched multi-row INSERT — drastically fewer round trips than one INSERT per row.
// Only for tables nothing downstream needs the generated id from.
async function batchInsert(conn, sql, rows, chunkSize = 300) {
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const placeholders = chunk.map(() => `(${rows[0].map(() => '?').join(',')})`).join(',');
    await conn.query(`${sql} VALUES ${placeholders}`, chunk.flat());
  }
}

function parseTargetUrl(url) {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: u.port ? parseInt(u.port) : 3306,
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.replace('/', ''),
  };
}

async function main() {
  const sourceConfig = {
    host: process.env.SOURCE_HOST,
    port: parseInt(process.env.SOURCE_PORT || '3306'),
    user: process.env.SOURCE_USER,
    password: process.env.SOURCE_PASSWORD,
    database: process.env.SOURCE_DATABASE,
  };
  if (!sourceConfig.host || !sourceConfig.user || !sourceConfig.database) {
    console.error('Missing SOURCE_HOST / SOURCE_USER / SOURCE_DATABASE env vars.');
    process.exit(1);
  }

  const source = await mysql.createConnection(sourceConfig);
  const target = await mysql.createConnection(parseTargetUrl(process.env.DATABASE_URL));
  console.log('Connected to source (read-only) and target.');

  await target.beginTransaction();
  try {
    // ── 1. Company + Branch ────────────────────────────────────────────────
    const [existing] = await target.query('SELECT id FROM companies WHERE slug = ?', [COMPANY_SLUG]);
    if (existing.length) {
      throw new Error(`Company slug "${COMPANY_SLUG}" already exists (id ${existing[0].id}) — aborting to avoid duplicate import. Set IMPORT_COMPANY_SLUG to a new value, or remove the existing company first.`);
    }
    const [companyRes] = await target.query(
      'INSERT INTO companies (name, slug, is_active, created_at) VALUES (?, ?, true, NOW())',
      [COMPANY_NAME, COMPANY_SLUG]
    );
    const companyId = companyRes.insertId;
    const [branchRes] = await target.query(
      'INSERT INTO branches (company_id, name, is_active, created_at) VALUES (?, ?, true, NOW())',
      [companyId, BRANCH_NAME]
    );
    const branchId = branchRes.insertId;
    console.log(`✓ Company #${companyId} "${COMPANY_NAME}", Branch #${branchId}`);

    // ── 2. Role + Permission lookups (already seeded platform-wide) ────────
    const [roleRows] = await target.query('SELECT id, name FROM roles');
    const roleIdByName = Object.fromEntries(roleRows.map(r => [r.name.toLowerCase(), r.id]));

    const [permRows] = await target.query('SELECT id, name FROM permissions');
    const permIdByName = Object.fromEntries(permRows.map(p => [p.name, p.id]));

    // ── 3. Users ─────────────────────────────────────────────────────────
    const [srcRoles] = await source.query('SELECT id, name FROM roles');
    const srcRoleNameById = Object.fromEntries(srcRoles.map(r => [r.id, r.name.toLowerCase()]));

    const [srcUsers] = await source.query('SELECT * FROM users ORDER BY id');
    const userIdMap = {}; // source id -> target id
    for (const u of srcUsers) {
      const roleName = srcRoleNameById[u.roleId];
      const roleId = roleIdByName[roleName];
      if (!roleId) throw new Error(`Unknown source role "${roleName}" for user ${u.email}`);

      const [res] = await target.query(
        `INSERT INTO users (name, email, password_hash, role_id, company_id, branch_id, is_active, phone, force_password_change, last_login, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          u.fullName, u.email.toLowerCase(), u.password, roleId, companyId, branchId,
          !!u.isActive, u.phoneNumber || null, !!u.forcePasswordChange, u.lastLogin,
          u.createdAt, u.updatedAt,
        ]
      );
      userIdMap[u.id] = res.insertId;
    }
    console.log(`✓ Users: ${srcUsers.length}`);

    // ── 4. Per-user permission grants ───────────────────────────────────────
    const [srcUserPerms] = await source.query(`
      SELECT up.userId, p.name
      FROM user_permissions up
      JOIN permissions p ON p.id = up.permissionId
      WHERE p.module NOT IN (${EXCLUDED_PERMISSION_MODULES.map(() => '?').join(',')})
    `, EXCLUDED_PERMISSION_MODULES);
    let userPermCount = 0;
    for (const up of srcUserPerms) {
      const targetUserId = userIdMap[up.userId];
      const targetPermId = permIdByName[up.name];
      if (!targetUserId || !targetPermId) continue; // skip anything we can't map
      await target.query(
        `INSERT IGNORE INTO user_permissions (user_id, permission_id, granted_by, granted_at) VALUES (?, ?, ?, NOW())`,
        [targetUserId, targetPermId, targetUserId]
      );
      userPermCount++;
    }
    console.log(`✓ User permission grants: ${userPermCount}`);

    // ── 5. Product categories ───────────────────────────────────────────────
    const [srcCategories] = await source.query('SELECT * FROM categories ORDER BY id');
    const categoryIdMap = {};
    for (const c of srcCategories) {
      const [res] = await target.query(
        'INSERT INTO categories (name, description, is_active, created_at) VALUES (?, ?, ?, ?)',
        [c.name, c.description, !!c.isActive, c.createdAt]
      );
      categoryIdMap[c.id] = res.insertId;
    }
    console.log(`✓ Categories: ${srcCategories.length}`);

    // ── 6. Products ──────────────────────────────────────────────────────
    const [srcProducts] = await source.query('SELECT * FROM products ORDER BY id');
    const productIdMap = {};
    const productNameById = {};
    // pick a single "creator" for imported products: the first admin user
    const importAdminId = Object.values(userIdMap)[0];
    for (const p of srcProducts) {
      const [res] = await target.query(
        `INSERT INTO products (name, category_id, quantity, wholesale_price, selling_price, low_stock_threshold, unit, is_active, branch_id, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'piece', ?, ?, ?, ?, ?)`,
        [
          p.name, categoryIdMap[p.categoryId] || null, p.quantity, p.wholesalePrice, p.sellingPrice,
          p.lowStockThreshold, !!p.isActive, branchId, importAdminId, p.createdAt, p.updatedAt,
        ]
      );
      productIdMap[p.id] = res.insertId;
      productNameById[p.id] = p.name;
    }
    console.log(`✓ Products: ${srcProducts.length}`);

    // ── 7. Stock movements — reconstruct before/after balances chronologically ─
    const [srcMovements] = await source.query('SELECT * FROM stock_movements ORDER BY productId, createdAt, id');
    const runningQty = {}; // source product id -> running balance
    const movementRows = [];
    for (const m of srcMovements) {
      const before = runningQty[m.productId] || 0;
      let after;
      if (m.type === 'OUT') after = before - m.quantity;
      else after = before + m.quantity; // IN, RETURN, ADJUSTMENT treated as additive (no negative deltas observed in source)
      runningQty[m.productId] = after;

      const targetProductId = productIdMap[m.productId];
      const targetUserId = userIdMap[m.userId];
      if (!targetProductId || !targetUserId) continue;

      movementRows.push([targetProductId, m.type, m.quantity, before, after, m.reference || null, m.reason || null, targetUserId, m.createdAt]);
    }
    if (movementRows.length) {
      await batchInsert(target,
        'INSERT INTO stock_movements (product_id, movement_type, quantity, quantity_before, quantity_after, reference_type, notes, performed_by, created_at)',
        movementRows);
    }
    console.log(`✓ Stock movements: ${movementRows.length} (before/after balances reconstructed — not originally tracked in source)`);

    // ── 8. Sales + sale items ───────────────────────────────────────────────
    const [srcSales] = await source.query('SELECT * FROM sales ORDER BY id');
    const saleIdMap = {};
    for (const s of srcSales) {
      const targetSellerId = userIdMap[s.userId];
      if (!targetSellerId) continue;
      const [res] = await target.query(
        `INSERT INTO sales (invoice_number, seller_id, branch_id, subtotal, discount, total_amount, payment_method, payment_status, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, 0, ?, 'CASH', 'PAID', ?, ?, ?)`,
        [s.invoiceNumber, targetSellerId, branchId, s.totalAmount, s.totalAmount, s.notes || null, s.createdAt, s.updatedAt]
      );
      saleIdMap[s.id] = res.insertId;
    }
    console.log(`✓ Sales: ${Object.keys(saleIdMap).length} (payment method/status not tracked in source — defaulted to CASH/PAID)`);

    const [srcSaleItems] = await source.query('SELECT * FROM sale_items ORDER BY id');
    const saleItemRows = [];
    for (const si of srcSaleItems) {
      const targetSaleId = saleIdMap[si.saleId];
      const targetProductId = productIdMap[si.productId];
      if (!targetSaleId) continue;
      saleItemRows.push([targetSaleId, targetProductId, productNameById[si.productId] || 'Unknown product', si.quantity, si.unitPrice, si.wholesalePrice, 0, si.totalPrice]);
    }
    if (saleItemRows.length) {
      await batchInsert(target,
        'INSERT INTO sale_items (sale_id, product_id, product_name, quantity, selling_price, cost_price, discount, line_total)',
        saleItemRows);
    }
    console.log(`✓ Sale items: ${saleItemRows.length}`);

    // ── 9. Expense categories + expenses ────────────────────────────────────
    const [srcExpCategories] = await source.query('SELECT * FROM expense_categories ORDER BY id');
    const expCategoryIdMap = {};
    for (const ec of srcExpCategories) {
      const [existingEc] = await target.query('SELECT id FROM expense_categories WHERE name = ?', [ec.name]);
      if (existingEc.length) {
        expCategoryIdMap[ec.id] = existingEc[0].id; // expense_categories are global, not per-company — reuse if name matches
      } else {
        const [res] = await target.query(
          'INSERT INTO expense_categories (name, description) VALUES (?, ?)',
          [ec.name, ec.description]
        );
        expCategoryIdMap[ec.id] = res.insertId;
      }
    }
    console.log(`✓ Expense categories: ${srcExpCategories.length} (reused existing global category where name matched)`);

    const [srcExpenses] = await source.query("SELECT * FROM expenses WHERE status = 'APPROVED' ORDER BY id");
    const expenseRows = [];
    for (const e of srcExpenses) {
      const targetCreator = userIdMap[e.userId];
      if (!targetCreator) continue;
      expenseRows.push([
        e.description.slice(0, 200), e.amount, expCategoryIdMap[e.categoryId] || null, branchId,
        e.date, e.description, targetCreator, e.createdAt, e.updatedAt,
      ]);
    }
    if (expenseRows.length) {
      await batchInsert(target,
        'INSERT INTO expenses (title, amount, category_id, branch_id, expense_date, description, created_by, created_at, updated_at)',
        expenseRows);
    }
    console.log(`✓ Expenses: ${expenseRows.length} (only APPROVED status migrated — source had no PENDING/REJECTED at time of export)`);

    // ── 10. Capital injections ──────────────────────────────────────────────
    const [srcCapital] = await source.query('SELECT * FROM capital_injections ORDER BY id');
    const capitalRows = [];
    for (const c of srcCapital) {
      const targetAdder = userIdMap[c.addedBy];
      if (!targetAdder) continue;
      capitalRows.push([c.amount, c.description, c.date, branchId, targetAdder, c.createdAt]);
    }
    if (capitalRows.length) {
      await batchInsert(target,
        'INSERT INTO capital_injections (amount, description, date, branch_id, added_by, created_at)',
        capitalRows);
    }
    console.log(`✓ Capital injections: ${capitalRows.length}`);

    // ── 11. Audit logs (historical record only) ─────────────────────────────
    const [srcAudit] = await source.query('SELECT * FROM audit_logs ORDER BY id');
    const auditRows = [];
    for (const a of srcAudit) {
      const targetUserId = a.userId ? (userIdMap[a.userId] || null) : null;
      auditRows.push([
        targetUserId, null, branchId, a.action, a.module, a.entityType, a.entityId,
        a.oldValues ? JSON.stringify(a.oldValues) : null,
        a.newValues ? JSON.stringify(a.newValues) : null,
        a.ipAddress, a.userAgent, a.createdAt,
      ]);
    }
    if (auditRows.length) {
      await batchInsert(target,
        'INSERT INTO audit_logs (user_id, user_name, branch_id, action, module, entity_type, entity_id, old_values, new_values, ip_address, user_agent, created_at)',
        auditRows);
    }
    console.log(`✓ Audit logs: ${auditRows.length}`);

    await target.commit();
    console.log('\n✅ Import committed successfully.');
    console.log(`   Company: "${COMPANY_NAME}" (slug: ${COMPANY_SLUG}), id ${companyId}`);
  } catch (err) {
    await target.rollback();
    console.error('\n❌ Import failed — transaction rolled back, target database unchanged.');
    console.error(err);
    process.exit(1);
  } finally {
    await source.end();
    await target.end();
  }
}

main();
