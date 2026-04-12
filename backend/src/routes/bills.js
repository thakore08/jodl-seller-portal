const express                          = require('express');
const { body, validationResult }       = require('express-validator');
const { authenticate }                 = require('../middleware/authMiddleware');
const { createBill }                   = require('../controllers/billsController');

const router = express.Router();

router.use(authenticate);

function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, error: errors.array()[0].msg });
  }
  next();
}

// POST /api/bills
router.post(
  '/',
  body('po_line_item_id')
    .notEmpty().withMessage('po_line_item_id is required')
    .isUUID().withMessage('po_line_item_id must be a valid UUID'),
  body('billed_qty')
    .notEmpty().withMessage('billed_qty is required')
    .isInt({ min: 0 }).withMessage('billed_qty must be a non-negative integer'),
  body('status')
    .notEmpty().withMessage('status is required')
    .isIn(['draft', 'open', 'paid']).withMessage('status must be draft, open, or paid'),
  validate,
  createBill
);

module.exports = router;
