const express = require('express');
const router = express.Router();
const prisma = require('../utils/prisma');
const { authenticate, hasPermission } = require('../middleware/auth');
const { createAuditLog } = require('../utils/audit');
const { successResponse, errorResponse } = require('../utils/helpers');

// GET /api/products
router.get('/', authenticate, async (req, res) => {
  try {
    const { search, categoryId, isActive, lowStock, page = 1, limit = 50 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const where = {};
    if (search) where.name = { contains: search };
    if (categoryId) where.categoryId = parseInt(categoryId);
    if (isActive !== undefined) where.isActive = isActive === 'true';
    // lowStock: fetch all and filter in JS (Prisma can't compare two columns in where)

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        include: { category: true },
        skip,
        take: parseInt(limit),
        orderBy: { name: 'asc' },
      }),
      prisma.product.count({ where }),
    ]);

    // Mark low stock, then optionally filter
    let enriched = products.map(p => ({ ...p, isLowStock: p.quantity <= p.lowStockThreshold }));
    if (lowStock === 'true') enriched = enriched.filter(p => p.isLowStock);
    return successResponse(res, { products: enriched, total: lowStock === 'true' ? enriched.length : total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    return errorResponse(res, 'Failed to fetch products', 500);
  }
});

// GET /api/products/low-stock
router.get('/low-stock', authenticate, async (req, res) => {
  try {
    const products = await prisma.product.findMany({
      where: { isActive: true },
      include: { category: true },
    });
    const lowStock = products.filter(p => p.quantity <= p.lowStockThreshold);
    return successResponse(res, lowStock);
  } catch (err) {
    return errorResponse(res, 'Failed to fetch low stock products', 500);
  }
});

// POST /api/products
router.post('/', authenticate, hasPermission('create_product'), async (req, res) => {
  try {
    const { name, categoryId, wholesalePrice, sellingPrice, quantity, lowStockThreshold } = req.body;
    if (!name || !categoryId || !wholesalePrice || !sellingPrice) {
      return errorResponse(res, 'Missing required fields', 400);
    }
    if (parseFloat(sellingPrice) < parseFloat(wholesalePrice)) {
      return errorResponse(res, 'Selling price cannot be below wholesale price', 400);
    }

    const product = await prisma.product.create({
      data: {
        name,
        categoryId: parseInt(categoryId),
        wholesalePrice: parseFloat(wholesalePrice),
        sellingPrice: parseFloat(sellingPrice),
        quantity: parseInt(quantity || 0),
        lowStockThreshold: parseInt(lowStockThreshold || 5),
      },
      include: { category: true },
    });

    if (parseInt(quantity || 0) > 0) {
      await prisma.stockMovement.create({
        data: {
          productId: product.id,
          userId: req.userId,
          type: 'IN',
          quantity: parseInt(quantity),
          reason: 'Initial stock',
        },
      });
    }

    await createAuditLog({
      userId: req.userId,
      action: 'CREATE_PRODUCT',
      module: 'Products',
      entityId: product.id,
      entityType: 'Product',
      newValues: { name, wholesalePrice, sellingPrice, quantity },
      ipAddress: req.ip,
    });

    if (global.io) global.io.to('all-users').emit('product:created', { product });
    return successResponse(res, product, 'Product created successfully', 201);
  } catch (err) {
    return errorResponse(res, 'Failed to create product', 500);
  }
});

// POST /api/products/import  (must be before /:id)
router.post('/import', authenticate, hasPermission('create_product'), async (req, res) => {
  try {
    const { rows } = req.body;
    if (!Array.isArray(rows) || rows.length === 0) {
      return errorResponse(res, 'No data provided', 400);
    }

    const [categories, existingProducts] = await Promise.all([
      prisma.category.findMany(),
      prisma.product.findMany({ select: { id: true, name: true, quantity: true } }),
    ]);

    const productMap = new Map(existingProducts.map(p => [p.name.toLowerCase().trim(), p]));
    const results = { created: 0, updated: 0, errors: [] };

    for (const row of rows) {
      const name = String(row.name || '').trim();
      if (!name) continue;

      const quantity = parseInt(row.quantity) || 0;
      const lowStockThreshold = parseInt(row.low_stock_threshold) || 5;
      const existing = productMap.get(name.toLowerCase());

      if (existing) {
        await prisma.product.update({
          where: { id: existing.id },
          data: { quantity, lowStockThreshold },
        });
        await prisma.stockMovement.create({
          data: {
            productId: existing.id,
            userId: req.userId,
            type: 'ADJUSTMENT',
            quantity: Math.abs(quantity - existing.quantity),
            reason: 'Excel import',
          },
        });
        results.updated++;
      } else {
        const wholesalePrice = parseFloat(row.wholesale_price) || 0;
        const sellingPrice = parseFloat(row.selling_price) || wholesalePrice;
        const categoryName = String(row.category || '').trim().toLowerCase();
        const category = categories.find(c => c.name.toLowerCase() === categoryName) || categories[0];

        if (!category) {
          results.errors.push(`"${name}": no category found`);
          continue;
        }

        const product = await prisma.product.create({
          data: { name, categoryId: category.id, wholesalePrice, sellingPrice, quantity, lowStockThreshold },
        });

        if (quantity > 0) {
          await prisma.stockMovement.create({
            data: { productId: product.id, userId: req.userId, type: 'IN', quantity, reason: 'Excel import' },
          });
        }
        results.created++;
      }
    }

    await createAuditLog({
      userId: req.userId,
      action: 'IMPORT_PRODUCTS',
      module: 'Products',
      newValues: results,
      ipAddress: req.ip,
    });

    if (global.io) global.io.to('all-users').emit('product:created', {});
    return successResponse(res, results, `${results.created} created, ${results.updated} updated`);
  } catch (err) {
    console.error('Import error:', err);
    return errorResponse(res, 'Import failed', 500);
  }
});

