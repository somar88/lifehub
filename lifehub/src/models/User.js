'use strict';
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    firstName: { type: String, trim: true, default: '' },
    lastName: { type: String, trim: true, default: '' },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, default: null, select: false },
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
    isActive: { type: Boolean, default: true },
    status: { type: String, enum: ['pending', 'invited', 'active', 'inactive'], default: 'active' },

    // Password reset
    resetToken: { type: String, default: null },
    resetTokenExpiry: { type: Date, default: null },

    // Invite flow
    inviteToken: { type: String, default: null, select: false },
    inviteTokenExpiry: { type: Date, default: null },

    // Email change verification
    pendingEmail: { type: String, default: null },
    emailChangeToken: { type: String, default: null, select: false },
    emailChangeTokenExpiry: { type: Date, default: null },

    // Telegram
    telegramChatId: { type: String, default: null, sparse: true },
    telegramLinkToken: { type: String, default: null, select: false },
    telegramLinkTokenExpiry: { type: Date, default: null },

    // Preferences
    dailyDigestHour: { type: Number, default: 8, min: 0, max: 23 },
    lastDigestDate: { type: Date, default: null },
    timezone: { type: String, default: 'UTC', trim: true },

    // Account lockout
    loginAttempts: { type: Number, default: 0, select: false },
    lockUntil: { type: Date, default: null },

    // Activity tracking
    lastLoginAt: { type: Date, default: null },

    // Session revocation — tokens issued before this date are invalid
    tokensValidFrom: { type: Date, default: null },
  },
  { timestamps: true }
);

userSchema.virtual('isLocked').get(function () {
  return !!(this.lockUntil && this.lockUntil > Date.now());
});

userSchema.methods.comparePassword = function (password) {
  return bcrypt.compare(password, this.passwordHash);
};

userSchema.methods.toJSON = function () {
  const obj = this.toObject({ virtuals: false });
  delete obj.passwordHash;
  delete obj.resetToken;
  delete obj.resetTokenExpiry;
  delete obj.inviteToken;
  delete obj.inviteTokenExpiry;
  delete obj.emailChangeToken;
  delete obj.emailChangeTokenExpiry;
  delete obj.telegramLinkToken;
  delete obj.telegramLinkTokenExpiry;
  delete obj.loginAttempts;
  delete obj.tokensValidFrom;
  return obj;
};

userSchema.index({ dailyDigestHour: 1, lastDigestDate: 1 });

module.exports = mongoose.model('User', userSchema);
