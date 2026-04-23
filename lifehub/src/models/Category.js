const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    type: { type: String, enum: ['income', 'expense'], required: true },
    color: { type: String, trim: true, maxlength: 20, default: '' },
    icon: { type: String, trim: true, maxlength: 50, default: '' },
  },
  { timestamps: true }
);

categorySchema.index({ userId: 1, name: 1 });

module.exports = mongoose.model('Category', categorySchema);
