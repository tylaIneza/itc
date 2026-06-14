const express = require('express');
const router = express.Router();
const prisma = require('../utils/prisma');
const { authenticate } = require('../middleware/auth');
const { successResponse, errorResponse } = require('../utils/helpers');
const { format, subDays, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth } = require('date-fns');

// GET /api/dashboard/overview
router.get('/overview', authenticate, async (req, res) => {
  try {
    const now = new Date();
    const todayStart = startOfDay(now);
    const todayEnd = endOfDay(now);
    const weekStart = startOfWeek(now, { weekStartsOn: 1 });
    const monthStart = startOfMonth(now);

    const [todaySales, weekSales, monthSales, todayExpenses, coOperaToday, totalCapital, lowStockCount, allTimeRevenue, allTimeExpenses, allTimeCoOpera] = await Promise.all([
      prisma.sale.aggregate({ where: { createdAt: { gte: todayStart, lte: todayEnd } }, _sum: { totalAmount: true }, _count: { id: true } }),
      prisma.sale.aggregate({ where: { createdAt: { gte: weekStart, lte: todayEnd } }, _sum: { totalAmount: true } }),
      prisma.sale.aggregate({ where: { createdAt: { gte: monthStart, lte: todayEnd } }, _sum: { totalAmount: true } }),
      prisma.expense.aggregate({ where: { date: { gte: todayStart, lte: todayEnd }, status: 'APPROVED' }, _sum: { amount: true } }),
      prisma.coOpera.findFirst({ where: { date: todayStart } }),
      prisma.capitalInjection.aggregate({ _sum: { amount: true } }),
      prisma.product.count({ where: { isActive: true, quantity: { lte: 5 } } }),
      prisma.sale.aggregate({ _sum: { totalAmount: true } }),
      prisma.expense.aggregate({ where: { status: 'APPROVED' }, _sum: { amount: true } }),
      prisma.coOpera.aggregate({ _sum: { amount: true } }),
    ]);

    const revenueToday = parseFloat(todaySales._sum.totalAmount || 0);
    const expensesToday = parseFloat(todayExpenses._sum.amount || 0);
    const coOperaAmount = coOperaToday ? parseFloat(coOperaToday.amount) : 0;
    const businessMoney = coOperaToday ? parseFloat(coOperaToday.businessMoney) : revenueToday - expensesToday;
    const netProfit = revenueToday - expensesToday - coOperaAmount;

    const capital = parseFloat(totalCapital._sum.amount || 0);
    const totalRevenue = parseFloat(allTimeRevenue._sum.totalAmount || 0);
    const totalExpenses = parseFloat(allTimeExpenses._sum.amount || 0);
    const totalCoOpera = parseFloat(allTimeCoOpera._sum.amount || 0);
    const totalBusinessBalance = capital + totalRevenue - totalExpenses - totalCoOpera;

    return successResponse(res, {
      today: {
        revenue: revenueToday,
        salesCount: todaySales._count.id,
        expenses: expensesToday,
        coOpera: coOperaAmount,
        businessMoney,
        netProfit,
      },
      week: { revenue: parseFloat(weekSales._sum.totalAmount || 0) },
      month: { revenue: parseFloat(monthSales._sum.totalAmount || 0) },
      totalCapital: capital,
      totalBusinessBalance,
      lowStockCount,
      coOperaToday,
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    return errorResponse(res, 'Failed to fetch dashboard data', 500);
  }
});

// GET /api/dashboard/revenue-chart
router.get('/revenue-chart', authenticate, async (req, res) => {
  try {
    const days = parseInt(req.query.days || '7');
    const data = [];

    for (let i = days - 1; i >= 0; i--) {
      const date = subDays(new Date(), i);
      const dayStart = startOfDay(date);
      const dayEnd = endOfDay(date);

      const result = await prisma.sale.aggregate({
        where: { createdAt: { gte: dayStart, lte: dayEnd } },
        _sum: { totalAmount: true },
        _count: { id: true },
      });

      data.push({
        date: format(date, 'MMM dd'),
        revenue: parseFloat(result._sum.totalAmount || 0),
        sales: result._count.id,
      });
    }

    return successResponse(res, data);
  } catch (err) {
    return errorResponse(res, 'Failed to fetch revenue chart', 500);
  }
});

// GET /api/dashboard/top-products
router.get('/top-products', authenticate, async (req, res) => {
  try {
    const { limit = 5, days = 30 } = req.query;
    const startDate = subDays(new Date(), parseInt(days));

    const topProducts = await prisma.saleItem.groupBy({
      by: ['productId'],
      where: { sale: { createdAt: { gte: startDate } } },
      _sum: { quantity: true, totalPrice: true },
      orderBy: { _sum: { totalPrice: 'desc' } },
      take: parseInt(limit),
    });

    const enriched = await Promise.all(topProducts.map(async (item) => {
      const product = await prisma.product.findUnique({
        where: { id: item.productId },
        select: { name: true, category: { select: { name: true } } },
      });
      return {
        productId: item.productId,
        name: product?.name || 'Unknown',
        category: product?.category?.name || '',
        quantity: item._sum.quantity,
        revenue: parseFloat(item._sum.totalPrice || 0),
      };
    }));

    return successResponse(res, enriched);
  } catch (err) {
    return errorResponse(res, 'Failed to fetch top products', 500);
  }
});

// GET /api/dashboard/recent-transactions
router.get('/recent-transactions', authenticate, async (req, res) => {
  try {
    const sales = await prisma.sale.findMany({
      take: 10,
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { fullName: true } },
        items: { include: { product: { select: { name: true } } } },
      },
    });
    return successResponse(res, sales);
  } catch (err) {
    return errorResponse(res, 'Failed to fetch recent transactions', 500);
  }
});

module.exports = router;
