const jwt = require('jsonwebtoken');
const sellers = require('../data/sellers');

function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: true, message: 'Missing or invalid Authorization header' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev_secret');
    const seller = sellers.find(s => s.id === decoded.id);
    if (!seller) return res.status(401).json({ error: true, message: 'Seller not found' });

    // Attach seller (without password) to request
    const { password: _pw, ...safeSellerData } = seller;
    req.seller = safeSellerData;
    next();
  } catch (err) {
    return res.status(401).json({ error: true, message: 'Invalid or expired token' });
  }
}

module.exports = { authenticate };
