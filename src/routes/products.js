const router = require('express').Router();
const multer = require('multer');
const { authenticate, requirePermission, requireCompanyScope } = require('../middleware/auth');
const ctrl = require('../controllers/productController');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = /\.(csv|xlsx|xls)$/i.test(file.originalname);
    cb(ok ? null : new Error('Only CSV and Excel files are allowed'), ok);
  },
});

router.use(authenticate, requireCompanyScope);
router.get('/low-stock', ctrl.getLowStock);
router.get('/', ctrl.getAll);
router.get('/:id', ctrl.getOne);
router.post('/', requirePermission('can_manage_stock'), ctrl.create);
router.post('/import', requirePermission('can_manage_stock'), upload.single('file'), ctrl.importCSV);
router.put('/:id', requirePermission('can_manage_stock'), ctrl.update);
router.post('/:id/stock', requirePermission('can_manage_stock'), ctrl.adjustStock);
router.delete('/:id', requirePermission('can_manage_stock'), ctrl.remove);

module.exports = router;
