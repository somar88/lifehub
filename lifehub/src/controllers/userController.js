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
const { revoke } = require('../middleware/tokenBlacklist');

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

    user.email = email.toLowerCase();
    await user.save();

    res.json(user);
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

    await User.findByIdAndDelete(req.user.userId);

    await Promise.all([
      Task.deleteMany({ userId: req.user.userId }),
      Event.deleteMany({ userId: req.user.userId }),
      Contact.deleteMany({ userId: req.user.userId }),
      Category.deleteMany({ userId: req.user.userId }),
      Transaction.deleteMany({ userId: req.user.userId }),
      ShoppingList.deleteMany({ userId: req.user.userId }),
    ]);

    if (req.user?.jti) revoke(req.user.jti, req.user.exp);
    res.json({ message: 'Account deleted' });
  } catch (err) {
    next(err);
  }
}

module.exports = { getMe, updateMe, changePassword, changeEmail, deleteMe };
