const express = require('express');
const router  = express.Router();
const { authenticate, requireAdmin, requireCompanyScope } = require('../middleware/auth');
const ctrl = require('../controllers/settingsController');

router.use(authenticate, requireCompanyScope, requireAdmin);
router.get('/role-permissions',        ctrl.getRolePermissions);
router.post('/role-permissions/toggle', ctrl.toggleRolePermission);

module.exports = router;
