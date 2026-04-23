const { validationResult } = require('express-validator');
const mongoose = require('mongoose');
const Category = require('../models/Category');
const Transaction = require('../models/Transaction');

// ── Categories ────────────────────────────────────────────────────────────────

async function listCategories(req, res, next) {
  try {
    const categories = await Category.find({ userId: req.user.userId }).sort({ type: 1, name: 1 });
    res.json(categories);
  } catch (err) {
    next(err);
  }
}

async function createCategory(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { name, type, color, icon } = req.body;
    const category = await Category.create({
      userId: req.user.userId,
      name,
      type,
      color: color || '',
      icon: icon || '',
    });
    res.status(201).json(category);
  } catch (err) {
    next(err);
  }
}

async function getCategory(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const category = await Category.findOne({ _id: req.params.id, userId: req.user.userId });
    if (!category) return res.status(404).json({ error: 'Category not found' });
    res.json(category);
  } catch (err) {
    next(err);
  }
}

async function updateCategory(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const allowed = ['name', 'type', 'color', 'icon'];
    const updates = {};
    for (const field of allowed) {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    }

    const category = await Category.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.userId },
      updates,
      { new: true, runValidators: true }
    );
    if (!category) return res.status(404).json({ error: 'Category not found' });
    res.json(category);
  } catch (err) {
    next(err);
  }
}

async function deleteCategory(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const category = await Category.findOneAndDelete({ _id: req.params.id, userId: req.user.userId });
    if (!category) return res.status(404).json({ error: 'Category not found' });

    // Null-out categoryId on any transactions that referenced this category
    await Transaction.updateMany({ userId: req.user.userId, categoryId: category._id }, { categoryId: null });

    res.json({ message: 'Category deleted' });
  } catch (err) {
    next(err);
  }
}

// ── Transactions ──────────────────────────────────────────────────────────────

async function listTransactions(req, res, next) {
  try {
    const { type, categoryId, from, to, page = 1, limit = 50 } = req.query;

    const filter = { userId: req.user.userId };
    if (type) filter.type = type;
    if (categoryId) filter.categoryId = categoryId;
    if (from || to) {
      filter.date = {};
      if (from) filter.date.$gte = new Date(from);
      if (to) filter.date.$lte = new Date(to);
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [transactions, total] = await Promise.all([
      Transaction.find(filter).sort({ date: -1 }).skip(skip).limit(Number(limit)).populate('categoryId', 'name type color icon'),
      Transaction.countDocuments(filter),
    ]);

    res.json({ transactions, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    next(err);
  }
}

async function createTransaction(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { amount, type, categoryId, description, date, tags } = req.body;

    if (categoryId) {
      const cat = await Category.findOne({ _id: categoryId, userId: req.user.userId });
      if (!cat) return res.status(400).json({ error: 'Category not found' });
    }

    const transaction = await Transaction.create({
      userId: req.user.userId,
      amount,
      type,
      categoryId: categoryId || null,
      description: description || '',
      date: date ? new Date(date) : new Date(),
      tags: tags || [],
    });

    res.status(201).json(transaction);
  } catch (err) {
    next(err);
  }
}

async function getTransaction(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const transaction = await Transaction.findOne({ _id: req.params.id, userId: req.user.userId })
      .populate('categoryId', 'name type color icon');
    if (!transaction) return res.status(404).json({ error: 'Transaction not found' });
    res.json(transaction);
  } catch (err) {
    next(err);
  }
}

async function updateTransaction(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const allowed = ['amount', 'type', 'categoryId', 'description', 'date', 'tags'];
    const updates = {};
    for (const field of allowed) {
      if (req.body[field] !== undefined) {
        updates[field] = field === 'date' ? new Date(req.body[field]) : req.body[field];
      }
    }

    if (updates.categoryId) {
      const cat = await Category.findOne({ _id: updates.categoryId, userId: req.user.userId });
      if (!cat) return res.status(400).json({ error: 'Category not found' });
    }

    const transaction = await Transaction.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.userId },
      updates,
      { new: true, runValidators: true }
    );
    if (!transaction) return res.status(404).json({ error: 'Transaction not found' });
    res.json(transaction);
  } catch (err) {
    next(err);
  }
}

async function deleteTransaction(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const transaction = await Transaction.findOneAndDelete({ _id: req.params.id, userId: req.user.userId });
    if (!transaction) return res.status(404).json({ error: 'Transaction not found' });
    res.json({ message: 'Transaction deleted' });
  } catch (err) {
    next(err);
  }
}

// ── Summary ───────────────────────────────────────────────────────────────────

async function getSummary(req, res, next) {
  try {
    const { from, to } = req.query;
    const match = { userId: req.user.userId };
    if (from || to) {
      match.date = {};
      if (from) match.date.$gte = new Date(from);
      if (to) match.date.$lte = new Date(to);
    }

    // Convert userId string to ObjectId for aggregation
    match.userId = new mongoose.Types.ObjectId(req.user.userId);

    const [totals, byCategory] = await Promise.all([
      Transaction.aggregate([
        { $match: match },
        { $group: { _id: '$type', total: { $sum: '$amount' }, count: { $sum: 1 } } },
      ]),
      Transaction.aggregate([
        { $match: match },
        {
          $group: {
            _id: { categoryId: '$categoryId', type: '$type' },
            total: { $sum: '$amount' },
            count: { $sum: 1 },
          },
        },
        {
          $lookup: {
            from: 'categories',
            localField: '_id.categoryId',
            foreignField: '_id',
            as: 'category',
          },
        },
        { $unwind: { path: '$category', preserveNullAndEmptyArrays: true } },
        {
          $project: {
            _id: 0,
            categoryId: '$_id.categoryId',
            categoryName: { $ifNull: ['$category.name', 'Uncategorized'] },
            type: '$_id.type',
            total: 1,
            count: 1,
          },
        },
        { $sort: { type: 1, total: -1 } },
      ]),
    ]);

    const income = totals.find(t => t._id === 'income');
    const expense = totals.find(t => t._id === 'expense');

    res.json({
      income: { total: income ? income.total : 0, count: income ? income.count : 0 },
      expense: { total: expense ? expense.total : 0, count: expense ? expense.count : 0 },
      balance: (income ? income.total : 0) - (expense ? expense.total : 0),
      byCategory,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listCategories, createCategory, getCategory, updateCategory, deleteCategory,
  listTransactions, createTransaction, getTransaction, updateTransaction, deleteTransaction,
  getSummary, exportTransactions,
};

async function exportTransactions(req, res, next) {
  try {
    const transactions = await Transaction.find({ userId: req.user.userId }).lean();
    if (req.query.format === 'json') {
      res.setHeader('Content-Disposition', 'attachment; filename="transactions.json"');
      return res.json(transactions);
    }
    const fields = ['description', 'amount', 'type', 'date', 'categoryId', 'createdAt'];
    const csv = [
      fields.join(','),
      ...transactions.map(t => fields.map(f => JSON.stringify(t[f] ?? '')).join(',')),
    ].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="transactions.csv"');
    res.send(csv);
  } catch (err) { next(err); }
}
