const express                              = require('express');
const { query, validationResult }          = require('express-validator');
const { authenticate }                     = require('../middleware/authMiddleware');
const { getInventorySummary, getInventoryDetail } = require('../controllers/inventoryController');

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

module.exports = router;
