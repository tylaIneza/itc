process.env.TZ = 'Africa/Kigali';
require('dotenv').config();
// Prisma $queryRaw returns COUNT/SUM as BigInt which JSON.stringify can't handle
BigInt.prototype.toJSON = function () { return Number(this); };
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');
const next = require('next');

const dev = process.env.NODE_ENV !== 'production';
const nextApp = next({ dev, dir: __dirname });
const handle = nextApp.getRequestHandler();

const authRoutes = require('./src/routes/auth');
const userRoutes = require('./src/routes/users');
const productRoutes = require('./src/routes/products');
const salesRoutes = require('./src/routes/sales');
const expenseRoutes = require('./src/routes/expenses');
const analyticsRoutes = require('./src/routes/analytics');
const auditRoutes = require('./src/routes/audit');
const categoryRoutes = require('./src/routes/categories');
const capitalRoutes  = require('./src/routes/capital');
const settingsRoutes  = require('./src/routes/settings');
const superadminRoutes = require('./src/routes/superadmin');

nextApp.prepare().then(() => {
  const app = express();
  const server = http.createServer(app);

  const io = new Server(server, {
    cors: { origin: '*', credentials: true },
  });

  io.on('connection', (socket) => {
    socket.join('dashboard');
    socket.on('disconnect', () => {});
  });

  app.set('io', io);

  app.use('/api/', helmet());
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(morgan('combined'));

  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1000,
    message: { error: 'Too many requests, please try again later.' },
  });
  app.use('/api/', limiter);

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 50,
    message: { error: 'Too many login attempts, please try again later.' },
  });

  app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

  app.use('/api/auth', authLimiter, authRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/products', productRoutes);
  app.use('/api/sales', salesRoutes);
  app.use('/api/expenses', expenseRoutes);
  app.use('/api/analytics', analyticsRoutes);
  app.use('/api/audit', auditRoutes);
  app.use('/api/categories', categoryRoutes);
  app.use('/api/capital', capitalRoutes);
  app.use('/api/settings',  settingsRoutes);
  app.use('/api/superadmin', superadminRoutes);

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(err.status || 500).json({
      error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
    });
  });

  app.all('*', (req, res) => handle(req, res));

  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () => {
    console.log(`🚀 Tyla Shop MIS running on http://localhost:${PORT}`);
  });
});
