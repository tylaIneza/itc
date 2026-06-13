const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { Server } = require('socket.io');
const rateLimit = require('express-rate-limit');

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();
const PORT = parseInt(process.env.PORT || '3000', 10);

// Import routes
const authRoutes = require('./server/routes/auth');
const userRoutes = require('./server/routes/users');
const productRoutes = require('./server/routes/products');
const categoryRoutes = require('./server/routes/categories');
const saleRoutes = require('./server/routes/sales');
const expenseRoutes = require('./server/routes/expenses');
const coOperaRoutes = require('./server/routes/co-opera');
const capitalRoutes = require('./server/routes/capital');
const reportRoutes = require('./server/routes/reports');
const auditRoutes = require('./server/routes/audit-logs');
const analyticsRoutes = require('./server/routes/analytics');
const dashboardRoutes = require('./server/routes/dashboard');

app.prepare().then(() => {
  const expressApp = express();
  const httpServer = createServer(expressApp);

  // Socket.IO setup
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
      methods: ['GET', 'POST'],
      credentials: true,
    },
    path: '/socket.io',
  });

  // Make io available globally
  global.io = io;

  // Socket.IO handlers
  require('./server/socket')(io);

  // Security middleware
  expressApp.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  }));

  expressApp.use(cors({
    origin: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
    credentials: true,
  }));

  expressApp.use(morgan(dev ? 'dev' : 'combined'));
  expressApp.use(express.json({ limit: '10mb' }));
  expressApp.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Rate limiting
  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 500,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later.' },
  });

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: { error: 'Too many login attempts, please try again later.' },
  });

  // API routes
  expressApp.use('/api/auth', authLimiter, authRoutes);
  expressApp.use('/api/users', apiLimiter, userRoutes);
  expressApp.use('/api/products', apiLimiter, productRoutes);
  expressApp.use('/api/categories', apiLimiter, categoryRoutes);
  expressApp.use('/api/sales', apiLimiter, saleRoutes);
  expressApp.use('/api/expenses', apiLimiter, expenseRoutes);
  expressApp.use('/api/co-opera', apiLimiter, coOperaRoutes);
  expressApp.use('/api/capital', apiLimiter, capitalRoutes);
  expressApp.use('/api/reports', apiLimiter, reportRoutes);
  expressApp.use('/api/audit-logs', apiLimiter, auditRoutes);
  expressApp.use('/api/analytics', apiLimiter, analyticsRoutes);
  expressApp.use('/api/dashboard', apiLimiter, dashboardRoutes);

  // Health check
  expressApp.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString(), env: process.env.NODE_ENV });
  });

  // Next.js handler for all other routes
  expressApp.all('*', (req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  });

  httpServer.listen(PORT, () => {
    console.log(`\n🚀 Tyla Shop MIS running on http://localhost:${PORT}`);
    console.log(`📊 Environment: ${process.env.NODE_ENV}`);
    console.log(`🔌 Socket.IO enabled`);
    console.log(`📦 Database: MySQL via Prisma\n`);
  });
});
