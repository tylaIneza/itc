const jwt = require('jsonwebtoken');
const prisma = require('../utils/prisma');

module.exports = function setupSocket(io) {
  // Authenticate socket connections
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (!token) {
        return next(new Error('Authentication error'));
      }
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        include: { role: true },
      });
      if (!user || !user.isActive) {
        return next(new Error('Authentication error'));
      }
      socket.user = user;
      next();
    } catch (err) {
      next(new Error('Authentication error'));
    }
  });

  io.on('connection', (socket) => {
    const user = socket.user;
    console.log(`🔌 Socket connected: ${user.fullName} (${user.id})`);

    // Join user-specific room
    socket.join(`user-${user.id}`);
    socket.join(`role-${user.role.name}`);
    socket.join('all-users');

    // Broadcast user joined
    io.to('all-users').emit('user:online', { userId: user.id, name: user.fullName });

    socket.on('disconnect', () => {
      console.log(`🔌 Socket disconnected: ${user.fullName}`);
      io.to('all-users').emit('user:offline', { userId: user.id });
    });

    // Ping/pong for connection health
    socket.on('ping', () => socket.emit('pong'));
  });
};

// Emit helpers
function emitToAll(event, data) {
  if (global.io) global.io.to('all-users').emit(event, data);
}

function emitToRole(role, event, data) {
  if (global.io) global.io.to(`role-${role}`).emit(event, data);
}

function emitToUser(userId, event, data) {
  if (global.io) global.io.to(`user-${userId}`).emit(event, data);
}

module.exports.emitToAll = emitToAll;
module.exports.emitToRole = emitToRole;
module.exports.emitToUser = emitToUser;
