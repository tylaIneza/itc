const express = require('express');
const router = express.Router();
const prisma = require('../utils/prisma');
const { authenticate, hasPermission } = require('../middleware/auth');
const { successResponse, errorResponse } = require('../utils/helpers');
const { startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear, subDays, format } = require('date-fns');

function getDateRange(filter, customStart, customEnd) {
  const now = new Date();
  switch (filter) {
    case 'today': return { start: startOfDay(now), end: endOfDay(now) };
    case 'week': return { start: startOfWeek(now, { weekStartsOn: 1 }), end: endOfWeek(now, { weekStartsOn: 1 }) };
    case 'month': return { start: startOfMonth(now), end: endOfMonth(now) };
    case 'year': return { start: startOfYear(now), end: endOfYear(now) };
    case 'custom': return { start: new Date(customStart), end: new Date(customEnd + 'T23:59:59') };
    default: return { start: startOfDay(now), end: endOfDay(now) };
  }
}

// GET /api/analytics/summary
router.get('/summary', authenticate, hasPermission('view_reports'), async (req, res) => {
  try {
    const { filter = 'month', startDate, endDate } = req.query;
    const { start, end } = getDateRange(filter, startDate, endDate);

    const [salesData, expenseData, coOperaData] = await Promise.all([
      prisma.sale.aggregate({ where: { createdAt: { gte: start, lte: end } }, _sum: { totalAmount: true }, _count: { id: true } }),
      prisma.expense.aggregate({ where: { date: { gte: start, lte: end }, status: 'APPROVED' }, _sum: { amount: true } }),
      prisma.coOpera.aggregate({ where: { date: { gte: start, lte: end } }, _sum: { amount: true, businessMoney: true } }),
    ]);

    const revenue = parseFloat(salesData._sum.totalAmount || 0);
    const expenses = parseFloat(expenseData._sum.amount || 0);
    const coOpera = parseFloat(coOperaData._sum.amount || 0);
    const businessMoney = parseFloat(coOperaData._sum.businessMoney || 0);
    const netProfit = revenue - expenses - coOpera;

    return successResponse(res, {
      revenue,
      expenses,
      coOpera,
      businessMoney,
      netProfit,
      salesCount: salesData._count.id,
      filter,
      dateRange: { start, end },
    });
  } catch (err) {
    return errorResponse(res, 'Failed to fetch analytics summary', 500);
  }
});

// GET /api/analytics/revenue-trend
router.get('/revenue-trend', authenticate, hasPermission('view_reports'), async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const data = [];

    for (let i = parseInt(days) - 1; i >= 0; i--) {
      const date = subDays(new Date(), i);
      const dayStart = startOfDay(date);
      const dayEnd = endOfDay(date);

      const [sales, expenses, coOpera] = await Promise.all([
        prisma.sale.aggregate({ where: { createdAt: { gte: dayStart, lte: dayEnd } }, _sum: { totalAmount: true } }),
        prisma.expense.aggregate({ where: { date: { gte: dayStart, lte: dayEnd } }, _sum: { amount: true } }),
        prisma.coOpera.findFirst({ where: { date: dayStart } }),
      ]);

      data.push({
        date: format(date, 'MMM dd'),
        revenue: parseFloat(sales._sum.totalAmount || 0),
        expenses: parseFloat(expenses._sum.amount || 0),
        coOpera: coOpera ? parseFloat(coOpera.amount) : 0,
      });
    }

    return successResponse(res, data);
  } catch (err) {
    return errorResponse(res, 'Failed to fetch revenue trend', 500);
  }
});

// GET /api/analytics/top-products
router.get('/top-products', authenticate, hasPermission('view_reports'), async (req, res) => {
  try {
    const { filter = 'month', startDate, endDate, limit = 10 } = req.query;
    const { start, end } = getDateRange(filter, startDate, endDate);

    const topProducts = await prisma.saleItem.groupBy({
      by: ['productId'],
      where: { sale: { createdAt: { gte: start, lte: end } } },
      _sum: { quantity: true, totalPrice: true },
      orderBy: { _sum: { totalPrice: 'desc' } },
      take: parseInt(limit),
    });

    const enriched = await Promise.all(topProducts.map(async (item) => {
      const product = await prisma.product.findUnique({
        where: { id: item.productId },
        select: { name: true, category: { select: { name: true } }, wholesalePrice: true },
      });
      return {
        productId: item.productId,
        name: product?.name || 'Unknown',
        category: product?.category?.name || '',
        quantity: item._sum.quantity || 0,
        revenue: parseFloat(item._sum.totalPrice || 0),
        profit: parseFloat(item._sum.totalPrice || 0) - (parseFloat(product?.wholesalePrice || 0) * (item._sum.quantity || 0)),
      };
    }));

    return successResponse(res, enriched);
  } catch (err) {
    return errorResponse(res, 'Failed to fetch top products', 500);
  }
});

// GET /api/analytics/expense-breakdown
router.get('/expense-breakdown', authenticate, hasPermission('view_reports'), async (req, res) => {
  try {
    const { filter = 'month', startDate, endDate } = req.query;
    const { start, end } = getDateRange(filter, startDate, endDate);

    const breakdown = await prisma.expense.groupBy({
      by: ['categoryId'],
      where: { date: { gte: start, lte: end }, status: 'APPROVED' },
      _sum: { amount: true },
      _count: { id: true },
    });

    const enriched = await Promise.all(breakdown.map(async (item) => {
      const category = await prisma.expenseCategory.findUnique({ where: { id: item.categoryId } });
      return {
        categoryId: item.categoryId,
        category: category?.name || 'Unknown',
        total: parseFloat(item._sum.amount || 0),
        count: item._count.id,
      };
    }));

    return successResponse(res, enriched.sort((a, b) => b.total - a.total));
  } catch (err) {
    return errorResponse(res, 'Failed to fetch expense breakdown', 500);
  }
});

module.exports = router;
