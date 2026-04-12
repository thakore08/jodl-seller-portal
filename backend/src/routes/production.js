const express                            = require('express');
const { body, param, validationResult }  = require('express-validator');
const { authenticate }                   = require('../middleware/authMiddleware');
const { upsertProduction }               = require('../controllers/productionController');

const router = express.Router();

router.use(authenticate);

function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, error: errors.array()[0].msg });
  }
  next();
}

// PATCH /api/production/:po_line_item_id
router.patch(
  '/:po_line_item_id',
  param('po_line_item_id').isUUID().withMessage('po_line_item_id must be a valid UUID'),
  body('planned_qty')
    .optional()
    .isInt({ min: 0 }).withMessage('planned_qty must be a non-negative integer'),
  body('actual_qty')
    .optional()
    .isInt({ min: 0 }).withMessage('actual_qty must be a non-negative integer'),
  body().custom((_, { req }) => {
    if (req.body.planned_qty === undefined && req.body.actual_qty === undefined) {
      throw new Error('At least one of planned_qty or actual_qty is required');
    }
    return true;
  }),
  validate,
  upsertProduction
);

module.exports = router;
