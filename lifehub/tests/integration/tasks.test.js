process.env.JWT_SECRET = 'test-secret';
process.env.ENCRYPTION_KEY = 'c'.repeat(64);

const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../../src/app');
const User = require('../../src/models/User');
const Task = require('../../src/models/Task');
const dbHelper = require('../helpers/dbHelper');

async function createUser(overrides = {}) {
  const defaults = { name: 'Test', email: 'test@example.com', password: 'password123' };
  const d = { ...defaults, ...overrides };
  const passwordHash = await bcrypt.hash(d.password, 4);
  return User.create({ name: d.name, email: d.email, passwordHash, isActive: true });
}

async function loginAs(email, password = 'password123') {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  return res.body.token;
}

describe('Tasks API', () => {
  let tokenA, tokenB, userA, userB;

  beforeAll(() => dbHelper.connect());
  afterAll(() => dbHelper.disconnect());

  beforeEach(async () => {
    await User.deleteMany({});
    await Task.deleteMany({});
    userA = await createUser({ email: 'a@example.com' });
    userB = await createUser({ email: 'b@example.com' });
    tokenA = await loginAs('a@example.com');
    tokenB = await loginAs('b@example.com');
  });

  // ── Auth guard ────────────────────────────────────────────────────────────

  it('returns 401 with no token', async () => {
    const res = await request(app).get('/api/tasks');
    expect(res.statusCode).toBe(401);
  });

  // ── Create ────────────────────────────────────────────────────────────────

  describe('POST /api/tasks', () => {
    it('creates a task with all fields', async () => {
      const res = await request(app)
        .post('/api/tasks')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ title: 'Buy milk', description: 'Full fat', status: 'todo', priority: 'low', dueDate: '2026-12-31', tags: ['shopping'] });
      expect(res.statusCode).toBe(201);
      expect(res.body.title).toBe('Buy milk');
      expect(res.body.status).toBe('todo');
      expect(res.body.priority).toBe('low');
      expect(res.body.tags).toContain('shopping');
    });

    it('creates a task with only required title', async () => {
      const res = await request(app)
        .post('/api/tasks')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ title: 'Minimal task' });
      expect(res.statusCode).toBe(201);
      expect(res.body.status).toBe('todo');
      expect(res.body.priority).toBe('medium');
    });

    it('returns 400 when title is missing', async () => {
      const res = await request(app)
        .post('/api/tasks')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ description: 'No title' });
      expect(res.statusCode).toBe(400);
    });

    it('returns 400 for invalid status', async () => {
      const res = await request(app)
        .post('/api/tasks')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ title: 'Bad status', status: 'invalid' });
      expect(res.statusCode).toBe(400);
    });

    it('returns 400 for invalid priority', async () => {
      const res = await request(app)
        .post('/api/tasks')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ title: 'Bad priority', priority: 'urgent' });
      expect(res.statusCode).toBe(400);
    });
  });

  // ── List + Filter + Sort ──────────────────────────────────────────────────

  describe('GET /api/tasks', () => {
    beforeEach(async () => {
      await Task.create([
        { userId: userA._id, title: 'Task 1', status: 'todo', priority: 'high', dueDate: new Date('2026-06-01') },
        { userId: userA._id, title: 'Task 2', status: 'in-progress', priority: 'medium', dueDate: new Date('2026-05-01') },
        { userId: userA._id, title: 'Task 3', status: 'done', priority: 'low' },
        { userId: userB._id, title: 'Other user task', status: 'todo', priority: 'high' },
      ]);
    });

    it('returns only the calling user\'s tasks', async () => {
      const res = await request(app).get('/api/tasks').set('Authorization', `Bearer ${tokenA}`);
      expect(res.statusCode).toBe(200);
      expect(res.body.total).toBe(3);
      res.body.tasks.forEach(t => expect(t.userId).toBe(String(userA._id)));
    });

    it('filters by status', async () => {
      const res = await request(app).get('/api/tasks?status=todo').set('Authorization', `Bearer ${tokenA}`);
      expect(res.body.total).toBe(1);
      expect(res.body.tasks[0].status).toBe('todo');
    });

    it('filters by priority', async () => {
      const res = await request(app).get('/api/tasks?priority=high').set('Authorization', `Bearer ${tokenA}`);
      expect(res.body.total).toBe(1);
      expect(res.body.tasks[0].priority).toBe('high');
    });

    it('sorts by dueDate ascending', async () => {
      const res = await request(app).get('/api/tasks?sortBy=dueDate&order=asc').set('Authorization', `Bearer ${tokenA}`);
      // null dueDates last — first two results have dates
      const withDates = res.body.tasks.filter(t => t.dueDate);
      expect(new Date(withDates[0].dueDate) <= new Date(withDates[1].dueDate)).toBe(true);
    });

    it('paginates results', async () => {
      const res = await request(app).get('/api/tasks?page=1&limit=2').set('Authorization', `Bearer ${tokenA}`);
      expect(res.body.tasks.length).toBe(2);
      expect(res.body.total).toBe(3);
      expect(res.body.page).toBe(1);
    });
  });

  // ── Read single ───────────────────────────────────────────────────────────

  describe('GET /api/tasks/:id', () => {
    it('returns a task by id', async () => {
      const task = await Task.create({ userId: userA._id, title: 'Read me' });
      const res = await request(app).get(`/api/tasks/${task._id}`).set('Authorization', `Bearer ${tokenA}`);
      expect(res.statusCode).toBe(200);
      expect(res.body.title).toBe('Read me');
    });

    it('returns 404 for another user\'s task', async () => {
      const task = await Task.create({ userId: userB._id, title: 'Not yours' });
      const res = await request(app).get(`/api/tasks/${task._id}`).set('Authorization', `Bearer ${tokenA}`);
      expect(res.statusCode).toBe(404);
    });

    it('returns 400 for an invalid mongo id', async () => {
      const res = await request(app).get('/api/tasks/not-an-id').set('Authorization', `Bearer ${tokenA}`);
      expect(res.statusCode).toBe(400);
    });
  });

  // ── Update ────────────────────────────────────────────────────────────────

  describe('PATCH /api/tasks/:id', () => {
    it('updates allowed fields', async () => {
      const task = await Task.create({ userId: userA._id, title: 'Old title', status: 'todo' });
      const res = await request(app)
        .patch(`/api/tasks/${task._id}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ title: 'New title', status: 'done' });
      expect(res.statusCode).toBe(200);
      expect(res.body.title).toBe('New title');
      expect(res.body.status).toBe('done');
    });

    it('returns 404 when trying to update another user\'s task', async () => {
      const task = await Task.create({ userId: userB._id, title: 'Not yours' });
      const res = await request(app)
        .patch(`/api/tasks/${task._id}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ title: 'Hacked' });
      expect(res.statusCode).toBe(404);
    });

    it('returns 400 for invalid status on update', async () => {
      const task = await Task.create({ userId: userA._id, title: 'Task' });
      const res = await request(app)
        .patch(`/api/tasks/${task._id}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ status: 'flying' });
      expect(res.statusCode).toBe(400);
    });

    it('resets dueDateReminderSent when dueDate is changed', async () => {
      const task = await Task.create({
        userId: userA._id, title: 'Reminder task',
        dueDate: new Date('2026-05-01'), dueDateReminderSent: true,
      });
      const res = await request(app)
        .patch(`/api/tasks/${task._id}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ dueDate: '2026-06-01' });
      expect(res.statusCode).toBe(200);
      const updated = await Task.findById(task._id);
      expect(updated.dueDateReminderSent).toBe(false);
    });

    it('resets dueDateReminderSent when status changes from done back to todo', async () => {
      const task = await Task.create({
        userId: userA._id, title: 'Reopen task',
        status: 'done', dueDateReminderSent: true,
      });
      const res = await request(app)
        .patch(`/api/tasks/${task._id}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ status: 'todo' });
      expect(res.statusCode).toBe(200);
      const updated = await Task.findById(task._id);
      expect(updated.dueDateReminderSent).toBe(false);
    });
  });

  // ── Delete ────────────────────────────────────────────────────────────────

  describe('DELETE /api/tasks/:id', () => {
    it('deletes own task', async () => {
      const task = await Task.create({ userId: userA._id, title: 'Delete me' });
      const res = await request(app).delete(`/api/tasks/${task._id}`).set('Authorization', `Bearer ${tokenA}`);
      expect(res.statusCode).toBe(200);
      expect(await Task.findById(task._id)).toBeNull();
    });

    it('returns 404 when deleting another user\'s task', async () => {
      const task = await Task.create({ userId: userB._id, title: 'Not yours' });
      const res = await request(app).delete(`/api/tasks/${task._id}`).set('Authorization', `Bearer ${tokenA}`);
      expect(res.statusCode).toBe(404);
    });
  });

  // ── Tag filter ────────────────────────────────────────────────────────────

  describe('GET /api/tasks?tag=', () => {
    it('filters tasks by tag', async () => {
      await Task.create([
        { userId: userA._id, title: 'Tagged',   tags: ['work', 'urgent'] },
        { userId: userA._id, title: 'Also tagged', tags: ['work'] },
        { userId: userA._id, title: 'No tag',   tags: [] },
      ]);
      const res = await request(app).get('/api/tasks?tag=work').set('Authorization', `Bearer ${tokenA}`);
      expect(res.body.total).toBe(2);
      res.body.tasks.forEach(t => expect(t.tags).toContain('work'));
    });
  });

  // ── Due-date range filter ─────────────────────────────────────────────────

  describe('GET /api/tasks?dueAfter=&dueBefore=', () => {
    it('filters tasks within a due-date range', async () => {
      await Task.create([
        { userId: userA._id, title: 'Past',   dueDate: new Date('2026-01-01') },
        { userId: userA._id, title: 'Soon',   dueDate: new Date('2026-06-15') },
        { userId: userA._id, title: 'Later',  dueDate: new Date('2026-12-31') },
        { userId: userA._id, title: 'No due', dueDate: null },
      ]);
      const res = await request(app)
        .get('/api/tasks?dueAfter=2026-05-01&dueBefore=2026-07-01')
        .set('Authorization', `Bearer ${tokenA}`);
      expect(res.body.total).toBe(1);
      expect(res.body.tasks[0].title).toBe('Soon');
    });
  });

  // ── Stats ─────────────────────────────────────────────────────────────────

  describe('GET /api/tasks/stats', () => {
    it('returns counts by status and overdue count', async () => {
      await Task.create([
        { userId: userA._id, title: 'T1', status: 'todo',        dueDate: new Date('2025-01-01') },
        { userId: userA._id, title: 'T2', status: 'todo' },
        { userId: userA._id, title: 'T3', status: 'in-progress', dueDate: new Date('2025-01-01') },
        { userId: userA._id, title: 'T4', status: 'done',        dueDate: new Date('2025-01-01') },
      ]);
      const res = await request(app).get('/api/tasks/stats').set('Authorization', `Bearer ${tokenA}`);
      expect(res.statusCode).toBe(200);
      expect(res.body.todo).toBe(2);
      expect(res.body['in-progress']).toBe(1);
      expect(res.body.done).toBe(1);
      expect(res.body.overdue).toBe(2);
    });
  });

  // ── Duplicate ─────────────────────────────────────────────────────────────

  describe('POST /api/tasks/:id/duplicate', () => {
    it('creates a copy with status reset to todo', async () => {
      const task = await Task.create({
        userId: userA._id,
        title: 'Original',
        status: 'done',
        priority: 'high',
        tags: ['work'],
        dueDate: new Date('2026-09-01'),
      });
      const res = await request(app)
        .post(`/api/tasks/${task._id}/duplicate`)
        .set('Authorization', `Bearer ${tokenA}`);
      expect(res.statusCode).toBe(201);
      expect(res.body.title).toBe('Original (copy)');
      expect(res.body.status).toBe('todo');
      expect(res.body.priority).toBe('high');
      expect(res.body.tags).toContain('work');
      expect(res.body._id).not.toBe(String(task._id));
    });

    it('returns 404 when duplicating another user\'s task', async () => {
      const task = await Task.create({ userId: userB._id, title: 'Not yours' });
      const res = await request(app)
        .post(`/api/tasks/${task._id}/duplicate`)
        .set('Authorization', `Bearer ${tokenA}`);
      expect(res.statusCode).toBe(404);
    });
  });

  describe('GET /api/tasks/export', () => {
    it('returns 401 without auth', async () => {
      const res = await request(app).get('/api/tasks/export');
      expect(res.statusCode).toBe(401);
    });

    it('returns CSV with header row', async () => {
      await Task.create({ userId: userA._id, title: 'Export me', priority: 'medium', status: 'todo' });
      const res = await request(app)
        .get('/api/tasks/export')
        .set('Authorization', `Bearer ${tokenA}`);
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/csv/);
      expect(res.text).toContain('title,status,priority');
      expect(res.text).toContain('Export me');
    });

    it('returns JSON when format=json', async () => {
      const res = await request(app)
        .get('/api/tasks/export?format=json')
        .set('Authorization', `Bearer ${tokenA}`);
      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('returns 400 for unsupported format', async () => {
      const res = await request(app)
        .get('/api/tasks/export?format=xml')
        .set('Authorization', `Bearer ${tokenA}`);
      expect(res.statusCode).toBe(400);
    });
  });
});
