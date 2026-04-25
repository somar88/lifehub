'use strict';
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { validationResult } = require('express-validator');
const User = require('../models/User');
const emailService = require('../services/emailService');
const logger = require('../config/logger');
const { revoke } = require('../middleware/tokenBlacklist');

const LOGIN_MAX_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutes

function generateToken(user) {
  return jwt.sign(
    { userId: user._id, role: user.role, jti: crypto.randomUUID() },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

function hashToken(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

async function register(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { name, email, password } = req.body;
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({ name, email, passwordHash });

    emailService.sendWelcomeEmail(email, name).catch((err) =>
      logger.warn('Welcome email failed', { error: err.message })
    );

    res.status(201).json({ user, token: generateToken(user) });
  } catch (err) {
    next(err);
  }
}

async function login(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { email, password } = req.body;
    const user = await User.findOne({ email }).select('+passwordHash +loginAttempts +lockUntil');

    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    if (user.lockUntil && user.lockUntil > Date.now()) {
      const minutesLeft = Math.ceil((user.lockUntil - Date.now()) / 60000);
      return res.status(401).json({ error: `Account is temporarily locked. Try again in ${minutesLeft} minute(s).` });
    }

    if (user.status === 'pending') {
      return res.status(401).json({ error: 'Your application is pending admin approval' });
    }
    if (user.status === 'invited') {
      return res.status(401).json({ error: 'Please complete signup using the link sent to your email' });
    }
    if (user.status === 'inactive') {
      return res.status(401).json({ error: 'Account has been deactivated' });
    }

    if (!(await user.comparePassword(password))) {
      user.loginAttempts = (user.loginAttempts || 0) + 1;
      if (user.loginAttempts >= LOGIN_MAX_ATTEMPTS) {
        user.lockUntil = new Date(Date.now() + LOCK_DURATION_MS);
        user.loginAttempts = 0;
        logger.warn('Account locked due to failed login attempts', { userId: user._id });
      }
      await user.save();
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    user.loginAttempts = 0;
    user.lockUntil = null;
    user.lastLoginAt = new Date();
    await user.save();

    res.json({ user, token: generateToken(user) });
  } catch (err) {
    next(err);
  }
}

async function forgotPassword(req, res, next) {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });

    if (user) {
      const rawToken = crypto.randomBytes(32).toString('hex');
      user.resetToken = hashToken(rawToken);
      user.resetTokenExpiry = new Date(Date.now() + 3_600_000);
      await user.save();

      emailService.sendPasswordResetEmail(email, rawToken).catch((err) =>
        logger.warn('Reset email failed', { error: err.message })
      );
    }

    res.json({ message: 'If that email is registered, a reset link has been sent.' });
  } catch (err) {
    next(err);
  }
}

async function resetPassword(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { token, password } = req.body;
    const user = await User.findOne({
      resetToken: hashToken(token),
      resetTokenExpiry: { $gt: new Date() },
    });

    if (!user) return res.status(400).json({ error: 'Invalid or expired reset token' });

    user.passwordHash = await bcrypt.hash(password, 12);
    user.resetToken = null;
    user.resetTokenExpiry = null;
    await user.save();

    res.json({ message: 'Password reset successfully' });
  } catch (err) {
    next(err);
  }
}

async function apply(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { firstName, lastName, email } = req.body;
    const name = [firstName.trim(), (lastName || '').trim()].filter(Boolean).join(' ');

    await User.create({ name, firstName, lastName, email, passwordHash: null, isActive: false, status: 'pending' });

    res.status(201).json({ message: 'Application submitted. You will receive an email when your account is approved.' });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'An account with that email already exists' });
    next(err);
  }
}

async function verifyInvite(req, res, next) {
  try {
    const { token } = req.query;
    if (!token) return res.status(400).json({ error: 'Token is required' });

    const user = await User.findOne({
      inviteToken: hashToken(token),
      inviteTokenExpiry: { $gt: new Date() },
    });
    if (!user) return res.status(400).json({ error: 'Invalid or expired invite link' });

    res.json({ valid: true, name: user.name, email: user.email });
  } catch (err) {
    next(err);
  }
}

async function acceptInvite(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { token, password } = req.body;
    const user = await User.findOne({
      inviteToken: hashToken(token),
      inviteTokenExpiry: { $gt: new Date() },
    });
    if (!user) return res.status(400).json({ error: 'Invalid or expired invite link' });

    user.passwordHash = await bcrypt.hash(password, 12);
    user.status = 'active';
    user.isActive = true;
    user.inviteToken = null;
    user.inviteTokenExpiry = null;
    user.lastLoginAt = new Date();
    await user.save();

    res.json({ user, token: generateToken(user) });
  } catch (err) {
    next(err);
  }
}

function logout(req, res) {
  if (req.user?.jti) revoke(req.user.jti, req.user.exp);
  res.json({ message: 'Logged out' });
}

module.exports = { register, login, logout, forgotPassword, resetPassword, apply, verifyInvite, acceptInvite };
