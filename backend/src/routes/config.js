const express                      = require('express');
const { body, validationResult }   = require('express-validator');
const { authenticate }             = require('../middleware/authMiddleware');
const { setCMVendors, getCMVendors, createVendor } = require('../controllers/configController');

const router = express.Router();

router.use(authenticate);

// Validation helper
function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, error: errors.array()[0].msg });
  }
  next();
}

// GET /api/config/cm-vendors
router.get('/cm-vendors', getCMVendors);

// PUT /api/config/cm-vendors
router.put(
  '/cm-vendors',
  body('vendor_ids')
    .isArray().withMessage('vendor_ids must be an array')
    .custom(ids => ids.every(id => typeof id === 'string' && id.length > 0))
    .withMessage('Each vendor_id must be a non-empty string'),
  validate,
  setCMVendors
);

// POST /api/config/cm-vendors  (create a new vendor)
router.post(
  '/cm-vendors',
  body('name').notEmpty().withMessage('name is required').trim(),
  body('zoho_vendor_id').optional().trim(),
  validate,
  createVendor
);

module.exports = router;