// GET /api/products/:id
router.get('/:id', authenticate, async (req, res) => {
  try {
    const product = await prisma.product.findUnique({
      where: { id: parseInt(req.params.id) },
      include: {
        category: true,
        stockMovements: {
          include: { user: { select: { fullName: true } } },
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
      },
    });
    if (!product) return errorResponse(res, 'Product not found', 404);
    return successResponse(res, product);
  } catch (err) {
    return errorResponse(res, 'Failed to fetch product', 500);
  }
});

// PUT /api/products/:id
router.put('/:id', authenticate, hasPermission('edit_product'), async (req, res) => {
  try {
    const productId = parseInt(req.params.id);
    const { name, categoryId, wholesalePrice, sellingPrice, lowStockThreshold, isActive } = req.body;

    if (wholesalePrice && sellingPrice && parseFloat(sellingPrice) < parseFloat(wholesalePrice)) {
      return errorResponse(res, 'Selling price cannot be below wholesale price', 400);
    }

    const old = await prisma.product.findUnique({ where: { id: productId } });
    if (!old) return errorResponse(res, 'Product not found', 404);

    const product = await prisma.product.update({
      where: { id: productId },
      data: {
        ...(name && { name }),
        ...(categoryId && { categoryId: parseInt(categoryId) }),
        ...(wholesalePrice && { wholesalePrice: parseFloat(wholesalePrice) }),
        ...(sellingPrice && { sellingPrice: parseFloat(sellingPrice) }),
        ...(lowStockThreshold !== undefined && { lowStockThreshold: parseInt(lowStockThreshold) }),
        ...(isActive !== undefined && { isActive }),
      },
      include: { category: true },
    });

    await createAuditLog({
      userId: req.userId,
      action: 'EDIT_PRODUCT',
      module: 'Products',
      entityId: productId,
      entityType: 'Product',
      oldValues: { name: old.name, sellingPrice: old.sellingPrice },
      newValues: { name: product.name, sellingPrice: product.sellingPrice },
      ipAddress: req.ip,
    });

    if (global.io) global.io.to('all-users').emit('product:updated', { product });
    return successResponse(res, product, 'Product updated successfully');
  } catch (err) {
    return errorResponse(res, 'Failed to update product', 500);
  }
});

// POST /api/products/:id/adjust-stock
router.post('/:id/adjust-stock', authenticate, hasPermission('adjust_stock'), async (req, res) => {
  try {
    const productId = parseInt(req.params.id);
    const { type, quantity, reason } = req.body;
    if (!type || !quantity || !reason) {
      return errorResponse(res, 'Type, quantity, and reason are required', 400);
    }

    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) return errorResponse(res, 'Product not found', 404);

    let newQty = product.quantity;
    if (type === 'IN') newQty += parseInt(quantity);
    else if (type === 'OUT') newQty -= parseInt(quantity);
    else if (type === 'ADJUSTMENT') newQty = parseInt(quantity);
    else if (type === 'RETURN') newQty += parseInt(quantity);

    if (newQty < 0) return errorResponse(res, 'Insufficient stock', 400);

    await prisma.$transaction([
      prisma.product.update({ where: { id: productId }, data: { quantity: newQty } }),
      prisma.stockMovement.create({
        data: {
          productId,
          userId: req.userId,
          type,
          quantity: parseInt(quantity),
          reason,
        },
      }),
    ]);

    await createAuditLog({
      userId: req.userId,
      action: 'STOCK_ADJUSTMENT',
      module: 'Products',
      entityId: productId,
      entityType: 'Product',
      oldValues: { quantity: product.quantity },
      newValues: { quantity: newQty, type, reason },
      ipAddress: req.ip,
    });

    const updated = await prisma.product.findUnique({ where: { id: productId }, include: { category: true } });
    if (global.io) global.io.to('all-users').emit('stock:updated', { product: updated });
    return successResponse(res, updated, 'Stock adjusted successfully');
  } catch (err) {
    return errorResponse(res, 'Failed to adjust stock', 500);
  }
});

// GET /api/products/:id/stock-movements
router.get('/:id/stock-movements', authenticate, async (req, res) => {
  try {
    const productId = parseInt(req.params.id);
    const movements = await prisma.stockMovement.findMany({
      where: { productId },
      include: { user: { select: { fullName: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return successResponse(res, movements);
  } catch (err) {
    return errorResponse(res, 'Failed to fetch stock movements', 500);
  }
});

module.exports = router;
