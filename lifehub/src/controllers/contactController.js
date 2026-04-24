const { validationResult } = require('express-validator');
const Contact = require('../models/Contact');

const ALLOWED_SORT = new Set(['firstName', 'lastName', 'company', 'createdAt']);

async function listContacts(req, res, next) {
  try {
    const { search, tag, sortBy = 'firstName', order = 'asc', page = 1, limit = 50 } = req.query;

    const filter = { userId: req.user.userId };
    if (search) {
      const re = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ firstName: re }, { lastName: re }, { email: re }, { company: re }, { address: re }, { phone: re }];
    }
    if (tag) filter.tags = tag;

    const sortField = ALLOWED_SORT.has(sortBy) ? sortBy : 'firstName';
    const sortDir = order === 'desc' ? -1 : 1;
    const sort = sortField === 'firstName'
      ? { firstName: sortDir, lastName: sortDir }
      : { [sortField]: sortDir };

    const skip = (Number(page) - 1) * Number(limit);
    const [contacts, total] = await Promise.all([
      Contact.find(filter).sort(sort).skip(skip).limit(Number(limit)),
      Contact.countDocuments(filter),
    ]);

    res.json({ contacts, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    next(err);
  }
}

async function createContact(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { firstName, lastName, email, phone, company, address, notes, tags } = req.body;
    const contact = await Contact.create({
      userId: req.user.userId,
      firstName,
      lastName: lastName || '',
      email: email || '',
      phone: phone || '',
      company: company || '',
      address: address || '',
      notes: notes || '',
      tags: tags || [],
    });

    res.status(201).json(contact);
  } catch (err) {
    next(err);
  }
}

async function getContact(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const contact = await Contact.findOne({ _id: req.params.id, userId: req.user.userId });
    if (!contact) return res.status(404).json({ error: 'Contact not found' });
    res.json(contact);
  } catch (err) {
    next(err);
  }
}

async function updateContact(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const allowed = ['firstName', 'lastName', 'email', 'phone', 'company', 'address', 'notes', 'tags'];
    const updates = {};
    for (const field of allowed) {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    }

    const contact = await Contact.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.userId },
      updates,
      { new: true, runValidators: true }
    );
    if (!contact) return res.status(404).json({ error: 'Contact not found' });
    res.json(contact);
  } catch (err) {
    next(err);
  }
}

async function toggleFavorite(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const contact = await Contact.findOne({ _id: req.params.id, userId: req.user.userId });
    if (!contact) return res.status(404).json({ error: 'Contact not found' });

    contact.favorite = !contact.favorite;
    await contact.save();
    res.json(contact);
  } catch (err) {
    next(err);
  }
}

async function deleteContact(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const contact = await Contact.findOneAndDelete({ _id: req.params.id, userId: req.user.userId });
    if (!contact) return res.status(404).json({ error: 'Contact not found' });
    res.json({ message: 'Contact deleted' });
  } catch (err) {
    next(err);
  }
}

module.exports = { listContacts, createContact, getContact, updateContact, toggleFavorite, deleteContact, exportContacts };

async function exportContacts(req, res, next) {
  try {
    const format = req.query.format || 'csv';
    if (!['json', 'csv'].includes(format)) return res.status(400).json({ error: 'Format must be json or csv' });
    const contacts = await Contact.find({ userId: req.user.userId }).lean();
    if (format === 'json') {
      res.setHeader('Content-Disposition', 'attachment; filename="contacts.json"');
      return res.json(contacts);
    }
    const fields = ['firstName', 'lastName', 'email', 'phone', 'company', 'notes', 'favorite', 'createdAt'];
    const csv = [
      fields.join(','),
      ...contacts.map(c => fields.map(f => JSON.stringify(c[f] ?? '')).join(',')),
    ].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="contacts.csv"');
    res.send(csv);
  } catch (err) { next(err); }
}
