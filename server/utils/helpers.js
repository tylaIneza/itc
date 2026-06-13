const { format } = require('date-fns');

function generateInvoiceNumber() {
  const date = format(new Date(), 'yyyyMMdd');
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `INV${date}-${random}`;
}

function formatCurrency(amount) {
  return new Intl.NumberFormat('en-RW', {
    style: 'currency',
    currency: 'RWF',
    minimumFractionDigits: 0,
  }).format(amount);
}

function isWorkingDay(date) {
  const d = new Date(date);
  const day = d.getDay();
  // 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
  return day !== 6; // Saturday not allowed
}

function isSaturday(date) {
  const d = new Date(date);
  return d.getDay() === 6;
}

function getWorkingDaysInMonth(year, month) {
  const days = [];
  const date = new Date(year, month - 1, 1);
  while (date.getMonth() === month - 1) {
    if (isWorkingDay(date)) {
      days.push(new Date(date));
    }
    date.setDate(date.getDate() + 1);
  }
  return days;
}

function successResponse(res, data, message = 'Success', statusCode = 200) {
  return res.status(statusCode).json({ success: true, message, data });
}

function errorResponse(res, message = 'Error', statusCode = 500, errors = null) {
  const response = { success: false, message };
  if (errors) response.errors = errors;
  return res.status(statusCode).json(response);
}

module.exports = {
  generateInvoiceNumber,
  formatCurrency,
  isWorkingDay,
  isSaturday,
  getWorkingDaysInMonth,
  successResponse,
  errorResponse,
};
