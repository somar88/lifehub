const { validationResult } = require('express-validator');
const crypto = require('crypto');
const Event = require('../models/Event');

async function listEvents(req, res, next) {
  try {
    const { from, to, allDay, search, page = 1, limit = 50 } = req.query;

    const filter = { userId: req.user.userId };

    if (from || to) {
      if (from) {
        filter.$or = [
          { end: { $gte: new Date(from) } },
          { end: null },
        ];
      }
      if (to) filter.start = { $lte: new Date(to) };
      if (from && !to) filter.start = { $gte: new Date(from) };
    }

    if (allDay !== undefined) filter.allDay = allDay === 'true';

    if (search) {
      const re = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      const searchConditions = [{ title: re }, { description: re }];
      filter.$or = filter.$or
        ? [{ $and: [{ $or: filter.$or }, { $or: searchConditions }] }]
        : searchConditions;
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [events, total] = await Promise.all([
      Event.find(filter).sort({ start: 1 }).skip(skip).limit(Number(limit)),
      Event.countDocuments(filter),
    ]);

    res.json({ events, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    next(err);
  }
}

async function getUpcoming(req, res, next) {
  try {
    const limit = Math.min(Number(req.query.limit) || 5, 50);
    const events = await Event.find({
      userId: req.user.userId,
      start: { $gte: new Date() },
    }).sort({ start: 1 }).limit(limit);

    res.json(events);
  } catch (err) {
    next(err);
  }
}

async function createEvent(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { title, description, start, end, allDay, location, color, recurrence, recurrenceEnd } = req.body;
    const base = {
      userId:      req.user.userId,
      title,
      description: description || '',
      start:       new Date(start),
      end:         end ? new Date(end) : null,
      allDay:      allDay || false,
      location:    location || '',
      color:       color || '',
    };

    if (!recurrence || recurrence === 'none') {
      const event = await Event.create(base);
      return res.status(201).json(event);
    }

    const groupId = crypto.randomUUID();
    const durationMs = end ? new Date(end) - new Date(start) : 0;
    const endLimit = recurrenceEnd ? new Date(recurrenceEnd) : new Date(Date.now() + 6 * 30 * 24 * 3600 * 1000);
    const instances = [];
    const cursor = new Date(start);
    while (cursor <= endLimit) {
      instances.push({
        ...base,
        start: new Date(cursor),
        end:   durationMs ? new Date(cursor.getTime() + durationMs) : null,
        recurrence,
        recurrenceGroupId: groupId,
      });
      if (recurrence === 'daily')        cursor.setDate(cursor.getDate() + 1);
      else if (recurrence === 'weekly')  cursor.setDate(cursor.getDate() + 7);
      else if (recurrence === 'monthly') cursor.setMonth(cursor.getMonth() + 1);
    }
    const created = await Event.insertMany(instances);
    return res.status(201).json(created[0]);
  } catch (err) {
    next(err);
  }
}

async function getEvent(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const event = await Event.findOne({ _id: req.params.id, userId: req.user.userId });
    if (!event) return res.status(404).json({ error: 'Event not found' });
    res.json(event);
  } catch (err) {
    next(err);
  }
}

async function updateEvent(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const allowed = ['title', 'description', 'start', 'end', 'allDay', 'location', 'color'];
    const updates = {};
    for (const field of allowed) {
      if (req.body[field] !== undefined) {
        updates[field] = (field === 'start' || field === 'end')
          ? (req.body[field] ? new Date(req.body[field]) : null)
          : req.body[field];
      }
    }

    const event = await Event.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.userId },
      updates,
      { new: true, runValidators: true }
    );
    if (!event) return res.status(404).json({ error: 'Event not found' });
    res.json(event);
  } catch (err) {
    next(err);
  }
}

async function deleteEvent(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const event = await Event.findOne({ _id: req.params.id, userId: req.user.userId });
    if (!event) return res.status(404).json({ error: 'Event not found' });

    if (event.recurrenceGroupId && req.query.all === 'true') {
      await Event.deleteMany({ recurrenceGroupId: event.recurrenceGroupId, userId: req.user.userId });
    } else {
      await event.deleteOne();
    }
    res.json({ message: 'Event deleted' });
  } catch (err) {
    next(err);
  }
}

module.exports = { listEvents, getUpcoming, createEvent, getEvent, updateEvent, deleteEvent, exportEvents };

async function exportEvents(req, res, next) {
  try {
    const events = await Event.find({ userId: req.user.userId }).lean();
    if (req.query.format === 'json') {
      res.setHeader('Content-Disposition', 'attachment; filename="events.json"');
      return res.json(events);
    }
    const fields = ['title', 'start', 'end', 'location', 'description', 'reminderMinutes', 'createdAt'];
    const csv = [
      fields.join(','),
      ...events.map(e => fields.map(f => JSON.stringify(e[f] ?? '')).join(',')),
    ].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="events.csv"');
    res.send(csv);
  } catch (err) { next(err); }
}
