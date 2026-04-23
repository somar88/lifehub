const mongoose = require('mongoose');

const contactSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    firstName: { type: String, required: true, trim: true, maxlength: 100 },
    lastName: { type: String, trim: true, maxlength: 100, default: '' },
    email: { type: String, trim: true, lowercase: true, maxlength: 200, default: '' },
    phone: { type: String, trim: true, maxlength: 50, default: '' },
    company: { type: String, trim: true, maxlength: 200, default: '' },
    address: { type: String, trim: true, maxlength: 500, default: '' },
    notes: { type: String, trim: true, maxlength: 2000, default: '' },
    tags: [{ type: String, trim: true, maxlength: 50 }],
    favorite: { type: Boolean, default: false },
  },
  { timestamps: true }
);

contactSchema.index({ userId: 1, firstName: 1, lastName: 1 });
contactSchema.index({ userId: 1, email: 1 });
contactSchema.index({ userId: 1, favorite: 1 });

module.exports = mongoose.model('Contact', contactSchema);
