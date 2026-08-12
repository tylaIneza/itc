const express = require('express');
const router = express.Router();
const { authenticate, requireSuperAdmin } = require('../middleware/auth');
const ctrl = require('../controllers/superadminController');
const settingsCtrl = require('../controllers/settingsController');

router.use(authenticate, requireSuperAdmin);

router.get('/companies',                 ctrl.listCompanies);
router.post('/companies',                ctrl.createCompany);
router.patch('/companies/:id/toggle',    ctrl.toggleActive);
router.get('/companies/:id/dashboard',   ctrl.getCompanyDashboard);
router.get('/audit-logs',                ctrl.getAuditLogs);
router.get('/role-permissions',          settingsCtrl.getRolePermissions);

module.exports = router;
