const { validationResult } = require('express-validator');
const Task = require('../models/Task');

async function listTasks(req, res, next) {
  try {
    const { status, priority, tag, dueAfter, dueBefore, sortBy = 'createdAt', order = 'desc', page = 1, limit = 20 } = req.query;

    const filter = { userId: req.user.userId };
    if (status) filter.status = status;
    if (priority) filter.priority = priority;
    if (tag) filter.tags = tag;
    if (dueAfter || dueBefore) {
      filter.dueDate = {};
      if (dueAfter) filter.dueDate.$gte = new Date(dueAfter);
      if (dueBefore) filter.dueDate.$lte = new Date(dueBefore);
    }

    const allowedSort = { createdAt: 1, dueDate: 1, priority: 1 };
    const sortField = allowedSort[sortBy] ? sortBy : 'createdAt';
    const sortDir = order === 'asc' ? 1 : -1;

    const skip = (Number(page) - 1) * Number(limit);
    const [tasks, total] = await Promise.all([
      Task.find(filter).sort({ [sortField]: sortDir }).skip(skip).limit(Number(limit)),
      Task.countDocuments(filter),
    ]);

    res.json({ tasks, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    next(err);
  }
}

async function getTaskStats(req, res, next) {
  try {
    const userId = req.user.userId;
    const now = new Date();

    const [byStatus, overdue] = await Promise.all([
      Task.aggregate([
        { $match: { userId: require('mongoose').Types.ObjectId.createFromHexString(userId) } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      Task.countDocuments({
        userId,
        status: { $ne: 'done' },
        dueDate: { $lt: now, $ne: null },
      }),
    ]);

    const stats = { todo: 0, 'in-progress': 0, done: 0, overdue };
    for (const s of byStatus) stats[s._id] = s.count;

    res.json(stats);
  } catch (err) {
    next(err);
  }
}

async function createTask(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { title, description, status, priority, dueDate, tags } = req.body;
    const task = await Task.create({
      userId: req.user.userId,
      title,
      description,
      status,
      priority,
      dueDate: dueDate || null,
      tags: tags || [],
    });

    res.status(201).json(task);
  } catch (err) {
    next(err);
  }
}

async function getTask(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const task = await Task.findOne({ _id: req.params.id, userId: req.user.userId });
    if (!task) return res.status(404).json({ error: 'Task not found' });
    res.json(task);
  } catch (err) {
    next(err);
  }
}

async function updateTask(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const allowed = ['title', 'description', 'status', 'priority', 'dueDate', 'tags'];
    const updates = {};
    for (const field of allowed) {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    }

    const task = await Task.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.userId },
      updates,
      { new: true, runValidators: true }
    );
    if (!task) return res.status(404).json({ error: 'Task not found' });
    res.json(task);
  } catch (err) {
    next(err);
  }
}

async function duplicateTask(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const source = await Task.findOne({ _id: req.params.id, userId: req.user.userId });
    if (!source) return res.status(404).json({ error: 'Task not found' });

    const copy = await Task.create({
      userId: source.userId,
      title: `${source.title} (copy)`,
      description: source.description,
      status: 'todo',
      priority: source.priority,
      dueDate: source.dueDate,
      tags: [...source.tags],
    });

    res.status(201).json(copy);
  } catch (err) {
    next(err);
  }
}

async function deleteTask(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const task = await Task.findOneAndDelete({ _id: req.params.id, userId: req.user.userId });
    if (!task) return res.status(404).json({ error: 'Task not found' });
    res.json({ message: 'Task deleted' });
  } catch (err) {
    next(err);
  }
}

module.exports = { listTasks, getTaskStats, createTask, getTask, updateTask, duplicateTask, deleteTask, exportTasks };

async function exportTasks(req, res, next) {
  try {
    const tasks = await Task.find({ userId: req.user.userId }).lean();
    if (req.query.format === 'json') {
      res.setHeader('Content-Disposition', 'attachment; filename="tasks.json"');
      return res.json(tasks);
    }
    const fields = ['title', 'status', 'priority', 'dueDate', 'notes', 'createdAt'];
    const csv = [
      fields.join(','),
      ...tasks.map(t => fields.map(f => JSON.stringify(t[f] ?? '')).join(',')),
    ].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="tasks.csv"');
    res.send(csv);
  } catch (err) { next(err); }
}
