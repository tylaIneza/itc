const express = require('express');
const router = express.Router();
const prisma = require('../utils/prisma');
const { authenticate, hasPermission } = require('../middleware/auth');
const { createAuditLog } = require('../utils/audit');
const { generateInvoiceNumber, successResponse, errorResponse } = require('../utils/helpers');

// GET /api/sales
router.get('/', authenticate, hasPermission('view_sales'), async (req, res) => {
  try {
    const { search, startDate, endDate, userId, page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const where = {};
    if (search) where.invoiceNumber = { contains: search };
    if (userId) where.userId = parseInt(userId);
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate + 'T23:59:59');
    }

    const [sales, total] = await Promise.all([
      prisma.sale.findMany({
        where,
        include: {
          user: { select: { fullName: true, id: true } },
          items: { include: { product: { select: { name: true } } } },
        },
        skip,
        take: parseInt(limit),
        orderBy: { createdAt: 'desc' },
      }),
      prisma.sale.count({ where }),
    ]);

    return successResponse(res, { sales, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    return errorResponse(res, 'Failed to fetch sales', 500);
  }
});

// GET /api/sales/today-revenue
router.get('/today-revenue', authenticate, async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const result = await prisma.sale.aggregate({
      where: { createdAt: { gte: today, lt: tomorrow } },
      _sum: { totalAmount: true },
      _count: { id: true },
    });

    const itemsCount = await prisma.saleItem.aggregate({
      where: { sale: { createdAt: { gte: today, lt: tomorrow } } },
      _sum: { quantity: true },
    });

    return successResponse(res, {
      revenue: result._sum.totalAmount || 0,
      salesCount: result._count.id,
      itemsCount: itemsCount._sum.quantity || 0,
    });
  } catch (err) {
    return errorResponse(res, 'Failed to fetch today revenue', 500);
  }
});

// POST /api/sales
router.post('/', authenticate, hasPermission('create_sale'), async (req, res) => {
  try {
    const { items, notes } = req.body;
    if (!items || items.length === 0) return errorResponse(res, 'Sale must have at least one item', 400);

    // Validate all items
    for (const item of items) {
      const product = await prisma.product.findUnique({ where: { id: parseInt(item.productId) } });
      if (!product) return errorResponse(res, `Product ${item.productId} not found`, 404);
      if (!product.isActive) return errorResponse(res, `Product ${product.name} is inactive`, 400);
      if (product.quantity < parseInt(item.quantity)) {
        return errorResponse(res, `Insufficient stock for ${product.name}. Available: ${product.quantity}`, 400);
      }
      if (parseFloat(item.unitPrice) < parseFloat(product.wholesalePrice)) {
        return errorResponse(res, `Cannot sell ${product.name} below wholesale price (${product.wholesalePrice})`, 400);
      }
    }

    const invoiceNumber = generateInvoiceNumber();
    const totalAmount = items.reduce((sum, item) => sum + parseFloat(item.unitPrice) * parseInt(item.quantity), 0);

    const sale = await prisma.$transaction(async (tx) => {
      const newSale = await tx.sale.create({
        data: {
          invoiceNumber,
          userId: req.userId,
          totalAmount,
          notes,
          items: {
            create: await Promise.all(items.map(async (item) => {
              const product = await tx.product.findUnique({ where: { id: parseInt(item.productId) } });
              return {
                productId: parseInt(item.productId),
                quantity: parseInt(item.quantity),
                unitPrice: parseFloat(item.unitPrice),
                wholesalePrice: parseFloat(product.wholesalePrice),
                totalPrice: parseFloat(item.unitPrice) * parseInt(item.quantity),
              };
            })),
          },
        },
        include: {
          items: { include: { product: { select: { name: true, id: true } } } },
          user: { select: { fullName: true } },
        },
      });

      // Deduct stock
      for (const item of items) {
        const product = await tx.product.findUnique({ where: { id: parseInt(item.productId) } });
        await tx.product.update({
          where: { id: parseInt(item.productId) },
          data: { quantity: { decrement: parseInt(item.quantity) } },
        });
        await tx.stockMovement.create({
          data: {
            productId: parseInt(item.productId),
            userId: req.userId,
            type: 'OUT',
            quantity: parseInt(item.quantity),
            reason: 'Sale',
            reference: invoiceNumber,
          },
        });
      }

      return newSale;
    });

    await createAuditLog({
      userId: req.userId,
      action: 'CREATE_SALE',
      module: 'Sales',
      entityId: sale.id,
      entityType: 'Sale',
      newValues: { invoiceNumber, totalAmount, itemsCount: items.length },
      ipAddress: req.ip,
    });

    if (global.io) {
      global.io.to('all-users').emit('sale:created', { sale });
      global.io.to('all-users').emit('stock:updated', {});
      global.io.to('role-Admin').emit('dashboard:refresh', {});
    }

    return successResponse(res, sale, 'Sale created successfully', 201);
  } catch (err) {
    console.error('Sale error:', err);
    return errorResponse(res, err.message || 'Failed to create sale', 500);
  }
});

// GET /api/sales/:id
router.get('/:id', authenticate, hasPermission('view_sales'), async (req, res) => {
  try {
    const sale = await prisma.sale.findUnique({
      where: { id: parseInt(req.params.id) },
      include: {
        user: { select: { fullName: true, email: true } },
        items: { include: { product: { include: { category: true } } } },
      },
    });
    if (!sale) return errorResponse(res, 'Sale not found', 404);
    return successResponse(res, sale);
  } catch (err) {
    return errorResponse(res, 'Failed to fetch sale', 500);
  }
});

// DELETE /api/sales/:id
router.delete('/:id', authenticate, hasPermission('delete_sale'), async (req, res) => {
  try {
    const saleId = parseInt(req.params.id);
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      include: { items: true },
    });
    if (!sale) return errorResponse(res, 'Sale not found', 404);

    await prisma.$transaction(async (tx) => {
      // Restore stock
      for (const item of sale.items) {
        await tx.product.update({
          where: { id: item.productId },
          data: { quantity: { increment: item.quantity } },
        });
        await tx.stockMovement.create({
          data: {
            productId: item.productId,
            userId: req.userId,
            type: 'RETURN',
            quantity: item.quantity,
            reason: 'Sale deleted',
            reference: sale.invoiceNumber,
          },
        });
      }
      await tx.sale.delete({ where: { id: saleId } });
    });

    await createAuditLog({
      userId: req.userId,
      action: 'DELETE_SALE',
      module: 'Sales',
      entityId: saleId,
      entityType: 'Sale',
      oldValues: { invoiceNumber: sale.invoiceNumber, totalAmount: sale.totalAmount },
      ipAddress: req.ip,
    });

    if (global.io) {
      global.io.to('all-users').emit('sale:deleted', { saleId });
      global.io.to('all-users').emit('stock:updated', {});
    }

    return successResponse(res, null, 'Sale deleted and stock restored');
  } catch (err) {
    return errorResponse(res, 'Failed to delete sale', 500);
  }
});

module.exports = router;
