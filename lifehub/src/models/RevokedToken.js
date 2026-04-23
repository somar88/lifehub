'use strict';
const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  jti:       { type: String, required: true, unique: true },
  expiresAt: { type: Date,   required: true },
}, { timestamps: false });

schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('RevokedToken', schema);
