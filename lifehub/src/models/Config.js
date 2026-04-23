const mongoose = require('mongoose');

const configSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, trim: true },
    value: { type: String, required: true },
    encrypted: { type: Boolean, default: false },
    category: { type: String, default: 'general', trim: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Config', configSchema);
