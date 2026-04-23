const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, trim: true, maxlength: 2000, default: '' },
    start: { type: Date, required: true },
    end: { type: Date, default: null },
    allDay: { type: Boolean, default: false },
    location: { type: String, trim: true, maxlength: 300, default: '' },
    color: { type: String, trim: true, maxlength: 20, default: '' },
    reminderMinutes: { type: Number, default: 15, min: 0 },
    reminderSent:    { type: Boolean, default: false },
    recurrence:        { type: String, enum: ['none', 'daily', 'weekly', 'monthly'], default: 'none' },
    recurrenceEnd:     { type: Date, default: null },
    recurrenceGroupId: { type: String, default: null },
  },
  { timestamps: true }
);

eventSchema.index({ userId: 1, start: 1 });
eventSchema.index({ userId: 1, end: 1 });

module.exports = mongoose.model('Event', eventSchema);
