const mongoose = require('mongoose');
const crypto = require('crypto');
const { validationResult } = require('express-validator');
const User = require('../models/User');
const configService = require('../services/configService');
const emailService = require('../services/emailService');
const logger = require('../config/logger');

async function getStatus(req, res, next) {
  try {
    const dbState = mongoose.connection.readyState;
    const dbStatus = { 0: 'disconnected', 1: 'connected', 2: 'connecting', 3: 'disconnecting' };

    const emailProvider = await configService.get('email.provider');
    const emailUser = await configService.get('email.user');
    const userCount = await User.countDocuments();
    const pendingCount = await User.countDocuments({ status: 'pending' });

    res.json({
      database: { status: dbStatus[dbState] || 'unknown', state: dbState },
      email: {
        configured: !!(emailProvider && emailUser),
        provider: emailProvider || null,
        user: emailUser || null,
      },
      users: { total: userCount, pending: pendingCount },
      server: { uptime: Math.floor(process.uptime()), nodeVersion: process.version },
    });
  } catch (err) {
    next(err);
  }
}

async function getEmailConfig(req, res, next) {
  try {
    const config = await configService.getCategory('email', { maskSecrets: true });
    res.json(config);
  } catch (err) {
    next(err);
  }
}

async function updateEmailConfig(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { provider, user, password, clientId, clientSecret, refreshToken } = req.body;

    await configService.set('email.provider', provider, 'email');
    await configService.set('email.user', user, 'email');

    if (provider === 'gmail-smtp' && password) {
      await configService.set('email.password', password, 'email');
    }
    if (provider === 'gmail-oauth2') {
      if (clientId) await configService.set('email.clientId', clientId, 'email');
      if (clientSecret) await configService.set('email.clientSecret', clientSecret, 'email');
      if (refreshToken) await configService.set('email.refreshToken', refreshToken, 'email');
    }

    logger.info('Email config updated', { provider, user, updatedBy: req.user.userId });
    res.json({ message: 'Email configuration saved' });
  } catch (err) {
    next(err);
  }
}

async function testEmail(req, res, next) {
  try {
    const admin = await User.findById(req.user.userId);
    if (!admin) return res.status(404).json({ error: 'Admin user not found' });

    await emailService.sendWelcomeEmail(admin.email, admin.name);
    logger.info('Test email sent', { to: admin.email });
    res.json({ message: `Test email sent to ${admin.email}` });
  } catch (err) {
    logger.error('Test email failed', { error: err.message });
    res.status(502).json({ error: `Failed to send test email: ${err.message}` });
  }
}

async function listUsers(req, res, next) {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    const filter = {};
    if (req.query.status) filter.status = req.query.status;

    const [users, total] = await Promise.all([
      User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      User.countDocuments(filter),
    ]);

    res.json({ users, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    next(err);
  }
}

async function updateUser(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    if (req.params.id === req.user.userId) {
      return res.status(400).json({ error: 'Cannot modify your own account via admin panel' });
    }

    const allowed = {};
    if (req.body.role !== undefined) allowed.role = req.body.role;
    if (req.body.isActive !== undefined) {
      allowed.isActive = req.body.isActive;
      allowed.status = req.body.isActive ? 'active' : 'inactive';
    }

    const user = await User.findByIdAndUpdate(req.params.id, allowed, { new: true, runValidators: true });
    if (!user) return res.status(404).json({ error: 'User not found' });

    logger.info('User updated by admin', { targetId: req.params.id, changes: allowed, adminId: req.user.userId });
    res.json(user);
  } catch (err) {
    next(err);
  }
}

async function createUser(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { name, email, role } = req.body;
    const inviteToken = crypto.randomBytes(32).toString('hex');
    const inviteTokenExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const user = await User.create({
      name, email, role: role || 'user',
      passwordHash: null, isActive: false, status: 'invited',
      inviteToken, inviteTokenExpiry,
    });

    const clientUrl = process.env.CLIENT_URL || process.env.APP_URL || 'http://localhost:8080';
    const inviteUrl = `${clientUrl}?token=${inviteToken}`;
    emailService.sendInviteEmail(email, name, inviteUrl).catch((err) =>
      logger.warn('Invite email failed', { error: err.message })
    );

    logger.info('User created by admin', { targetId: user._id, adminId: req.user.userId });
    res.status(201).json(user);
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'An account with that email already exists' });
    next(err);
  }
}

async function approveUser(req, res, next) {
  try {
    const user = await User.findById(req.params.id).select('+inviteToken');
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.status !== 'pending') return res.status(400).json({ error: 'User is not in pending status' });

    user.inviteToken = crypto.randomBytes(32).toString('hex');
    user.inviteTokenExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    user.status = 'invited';
    await user.save();

    const clientUrl = process.env.CLIENT_URL || process.env.APP_URL || 'http://localhost:8080';
    const inviteUrl = `${clientUrl}?token=${user.inviteToken}`;
    emailService.sendInviteEmail(user.email, user.name, inviteUrl).catch((err) =>
      logger.warn('Invite email failed', { error: err.message })
    );

    logger.info('User approved by admin', { targetId: user._id, adminId: req.user.userId });
    res.json(user);
  } catch (err) {
    next(err);
  }
}

async function rejectUser(req, res, next) {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.status !== 'pending') return res.status(400).json({ error: 'User is not in pending status' });

    await User.findByIdAndDelete(req.params.id);
    logger.info('User rejected by admin', { targetId: req.params.id, adminId: req.user.userId });
    res.json({ message: 'Application rejected' });
  } catch (err) {
    next(err);
  }
}

module.exports = { getStatus, getEmailConfig, updateEmailConfig, testEmail, listUsers, updateUser, createUser, approveUser, rejectUser };
