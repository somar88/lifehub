'use strict';
const { validationResult } = require('express-validator');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const Task = require('../models/Task');
const Event = require('../models/Event');
const Contact = require('../models/Contact');
const Category = require('../models/Category');
const Transaction = require('../models/Transaction');
const ShoppingList = require('../models/ShoppingList');
const AuditLog = require('../models/AuditLog');
const emailService = require('../services/emailService');
const logger = require('../config/logger');
const { revoke } = require('../middleware/tokenBlacklist');

const GRACE_DAYS = parseInt(process.env.RECOVERY_GRACE_DAYS || '30', 10);

function hashToken(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

async function getMe(req, res, next) {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) {
    next(err);
  }
}

async function updateMe(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const update = {};
    if (req.body.name !== undefined) update.name = req.body.name;
    if (req.body.dailyDigestHour !== undefined) update.dailyDigestHour = req.body.dailyDigestHour;
    if (req.body.timezone !== undefined) update.timezone = req.body.timezone;

    const user = await User.findByIdAndUpdate(
      req.user.userId,
      update,
      { new: true, runValidators: true }
    );
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) {
    next(err);
  }
}

async function changePassword(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const user = await User.findById(req.user.userId).select('+passwordHash');
    if (!user) return res.status(404).json({ error: 'User not found' });

    const { currentPassword, newPassword } = req.body;
    if (!(await user.comparePassword(currentPassword))) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    user.passwordHash = await bcrypt.hash(newPassword, 12);
    await user.save();

    if (req.user?.jti) revoke(req.user.jti, req.user.exp);
    const newToken = jwt.sign(
      { userId: user._id, role: user.role, jti: crypto.randomUUID() },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );
    res.json({ message: 'Password changed successfully', token: newToken });
  } catch (err) {
    next(err);
  }
}

async function changeEmail(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const user = await User.findById(req.user.userId).select('+passwordHash');
    if (!user) return res.status(404).json({ error: 'User not found' });

    const { email, currentPassword } = req.body;
    if (!(await user.comparePassword(currentPassword))) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const normalizedEmail = email.toLowerCase();

    if (normalizedEmail === user.email) {
      return res.status(400).json({ error: 'New email is the same as current email' });
    }

    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) return res.status(409).json({ error: 'Email is already in use' });

    const rawToken = crypto.randomBytes(32).toString('hex');
    user.pendingEmail = normalizedEmail;
    user.emailChangeToken = hashToken(rawToken);
    user.emailChangeTokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await user.save();

    const clientUrl = process.env.CLIENT_URL || 'http://localhost:8080';
    const verifyUrl = `${clientUrl}?emailChangeToken=${rawToken}`;
    emailService.sendEmailChangeVerificationEmail(normalizedEmail, user.name, verifyUrl).catch((err) =>
      logger.warn('Email change verification failed', { error: err.message })
    );

    res.json({ message: 'A verification link has been sent to your new email address. Please confirm to complete the change.' });
  } catch (err) {
    next(err);
  }
}

async function verifyEmailChange(req, res, next) {
  try {
    const { token } = req.query;
    if (!token) return res.status(400).json({ error: 'Token is required' });

    const user = await User.findOne({
      emailChangeToken: hashToken(token),
      emailChangeTokenExpiry: { $gt: new Date() },
    }).select('+emailChangeToken');
    if (!user) return res.status(400).json({ error: 'Invalid or expired verification link' });

    user.email = user.pendingEmail;
    user.pendingEmail = null;
    user.emailChangeToken = null;
    user.emailChangeTokenExpiry = null;
    await user.save();

    logger.info('Email address changed', { userId: user._id, newEmail: user.email });
    res.json({ message: 'Email address updated successfully', user });
  } catch (err) {
    next(err);
  }
}

async function deleteMe(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const user = await User.findById(req.user.userId).select('+passwordHash');
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (!(await user.comparePassword(req.body.password))) {
      return res.status(401).json({ error: 'Password is incorrect' });
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    user.status = 'deleted';
    user.deletedAt = new Date();
    user.recoveryToken = hashToken(rawToken);
    user.recoveryTokenExpiry = new Date(Date.now() + GRACE_DAYS * 24 * 60 * 60 * 1000);
    user.pendingEmail = null;
    user.emailChangeToken = null;
    user.emailChangeTokenExpiry = null;
    await user.save();

    if (req.user?.jti) revoke(req.user.jti, req.user.exp);

    const clientUrl = process.env.CLIENT_URL || 'http://localhost:8080';
    const recoveryUrl = `${clientUrl}?recoveryToken=${rawToken}`;
    emailService.sendAccountRecoveryEmail(user.email, user.name, recoveryUrl, GRACE_DAYS).catch((err) =>
      logger.warn('Recovery email failed', { error: err.message })
    );

    await AuditLog.create({
      action: 'account_deletion_scheduled',
      adminId: req.user.userId,
      targetId: req.user.userId,
      meta: { email: user.email, graceDays: GRACE_DAYS },
    }).catch(() => {});

    res.json({ message: `Your account has been scheduled for deletion in ${GRACE_DAYS} days. Check your email for recovery instructions.` });
  } catch (err) {
    next(err);
  }
}

module.exports = { getMe, updateMe, changePassword, changeEmail, verifyEmailChange, deleteMe };
