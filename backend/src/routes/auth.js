const express    = require('express');
const bcrypt     = require('bcryptjs');
const jwt        = require('jsonwebtoken');
const crypto     = require('crypto');
const nodemailer = require('nodemailer');
const { sellers, resetTokens } = require('../data/sellers');
const { authenticate }         = require('../middleware/authMiddleware');

const router = express.Router();

const JWT_SECRET  = process.env.JWT_SECRET  || 'dev_secret';
const JWT_EXPIRES = process.env.JWT_EXPIRES_IN || '8h';

// ─── Email transporter ────────────────────────────────────────────────────────
function createTransporter() {
  return nodemailer.createTransport({
    host:   process.env.SMTP_HOST || 'smtp.gmail.com',
    port:   parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

// ─── POST /api/auth/login ─────────────────────────────────────────────────────
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

  // Include role in JWT so every request carries role without a DB lookup
  const token = jwt.sign(
    { id: seller.id, email: seller.email, role: seller.role },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES }
  );

  res.json({ token, seller: sellerData });
});

// ─── GET /api/auth/me ─────────────────────────────────────────────────────────
router.get('/me', authenticate, (req, res) => {
  res.json({ seller: req.seller });
});

// ─── POST /api/auth/forgot-password ──────────────────────────────────────────
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: true, message: 'Email is required' });
  }

  // Always return 200 to prevent email enumeration
  const seller = sellers.find(s => s.email.toLowerCase() === email.toLowerCase());
  if (!seller) return res.json({ success: true });

  // Generate secure reset token
  const token     = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  // Remove existing token for this seller, push new one
  const idx = resetTokens.findIndex(t => t.sellerId === seller.id);
  if (idx !== -1) resetTokens.splice(idx, 1);
  resetTokens.push({ token, sellerId: seller.id, expiresAt });

  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  const resetLink   = `${frontendUrl}/reset-password/${token}`;
  const fromAddress = process.env.SMTP_FROM || '"JODL Portal" <noreply@jodl.com>';

  // Always log token in development for easy testing
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[PasswordReset] Token for ${email}: ${token}`);
    console.log(`[PasswordReset] Reset link: ${resetLink}`);
  }

  // Send email if SMTP is configured (non-blocking — failure doesn't fail the response)
  if (process.env.SMTP_USER && process.env.SMTP_PASS) {
    try {
      const transporter = createTransporter();
      await transporter.sendMail({
        from:    fromAddress,
        to:      seller.email,
        subject: 'JODL Seller Portal — Password Reset',
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
            <h2 style="color:#4f46e5">Password Reset Request</h2>
            <p>Hi ${seller.name},</p>
            <p>We received a request to reset your JODL Seller Portal password.</p>
            <p>Click the button below. This link expires in <strong>1 hour</strong>.</p>
            <a href="${resetLink}"
               style="display:inline-block;margin:16px 0;padding:12px 24px;background:#4f46e5;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">
              Reset Password
            </a>
            <p style="color:#6b7280;font-size:14px">If you did not request this, safely ignore this email.</p>
            <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0">
            <p style="color:#9ca3af;font-size:12px">JODL Seller Portal · Automated email</p>
          </div>`,
      });
      console.log(`[PasswordReset] Email sent to ${seller.email}`);
    } catch (err) {
      console.error('[PasswordReset] Email send failed:', err.message);
    }
  } else {
    console.warn('[PasswordReset] SMTP not configured — check reset link in server logs');
  }

  res.json({ success: true });
});

// ─── POST /api/auth/reset-password ────────────────────────────────────────────
router.post('/reset-password', async (req, res) => {
  const { token, new_password } = req.body;

  if (!token || !new_password) {
    return res.status(400).json({ error: true, message: 'token and new_password are required' });
  }

  if (new_password.length < 8) {
    return res.status(400).json({ error: true, message: 'Password must be at least 8 characters' });
  }

  const entry = resetTokens.find(
    t => t.token === token && new Date(t.expiresAt) > new Date()
  );

  if (!entry) {
    return res.status(400).json({ error: true, message: 'Invalid or expired reset token' });
  }

  const seller = sellers.find(s => s.id === entry.sellerId);
  if (!seller) {
    return res.status(400).json({ error: true, message: 'Seller not found' });
  }

  // Update password in in-memory store
  seller.password = await bcrypt.hash(new_password, 10);

  // Remove used token
  const idx = resetTokens.findIndex(t => t.token === token);
  if (idx !== -1) resetTokens.splice(idx, 1);

  console.log(`[PasswordReset] Password updated for ${seller.email}`);
  res.json({ success: true, message: 'Password has been reset successfully' });
});

module.exports = router;
