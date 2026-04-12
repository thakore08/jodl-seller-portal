const express                              = require('express');
const { query, validationResult }          = require('express-validator');
const { authenticate }                     = require('../middleware/authMiddleware');
const { getInventorySummary, getInventoryDetail, getProductionView } = require('../controllers/inventoryController');
const { syncCMVendorPOs }                         = require('../controllers/syncController');

const router = express.Router();

router.use(authenticate);

function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, error: errors.array()[0].msg });
  }
  next();
}

// GET /api/inventory/summary
router.get('/summary', getInventorySummary);

// GET /api/inventory/detail?vendor_id=uuid
router.get(
  '/detail',
  query('vendor_id')
    .notEmpty().withMessage('vendor_id query parameter is required')
    .isUUID().withMessage('vendor_id must be a valid UUID'),
  validate,
  getInventoryDetail
);

// GET /api/inventory/production — all CM vendors → POs → line items + production status
router.get('/production', getProductionView);

// POST /api/inventory/sync  — pull CM vendor POs from Zoho Books into CM DB
router.post('/sync', syncCMVendorPOs);

module.exports = router;
