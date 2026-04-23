const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    firstName: { type: String, trim: true, default: '' },
    lastName: { type: String, trim: true, default: '' },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, default: null },
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
    isActive: { type: Boolean, default: true },
    status: { type: String, enum: ['pending', 'invited', 'active', 'inactive'], default: 'active' },
    resetToken: { type: String, default: null },
    resetTokenExpiry: { type: Date, default: null },
    inviteToken: { type: String, default: null, select: false },
    inviteTokenExpiry: { type: Date, default: null },
    telegramChatId:          { type: String, default: null, sparse: true },
    telegramLinkToken:       { type: String, default: null, select: false },
    telegramLinkTokenExpiry: { type: Date,   default: null },
    dailyDigestHour:         { type: Number, default: 8, min: 0, max: 23 },
    lastDigestDate:          { type: Date,   default: null },
  },
  { timestamps: true }
);

userSchema.methods.comparePassword = function (password) {
  return bcrypt.compare(password, this.passwordHash);
};

userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.passwordHash;
  delete obj.resetToken;
  delete obj.resetTokenExpiry;
  delete obj.inviteToken;
  delete obj.inviteTokenExpiry;
  delete obj.telegramLinkToken;
  delete obj.telegramLinkTokenExpiry;
  return obj;
};

module.exports = mongoose.model('User', userSchema);
