const { validationResult } = require('express-validator');
const ShoppingList = require('../models/ShoppingList');

async function listLists(req, res, next) {
  try {
    const { page = 1, limit = 20 } = req.query;
    const filter = { userId: req.user.userId };
    const skip = (Number(page) - 1) * Number(limit);
    const [lists, total] = await Promise.all([
      ShoppingList.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
      ShoppingList.countDocuments(filter),
    ]);
    res.json({ lists, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    next(err);
  }
}

async function createList(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const list = await ShoppingList.create({ userId: req.user.userId, name: req.body.name });
    res.status(201).json(list);
  } catch (err) {
    next(err);
  }
}

async function getList(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const list = await ShoppingList.findOne({ _id: req.params.id, userId: req.user.userId });
    if (!list) return res.status(404).json({ error: 'Shopping list not found' });
    res.json(list);
  } catch (err) {
    next(err);
  }
}

async function updateList(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const list = await ShoppingList.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.userId },
      { name: req.body.name },
      { new: true, runValidators: true }
    );
    if (!list) return res.status(404).json({ error: 'Shopping list not found' });
    res.json(list);
  } catch (err) {
    next(err);
  }
}

async function deleteList(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const list = await ShoppingList.findOneAndDelete({ _id: req.params.id, userId: req.user.userId });
    if (!list) return res.status(404).json({ error: 'Shopping list not found' });
    res.json({ message: 'Shopping list deleted' });
  } catch (err) {
    next(err);
  }
}

async function addItem(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const list = await ShoppingList.findOne({ _id: req.params.id, userId: req.user.userId });
    if (!list) return res.status(404).json({ error: 'Shopping list not found' });

    const { name, quantity, unit } = req.body;
    list.items.push({
      name,
      quantity: quantity !== undefined ? quantity : 1,
      unit: unit || '',
    });
    await list.save();
    res.status(201).json(list);
  } catch (err) {
    next(err);
  }
}

async function updateItem(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const list = await ShoppingList.findOne({ _id: req.params.id, userId: req.user.userId });
    if (!list) return res.status(404).json({ error: 'Shopping list not found' });

    const item = list.items.id(req.params.itemId);
    if (!item) return res.status(404).json({ error: 'Item not found' });

    const allowed = ['name', 'quantity', 'unit'];
    for (const field of allowed) {
      if (req.body[field] !== undefined) item[field] = req.body[field];
    }
    await list.save();
    res.json(list);
  } catch (err) {
    next(err);
  }
}

async function toggleItem(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const list = await ShoppingList.findOne({ _id: req.params.id, userId: req.user.userId });
    if (!list) return res.status(404).json({ error: 'Shopping list not found' });

    const item = list.items.id(req.params.itemId);
    if (!item) return res.status(404).json({ error: 'Item not found' });

    item.checked = !item.checked;
    await list.save();
    res.json(list);
  } catch (err) {
    next(err);
  }
}

async function removeItem(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const list = await ShoppingList.findOne({ _id: req.params.id, userId: req.user.userId });
    if (!list) return res.status(404).json({ error: 'Shopping list not found' });

    const item = list.items.id(req.params.itemId);
    if (!item) return res.status(404).json({ error: 'Item not found' });

    list.items.pull(item._id);
    await list.save();
    res.json(list);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listLists, createList, getList, updateList, deleteList,
  addItem, updateItem, toggleItem, removeItem, exportShopping,
};

async function exportShopping(req, res, next) {
  try {
    const lists = await ShoppingList.find({ userId: req.user.userId }).lean();
    if (req.query.format === 'json') {
      res.setHeader('Content-Disposition', 'attachment; filename="shopping.json"');
      return res.json(lists);
    }
    const rows = [];
    for (const list of lists) {
      for (const item of (list.items || [])) {
        rows.push([list.name, item.name, item.checked, item.addedAt].map(v => JSON.stringify(v ?? '')).join(','));
      }
    }
    const csv = ['listName,itemName,checked,addedAt', ...rows].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="shopping.csv"');
    res.send(csv);
  } catch (err) { next(err); }
}
