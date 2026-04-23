process.env.JWT_SECRET = 'test-secret';
process.env.ENCRYPTION_KEY = 'c'.repeat(64);

const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../../src/app');
const User = require('../../src/models/User');
const Event = require('../../src/models/Event');
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

describe('Calendar API', () => {
  let tokenA, tokenB, userA, userB;

  beforeAll(() => dbHelper.connect());
  afterAll(() => dbHelper.disconnect());

  beforeEach(async () => {
    await User.deleteMany({});
    await Event.deleteMany({});
    userA = await createUser({ email: 'a@example.com' });
    userB = await createUser({ email: 'b@example.com' });
    tokenA = await loginAs('a@example.com');
    tokenB = await loginAs('b@example.com');
  });

  // ── Auth guard ────────────────────────────────────────────────────────────

  it('returns 401 with no token', async () => {
    const res = await request(app).get('/api/calendar');
    expect(res.statusCode).toBe(401);
  });

  // ── Create ────────────────────────────────────────────────────────────────

  describe('POST /api/calendar', () => {
    it('creates an event with all fields', async () => {
      const res = await request(app)
        .post('/api/calendar')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          title: 'Team meeting',
          description: 'Quarterly review',
          start: '2026-06-15T10:00:00.000Z',
          end: '2026-06-15T11:00:00.000Z',
          allDay: false,
          location: 'Conference Room A',
          color: 'blue',
        });
      expect(res.statusCode).toBe(201);
      expect(res.body.title).toBe('Team meeting');
      expect(res.body.location).toBe('Conference Room A');
      expect(res.body.color).toBe('blue');
    });

    it('creates an all-day event with only required fields', async () => {
      const res = await request(app)
        .post('/api/calendar')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ title: 'Holiday', start: '2026-12-25T00:00:00.000Z', allDay: true });
      expect(res.statusCode).toBe(201);
      expect(res.body.allDay).toBe(true);
      expect(res.body.end).toBeNull();
    });

    it('returns 400 when title is missing', async () => {
      const res = await request(app)
        .post('/api/calendar')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ start: '2026-06-15T10:00:00.000Z' });
      expect(res.statusCode).toBe(400);
    });

    it('returns 400 when start is missing', async () => {
      const res = await request(app)
        .post('/api/calendar')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ title: 'No start' });
      expect(res.statusCode).toBe(400);
    });

    it('returns 400 for an invalid date format', async () => {
      const res = await request(app)
        .post('/api/calendar')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ title: 'Bad date', start: 'not-a-date' });
      expect(res.statusCode).toBe(400);
    });
  });

  // ── List + Date range filter ──────────────────────────────────────────────

  describe('GET /api/calendar', () => {
    beforeEach(async () => {
      await Event.create([
        { userId: userA._id, title: 'Past event',   start: new Date('2026-01-10'), end: new Date('2026-01-10') },
        { userId: userA._id, title: 'June event',   start: new Date('2026-06-01'), end: new Date('2026-06-01') },
        { userId: userA._id, title: 'July event',   start: new Date('2026-07-15'), end: new Date('2026-07-15') },
        { userId: userA._id, title: 'August event', start: new Date('2026-08-20'), end: new Date('2026-08-20') },
        { userId: userB._id, title: 'Other user',   start: new Date('2026-06-01'), end: new Date('2026-06-01') },
      ]);
    });

    it('returns only the calling user\'s events', async () => {
      const res = await request(app).get('/api/calendar').set('Authorization', `Bearer ${tokenA}`);
      expect(res.statusCode).toBe(200);
      expect(res.body.total).toBe(4);
      res.body.events.forEach(e => expect(e.userId).toBe(String(userA._id)));
    });

    it('filters events within a date range', async () => {
      const res = await request(app)
        .get('/api/calendar?from=2026-05-01&to=2026-07-31')
        .set('Authorization', `Bearer ${tokenA}`);
      expect(res.body.total).toBe(2);
      const titles = res.body.events.map(e => e.title);
      expect(titles).toContain('June event');
      expect(titles).toContain('July event');
    });

    it('filters events from a date (no upper bound)', async () => {
      const res = await request(app)
        .get('/api/calendar?from=2026-07-01')
        .set('Authorization', `Bearer ${tokenA}`);
      expect(res.body.total).toBe(2);
    });

    it('filters events up to a date (no lower bound)', async () => {
      const res = await request(app)
        .get('/api/calendar?to=2026-02-01')
        .set('Authorization', `Bearer ${tokenA}`);
      expect(res.body.total).toBe(1);
      expect(res.body.events[0].title).toBe('Past event');
    });

    it('returns events sorted by start date ascending', async () => {
      const res = await request(app).get('/api/calendar').set('Authorization', `Bearer ${tokenA}`);
      const starts = res.body.events.map(e => new Date(e.start).getTime());
      for (let i = 1; i < starts.length; i++) {
        expect(starts[i]).toBeGreaterThanOrEqual(starts[i - 1]);
      }
    });

    it('paginates results', async () => {
      const res = await request(app).get('/api/calendar?page=1&limit=2').set('Authorization', `Bearer ${tokenA}`);
      expect(res.body.events.length).toBe(2);
      expect(res.body.total).toBe(4);
    });
  });

  // ── Read single ───────────────────────────────────────────────────────────

  describe('GET /api/calendar/:id', () => {
    it('returns an event by id', async () => {
      const event = await Event.create({ userId: userA._id, title: 'Standup', start: new Date() });
      const res = await request(app).get(`/api/calendar/${event._id}`).set('Authorization', `Bearer ${tokenA}`);
      expect(res.statusCode).toBe(200);
      expect(res.body.title).toBe('Standup');
    });

    it('returns 404 for another user\'s event', async () => {
      const event = await Event.create({ userId: userB._id, title: 'Private', start: new Date() });
      const res = await request(app).get(`/api/calendar/${event._id}`).set('Authorization', `Bearer ${tokenA}`);
      expect(res.statusCode).toBe(404);
    });

    it('returns 400 for an invalid mongo id', async () => {
      const res = await request(app).get('/api/calendar/not-an-id').set('Authorization', `Bearer ${tokenA}`);
      expect(res.statusCode).toBe(400);
    });
  });

  // ── Update ────────────────────────────────────────────────────────────────

  describe('PATCH /api/calendar/:id', () => {
    it('updates allowed fields', async () => {
      const event = await Event.create({ userId: userA._id, title: 'Old title', start: new Date('2026-06-01') });
      const res = await request(app)
        .patch(`/api/calendar/${event._id}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ title: 'New title', location: 'Room B' });
      expect(res.statusCode).toBe(200);
      expect(res.body.title).toBe('New title');
      expect(res.body.location).toBe('Room B');
    });

    it('returns 404 when trying to update another user\'s event', async () => {
      const event = await Event.create({ userId: userB._id, title: 'Not yours', start: new Date() });
      const res = await request(app)
        .patch(`/api/calendar/${event._id}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ title: 'Hacked' });
      expect(res.statusCode).toBe(404);
    });

    it('returns 400 for an invalid date on update', async () => {
      const event = await Event.create({ userId: userA._id, title: 'Event', start: new Date() });
      const res = await request(app)
        .patch(`/api/calendar/${event._id}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ start: 'not-a-date' });
      expect(res.statusCode).toBe(400);
    });
  });

  // ── Delete ────────────────────────────────────────────────────────────────

  describe('DELETE /api/calendar/:id', () => {
    it('deletes own event', async () => {
      const event = await Event.create({ userId: userA._id, title: 'Delete me', start: new Date() });
      const res = await request(app).delete(`/api/calendar/${event._id}`).set('Authorization', `Bearer ${tokenA}`);
      expect(res.statusCode).toBe(200);
      expect(await Event.findById(event._id)).toBeNull();
    });

    it('returns 404 when deleting another user\'s event', async () => {
      const event = await Event.create({ userId: userB._id, title: 'Not yours', start: new Date() });
      const res = await request(app).delete(`/api/calendar/${event._id}`).set('Authorization', `Bearer ${tokenA}`);
      expect(res.statusCode).toBe(404);
    });
  });

  // ── Search ────────────────────────────────────────────────────────────────

  describe('GET /api/calendar?search=', () => {
    it('finds events matching title', async () => {
      await Event.create([
        { userId: userA._id, title: 'Team standup', start: new Date('2026-06-01') },
        { userId: userA._id, title: 'Doctor appointment', start: new Date('2026-06-02') },
        { userId: userA._id, title: 'Standup retro', start: new Date('2026-06-03') },
      ]);
      const res = await request(app).get('/api/calendar?search=standup').set('Authorization', `Bearer ${tokenA}`);
      expect(res.body.total).toBe(2);
    });

    it('finds events matching description', async () => {
      await Event.create([
        { userId: userA._id, title: 'Meeting', description: 'Budget review session', start: new Date() },
        { userId: userA._id, title: 'Lunch', description: 'With the team', start: new Date() },
      ]);
      const res = await request(app).get('/api/calendar?search=budget').set('Authorization', `Bearer ${tokenA}`);
      expect(res.body.total).toBe(1);
      expect(res.body.events[0].title).toBe('Meeting');
    });
  });

  // ── allDay filter ─────────────────────────────────────────────────────────

  describe('GET /api/calendar?allDay=', () => {
    it('filters all-day events', async () => {
      await Event.create([
        { userId: userA._id, title: 'Holiday',   start: new Date('2026-12-25'), allDay: true },
        { userId: userA._id, title: 'Meeting',   start: new Date('2026-06-01'), allDay: false },
        { userId: userA._id, title: 'Birthday',  start: new Date('2026-07-04'), allDay: true },
      ]);
      const res = await request(app).get('/api/calendar?allDay=true').set('Authorization', `Bearer ${tokenA}`);
      expect(res.body.total).toBe(2);
      res.body.events.forEach(e => expect(e.allDay).toBe(true));
    });

    it('filters timed events', async () => {
      await Event.create([
        { userId: userA._id, title: 'Holiday', start: new Date('2026-12-25'), allDay: true },
        { userId: userA._id, title: 'Meeting', start: new Date('2026-06-01'), allDay: false },
      ]);
      const res = await request(app).get('/api/calendar?allDay=false').set('Authorization', `Bearer ${tokenA}`);
      expect(res.body.total).toBe(1);
      expect(res.body.events[0].allDay).toBe(false);
    });
  });

  // ── Upcoming ──────────────────────────────────────────────────────────────

  describe('GET /api/calendar/upcoming', () => {
    it('returns next events from now sorted by start', async () => {
      const future1 = new Date(Date.now() + 1 * 24 * 60 * 60 * 1000);
      const future2 = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
      const future3 = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const past    = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000);
      await Event.create([
        { userId: userA._id, title: 'Soon',  start: future1 },
        { userId: userA._id, title: 'Later', start: future2 },
        { userId: userA._id, title: 'Last',  start: future3 },
        { userId: userA._id, title: 'Past',  start: past },
      ]);
      const res = await request(app).get('/api/calendar/upcoming?limit=3').set('Authorization', `Bearer ${tokenA}`);
      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(3);
      expect(res.body.every(e => new Date(e.start) >= new Date())).toBe(true);
      expect(res.body[0].title).toBe('Soon');
    });

    it('defaults to 5 events', async () => {
      const events = Array.from({ length: 7 }, (_, i) => ({
        userId: userA._id,
        title: `Event ${i}`,
        start: new Date(Date.now() + (i + 1) * 86400000),
      }));
      await Event.create(events);
      const res = await request(app).get('/api/calendar/upcoming').set('Authorization', `Bearer ${tokenA}`);
      expect(res.body.length).toBe(5);
    });
  });

  describe('GET /api/calendar/export', () => {
    it('returns 401 without auth', async () => {
      const res = await request(app).get('/api/calendar/export');
      expect(res.statusCode).toBe(401);
    });

    it('returns CSV with header row', async () => {
      await Event.create({ userId: userA._id, title: 'Export event', start: new Date() });
      const res = await request(app)
        .get('/api/calendar/export')
        .set('Authorization', `Bearer ${tokenA}`);
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/csv/);
      expect(res.text).toContain('title,start,end');
      expect(res.text).toContain('Export event');
    });

    it('returns JSON when format=json', async () => {
      const res = await request(app)
        .get('/api/calendar/export?format=json')
        .set('Authorization', `Bearer ${tokenA}`);
      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  // ── Recurring events ──────────────────────────────────────────────────────

  describe('Recurring events', () => {
    it('creates 4 weekly instances for a 4-week range', async () => {
      const start = '2026-06-01T10:00:00.000Z';
      const recurrenceEnd = '2026-06-28T10:00:00.000Z';
      const res = await request(app)
        .post('/api/calendar')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ title: 'Weekly Meeting', start, end: '2026-06-01T11:00:00.000Z', recurrence: 'weekly', recurrenceEnd });
      expect(res.statusCode).toBe(201);
      const groupId = res.body.recurrenceGroupId;
      expect(groupId).toBeTruthy();
      const all = await Event.find({ recurrenceGroupId: groupId });
      expect(all.length).toBe(4);
    });

    it('deletes only one instance when all=false', async () => {
      const start = '2026-07-01T10:00:00.000Z';
      const recurrenceEnd = '2026-07-15T10:00:00.000Z';
      const createRes = await request(app)
        .post('/api/calendar')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ title: 'Daily Standup', start, end: '2026-07-01T10:15:00.000Z', recurrence: 'daily', recurrenceEnd });
      const groupId = createRes.body.recurrenceGroupId;
      const instances = await Event.find({ recurrenceGroupId: groupId });
      const deleteRes = await request(app)
        .delete(`/api/calendar/${instances[0]._id}`)
        .set('Authorization', `Bearer ${tokenA}`);
      expect(deleteRes.statusCode).toBe(200);
      const remaining = await Event.find({ recurrenceGroupId: groupId });
      expect(remaining.length).toBe(instances.length - 1);
    });

    it('deletes all instances when all=true', async () => {
      const start = '2026-08-01T10:00:00.000Z';
      const recurrenceEnd = '2026-08-15T10:00:00.000Z';
      const createRes = await request(app)
        .post('/api/calendar')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ title: 'Daily Standup', start, end: '2026-08-01T10:15:00.000Z', recurrence: 'daily', recurrenceEnd });
      const groupId = createRes.body.recurrenceGroupId;
      const instances = await Event.find({ recurrenceGroupId: groupId });
      const deleteRes = await request(app)
        .delete(`/api/calendar/${instances[0]._id}?all=true`)
        .set('Authorization', `Bearer ${tokenA}`);
      expect(deleteRes.statusCode).toBe(200);
      const remaining = await Event.find({ recurrenceGroupId: groupId });
      expect(remaining.length).toBe(0);
    });
  });
});
