const mongoose = require('mongoose');
const dbHelper = require('../helpers/dbHelper');

const User = require('../../src/models/User');
const Task = require('../../src/models/Task');
const Event = require('../../src/models/Event');
const ShoppingList = require('../../src/models/ShoppingList');

const validUserId = () => new mongoose.Types.ObjectId();

beforeAll(() => dbHelper.connect());
afterAll(() => dbHelper.disconnect());

// ── User ──────────────────────────────────────────────────────────────────────

describe('User model', () => {
  afterEach(() => User.deleteMany({}));

  it('saves successfully with required fields', async () => {
    const user = await User.create({ name: 'Alice', email: 'alice@example.com' });
    expect(user._id).toBeDefined();
    expect(user.role).toBe('user');
    expect(user.isActive).toBe(true);
    expect(user.status).toBe('active');
  });

  it('rejects when name is missing', async () => {
    await expect(User.create({ email: 'a@a.com' })).rejects.toThrow(/name/i);
  });

  it('rejects when email is missing', async () => {
    await expect(User.create({ name: 'Alice' })).rejects.toThrow(/email/i);
  });

  it('rejects an invalid role value', async () => {
    await expect(
      User.create({ name: 'Alice', email: 'a@a.com', role: 'superuser' })
    ).rejects.toThrow(/role/i);
  });

  it('rejects an invalid status value', async () => {
    await expect(
      User.create({ name: 'Alice', email: 'a@a.com', status: 'banned' })
    ).rejects.toThrow(/status/i);
  });

  it('rejects a duplicate email with a duplicate-key error (code 11000)', async () => {
    await User.create({ name: 'Alice', email: 'dup@example.com' });
    const err = await User.create({ name: 'Bob', email: 'dup@example.com' }).catch((e) => e);
    expect(err.code).toBe(11000);
  });

  it('stores email in lowercase', async () => {
    const user = await User.create({ name: 'Alice', email: 'UPPER@EXAMPLE.COM' });
    expect(user.email).toBe('upper@example.com');
  });

  it('toJSON omits sensitive fields', async () => {
    const user = await User.create({ name: 'Alice', email: 'json@example.com', passwordHash: 'hash' });
    const json = user.toJSON();
    expect(json.passwordHash).toBeUndefined();
    expect(json.resetToken).toBeUndefined();
  });
});

// ── Task ──────────────────────────────────────────────────────────────────────

describe('Task model', () => {
  const userId = validUserId();
  afterEach(() => Task.deleteMany({}));

  it('saves successfully with required fields', async () => {
    const task = await Task.create({ userId, title: 'Write tests' });
    expect(task._id).toBeDefined();
    expect(task.status).toBe('todo');
    expect(task.priority).toBe('medium');
    expect(task.description).toBe('');
    expect(task.dueDateReminderSent).toBe(false);
  });

  it('rejects when userId is missing', async () => {
    await expect(Task.create({ title: 'No user' })).rejects.toThrow(/userId/i);
  });

  it('rejects when title is missing', async () => {
    await expect(Task.create({ userId })).rejects.toThrow(/title/i);
  });

  it('rejects an invalid status value', async () => {
    await expect(
      Task.create({ userId, title: 'Bad status', status: 'completed' })
    ).rejects.toThrow(/status/i);
  });

  it('rejects an invalid priority value', async () => {
    await expect(
      Task.create({ userId, title: 'Bad priority', priority: 'urgent' })
    ).rejects.toThrow(/priority/i);
  });

  it('accepts all valid status values', async () => {
    for (const status of ['todo', 'in-progress', 'done']) {
      const t = await Task.create({ userId, title: `Status ${status}`, status });
      expect(t.status).toBe(status);
    }
  });

  it('accepts all valid priority values', async () => {
    for (const priority of ['low', 'medium', 'high']) {
      const t = await Task.create({ userId, title: `Priority ${priority}`, priority });
      expect(t.priority).toBe(priority);
    }
  });
});

// ── Event ─────────────────────────────────────────────────────────────────────

describe('Event model', () => {
  const userId = validUserId();
  afterEach(() => Event.deleteMany({}));

  it('saves successfully with required fields', async () => {
    const start = new Date();
    const event = await Event.create({ userId, title: 'Stand-up', start });
    expect(event._id).toBeDefined();
    expect(event.allDay).toBe(false);
    expect(event.reminderMinutes).toBe(15);
    expect(event.recurrence).toBe('none');
    expect(event.reminderSent).toBe(false);
  });

  it('rejects when userId is missing', async () => {
    await expect(Event.create({ title: 'No user', start: new Date() })).rejects.toThrow(/userId/i);
  });

  it('rejects when title is missing', async () => {
    await expect(Event.create({ userId, start: new Date() })).rejects.toThrow(/title/i);
  });

  it('rejects when start is missing', async () => {
    await expect(Event.create({ userId, title: 'No start' })).rejects.toThrow(/start/i);
  });

  it('rejects an invalid recurrence value', async () => {
    await expect(
      Event.create({ userId, title: 'Bad recur', start: new Date(), recurrence: 'yearly' })
    ).rejects.toThrow(/recurrence/i);
  });

  it('accepts all valid recurrence values', async () => {
    for (const recurrence of ['none', 'daily', 'weekly', 'monthly']) {
      const e = await Event.create({ userId, title: `Recur ${recurrence}`, start: new Date(), recurrence });
      expect(e.recurrence).toBe(recurrence);
    }
  });
});

// ── ShoppingList ──────────────────────────────────────────────────────────────

describe('ShoppingList model', () => {
  const userId = validUserId();
  afterEach(() => ShoppingList.deleteMany({}));

  it('saves a list with no items', async () => {
    const list = await ShoppingList.create({ userId, name: 'Groceries' });
    expect(list._id).toBeDefined();
    expect(list.items).toHaveLength(0);
  });

  it('rejects when userId is missing', async () => {
    await expect(ShoppingList.create({ name: 'No user' })).rejects.toThrow(/userId/i);
  });

  it('rejects when list name is missing', async () => {
    await expect(ShoppingList.create({ userId })).rejects.toThrow(/name/i);
  });

  it('saves items with correct defaults', async () => {
    const list = await ShoppingList.create({
      userId,
      name: 'Weekend shop',
      items: [{ name: 'Milk' }],
    });
    const item = list.items[0];
    expect(item.name).toBe('Milk');
    expect(item.quantity).toBe(1);
    expect(item.checked).toBe(false);
    expect(item.unit).toBe('');
  });

  it('rejects an item when name is missing', async () => {
    await expect(
      ShoppingList.create({ userId, name: 'Bad items', items: [{ quantity: 2 }] })
    ).rejects.toThrow(/name/i);
  });
});
