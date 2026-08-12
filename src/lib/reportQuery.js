const prisma = require('./prisma');

// branchClause(alias) must return a safe SQL fragment like "AND s.branch_id = 3"
// or "AND branch_id IN (3,4)" (alias omitted -> no table prefix).
async function buildReport({ branchClause, sellerClause = '', period = 'weekly', start_date, end_date }) {
  const bs = branchClause('s');
  const be = branchClause(null);

  let startDate, endDate;
  if (start_date && end_date) {
    startDate = start_date;
    endDate   = end_date;
  } else {
    const [dates] = await prisma.$queryRaw`
      SELECT DATE_FORMAT(CURDATE(),'%Y-%m-%d') as today,
             DATE_FORMAT(DATE_SUB(CURDATE(),INTERVAL 7 DAY),'%Y-%m-%d') as week_start,
             DATE_FORMAT(DATE_SUB(CURDATE(),INTERVAL DAY(CURDATE())-1 DAY),'%Y-%m-%d') as month_start`;
    if (period === 'daily')       { startDate = endDate = dates.today; }
    else if (period === 'weekly') { startDate = dates.week_start; endDate = dates.today; }
    else                          { startDate = dates.month_start; endDate = dates.today; }
  }

  const [salesSummary, expensesSummary, dailyTrend, topProducts, sellerPerformance] = await Promise.all([
    prisma.$queryRawUnsafe(
      `SELECT COALESCE(SUM(s.total_amount),0) as revenue, COUNT(DISTINCT s.id) as transactions
       FROM sales s WHERE DATE(s.created_at) BETWEEN ? AND ? ${sellerClause} ${bs}`,
      startDate, endDate),

    prisma.$queryRawUnsafe(
      `SELECT COALESCE(SUM(amount),0) as total_expenses FROM expenses WHERE expense_date BETWEEN ? AND ? ${be}`,
      startDate, endDate),

    prisma.$queryRawUnsafe(
      `SELECT DATE(s.created_at) as date, COALESCE(SUM(s.total_amount),0) as revenue, COUNT(*) as transactions
       FROM sales s WHERE DATE(s.created_at) BETWEEN ? AND ? ${sellerClause} ${bs}
       GROUP BY DATE(s.created_at) ORDER BY date`,
      startDate, endDate),

    prisma.$queryRawUnsafe(
      `SELECT si.product_name, SUM(si.quantity) as qty_sold, SUM(si.line_total) as revenue
       FROM sale_items si JOIN sales s ON si.sale_id = s.id
       WHERE DATE(s.created_at) BETWEEN ? AND ? ${sellerClause} ${bs}
       GROUP BY si.product_id, si.product_name ORDER BY qty_sold DESC LIMIT 10`,
      startDate, endDate),

    prisma.$queryRawUnsafe(
      `SELECT u.name as seller_name, COUNT(s.id) as transactions, SUM(s.total_amount) as revenue
       FROM sales s JOIN users u ON s.seller_id = u.id
       WHERE DATE(s.created_at) BETWEEN ? AND ? ${sellerClause} ${bs}
       GROUP BY s.seller_id, u.name ORDER BY revenue DESC`,
      startDate, endDate),
  ]);

  const revenue   = parseFloat(salesSummary[0].revenue);
  const expenses  = parseFloat(expensesSummary[0].total_expenses);
  const netProfit = revenue - expenses;

  return {
    period, start_date: startDate, end_date: endDate,
    summary: {
      revenue, expenses,
      net_profit:    netProfit,
      transactions:  Number(salesSummary[0].transactions),
      profit_margin: revenue > 0 ? (((netProfit) / revenue) * 100).toFixed(2) : '0.00',
    },
    daily_trend:        dailyTrend,
    top_products:       topProducts,
    seller_performance: sellerPerformance,
  };
}

module.exports = { buildReport };
