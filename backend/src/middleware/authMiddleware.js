const jwt          = require('jsonwebtoken');
const { sellers }  = require('../data/sellers');

/**
 * authenticate — verifies JWT, attaches seller (minus password) to req.seller
 */
function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: true, message: 'Missing or invalid Authorization header' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev_secret');
    const seller  = sellers.find(s => s.id === decoded.id);
    if (!seller) return res.status(401).json({ error: true, message: 'Seller not found' });

    // Attach seller (without password) to request
    const { password: _pw, ...safeSellerData } = seller;
    req.seller = safeSellerData;
    next();
  } catch {
    return res.status(401).json({ error: true, message: 'Invalid or expired token' });
  }
}

/**
 * requireRole — middleware factory; restricts endpoint to the given roles.
 *
 * Usage (always apply after authenticate):
 *   router.post('/path', authenticate, requireRole('seller_admin', 'operations_user'), handler)
 *
 * Roles: 'seller_admin' | 'operations_user' | 'finance_user'
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.seller?.role)) {
      return res.status(403).json({ error: true, message: 'Insufficient permissions for this action' });
    }
    next();
  };
}

module.exports = { authenticate, requireRole };
