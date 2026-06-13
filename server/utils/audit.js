const prisma = require('./prisma');

async function createAuditLog({ userId, action, module, entityId, entityType, oldValues, newValues, ipAddress, userAgent }) {
  try {
    await prisma.auditLog.create({
      data: {
        userId: userId || null,
        action,
        module,
        entityId: entityId || null,
        entityType: entityType || null,
        oldValues: oldValues || null,
        newValues: newValues || null,
        ipAddress: ipAddress || null,
        userAgent: userAgent || null,
      },
    });
  } catch (err) {
    console.error('Audit log error:', err);
  }
}

module.exports = { createAuditLog };
