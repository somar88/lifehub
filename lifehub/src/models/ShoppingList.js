const mongoose = require('mongoose');

const itemSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 200 },
  quantity: { type: Number, default: 1, min: 0 },
  unit: { type: String, trim: true, maxlength: 50, default: '' },
  checked: { type: Boolean, default: false },
  addedAt: { type: Date, default: Date.now },
});

const shoppingListSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 200 },
    items: [itemSchema],
  },
  { timestamps: true }
);

module.exports = mongoose.model('ShoppingList', shoppingListSchema);
