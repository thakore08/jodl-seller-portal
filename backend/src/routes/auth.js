const express = require('express');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const sellers = require('../data/sellers');
const { authenticate } = require('../middleware/authMiddleware');

const router = express.Router();

const JWT_SECRET  = process.env.JWT_SECRET  || 'dev_secret';
const JWT_EXPIRES = process.env.JWT_EXPIRES_IN || '8h';

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: true, message: 'Email and password are required' });
  }

  const seller = sellers.find(s => s.email.toLowerCase() === email.toLowerCase());
  if (!seller) {
    return res.status(401).json({ error: true, message: 'Invalid credentials' });
  }

  const valid = await bcrypt.compare(password, seller.password);
  if (!valid) {
    return res.status(401).json({ error: true, message: 'Invalid credentials' });
  }

  const { password: _pw, ...sellerData } = seller;

  const token = jwt.sign(
    { id: seller.id, email: seller.email },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES }
  );

  res.json({ token, seller: sellerData });
});

// GET /api/auth/me
router.get('/me', authenticate, (req, res) => {
  res.json({ seller: req.seller });
});

module.exports = router;
