'use strict';
const mongoose = require('mongoose');
const crypto = require('crypto');
const { validationResult } = require('express-validator');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const configService = require('../services/configService');
const emailService = require('../services/emailService');
const logger = require('../config/logger');

function hashToken(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

async function audit(action, adminId, targetId, changes, meta) {
  await AuditLog.create({ action, adminId, targetId: targetId || null, changes: changes || null, meta: meta || null })
    .catch((err) => logger.warn('Audit log write failed', { error: err.message }));
}

async function getStatus(req, res, next) {
  try {
    const dbState = mongoose.connection.readyState;
    const dbStatus = { 0: 'disconnected', 1: 'connected', 2: 'connecting', 3: 'disconnecting' };

    const emailProvider = await configService.get('email.provider');
    const emailUser = await configService.get('email.user');

    const [total, pending, active, invited, inactive, deleted] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ status: 'pending' }),
      User.countDocuments({ status: 'active' }),
      User.countDocuments({ status: 'invited' }),
      User.countDocuments({ status: 'inactive' }),
      User.countDocuments({ status: 'deleted' }),
    ]);

    res.json({
      database: { status: dbStatus[dbState] || 'unknown', state: dbState },
      email: {
        configured: !!(emailProvider && emailUser),
        provider: emailProvider || null,
        user: emailUser || null,
      },
      users: { total, pending, active, invited, inactive, deleted },
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

    await audit('email_config_updated', req.user.userId, null, { provider, user });
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
    if (req.query.search) {
      const escaped = req.query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(escaped, 'i');
      filter.$or = [{ name: re }, { email: re }];
    }

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

    await audit('user_updated', req.user.userId, req.params.id, allowed);
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
    const rawToken = crypto.randomBytes(32).toString('hex');
    const inviteTokenExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const user = await User.create({
      name, email, role: role || 'user',
      passwordHash: null, isActive: false, status: 'invited',
      inviteToken: hashToken(rawToken), inviteTokenExpiry,
    });

    const clientUrl = process.env.CLIENT_URL || process.env.APP_URL || 'http://localhost:8080';
    const inviteUrl = `${clientUrl}?token=${rawToken}`;
    emailService.sendInviteEmail(email, name, inviteUrl).catch((err) =>
      logger.warn('Invite email failed', { error: err.message })
    );

    await audit('user_created', req.user.userId, user._id, { email, role: role || 'user' });
    logger.info('User created by admin', { targetId: user._id, adminId: req.user.userId });
    res.status(201).json(user);
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'An account with that email already exists' });
    next(err);
  }
}

async function approveUser(req, res, next) {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.status !== 'pending') return res.status(400).json({ error: 'User is not in pending status' });

    const rawToken = crypto.randomBytes(32).toString('hex');
    user.inviteToken = hashToken(rawToken);
    user.inviteTokenExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    user.status = 'invited';
    await user.save();

    const clientUrl = process.env.CLIENT_URL || process.env.APP_URL || 'http://localhost:8080';
    const inviteUrl = `${clientUrl}?token=${rawToken}`;
    emailService.sendInviteEmail(user.email, user.name, inviteUrl).catch((err) =>
      logger.warn('Invite email failed', { error: err.message })
    );

    await audit('user_approved', req.user.userId, user._id);
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
    await audit('user_rejected', req.user.userId, req.params.id, { email: user.email });
    logger.info('User rejected by admin', { targetId: req.params.id, adminId: req.user.userId });
    res.json({ message: 'Application rejected' });
  } catch (err) {
    next(err);
  }
}

async function resendInvite(req, res, next) {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.status !== 'invited') return res.status(400).json({ error: 'User is not in invited status' });

    const rawToken = crypto.randomBytes(32).toString('hex');
    user.inviteToken = hashToken(rawToken);
    user.inviteTokenExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await user.save();

    const clientUrl = process.env.CLIENT_URL || process.env.APP_URL || 'http://localhost:8080';
    const inviteUrl = `${clientUrl}?token=${rawToken}`;
    emailService.sendInviteEmail(user.email, user.name, inviteUrl).catch((err) =>
      logger.warn('Invite email failed', { error: err.message })
    );

    await audit('invite_resent', req.user.userId, user._id);
    logger.info('Invite resent by admin', { targetId: user._id, adminId: req.user.userId });
    res.json({ message: 'Invite resent successfully' });
  } catch (err) {
    next(err);
  }
}

async function revokeUserSessions(req, res, next) {
  try {
    if (req.params.id === req.user.userId) {
      return res.status(400).json({ error: 'Cannot revoke your own sessions via admin panel' });
    }

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    user.tokensValidFrom = new Date();
    await user.save();

    await audit('sessions_revoked', req.user.userId, user._id);
    logger.info('User sessions revoked by admin', { targetId: req.params.id, adminId: req.user.userId });
    res.json({ message: 'All active sessions have been revoked' });
  } catch (err) {
    next(err);
  }
}

async function cancelDeletion(req, res, next) {
  try {
    const user = await User.findById(req.params.id).select('+recoveryToken +recoveryTokenExpiry');
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.status !== 'deleted') return res.status(400).json({ error: 'User account is not scheduled for deletion' });

    user.status = 'active';
    user.deletedAt = null;
    user.recoveryToken = null;
    user.recoveryTokenExpiry = null;
    await user.save();

    await audit('deletion_cancelled', req.user.userId, user._id, null, { email: user.email });
    logger.info('Account deletion cancelled by admin', { targetId: user._id, adminId: req.user.userId });
    res.json(user);
  } catch (err) {
    next(err);
  }
}

async function getAuditLog(req, res, next) {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    const filter = {};
    if (req.query.action) filter.action = req.query.action;
    if (req.query.adminId) filter.adminId = req.query.adminId;
    if (req.query.targetId) filter.targetId = req.query.targetId;

    const [logs, total] = await Promise.all([
      AuditLog.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('adminId', 'name email')
        .populate('targetId', 'name email'),
      AuditLog.countDocuments(filter),
    ]);

    res.json({ logs, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getStatus,
  getEmailConfig, updateEmailConfig, testEmail,
  listUsers, updateUser, createUser, approveUser, rejectUser, resendInvite, revokeUserSessions, cancelDeletion,
  getAuditLog,
};
