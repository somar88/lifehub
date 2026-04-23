process.env.JWT_SECRET = 'test-secret';
process.env.ENCRYPTION_KEY = 'c'.repeat(64);

const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../../src/app');
const User = require('../../src/models/User');
const Contact = require('../../src/models/Contact');
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

describe('Contacts API', () => {
  let tokenA, tokenB, userA, userB;

  beforeAll(() => dbHelper.connect());
  afterAll(() => dbHelper.disconnect());

  beforeEach(async () => {
    await User.deleteMany({});
    await Contact.deleteMany({});
    userA = await createUser({ email: 'a@example.com' });
    userB = await createUser({ email: 'b@example.com' });
    tokenA = await loginAs('a@example.com');
    tokenB = await loginAs('b@example.com');
  });

  // ── Auth guard ────────────────────────────────────────────────────────────

  it('returns 401 with no token', async () => {
    const res = await request(app).get('/api/contacts');
    expect(res.statusCode).toBe(401);
  });

  // ── Create ────────────────────────────────────────────────────────────────

  describe('POST /api/contacts', () => {
    it('creates a contact with all fields', async () => {
      const res = await request(app)
        .post('/api/contacts')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          firstName: 'Alice',
          lastName: 'Smith',
          email: 'alice@example.com',
          phone: '+1-555-0100',
          company: 'Acme Corp',
          address: '123 Main St',
          notes: 'Met at conference',
          tags: ['vip', 'work'],
        });
      expect(res.statusCode).toBe(201);
      expect(res.body.firstName).toBe('Alice');
      expect(res.body.lastName).toBe('Smith');
      expect(res.body.email).toBe('alice@example.com');
      expect(res.body.tags).toContain('vip');
    });

    it('creates a contact with only required firstName', async () => {
      const res = await request(app)
        .post('/api/contacts')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ firstName: 'Bob' });
      expect(res.statusCode).toBe(201);
      expect(res.body.firstName).toBe('Bob');
      expect(res.body.lastName).toBe('');
      expect(res.body.email).toBe('');
    });

    it('returns 400 when firstName is missing', async () => {
      const res = await request(app)
        .post('/api/contacts')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ lastName: 'Smith' });
      expect(res.statusCode).toBe(400);
    });

    it('returns 400 for an invalid email', async () => {
      const res = await request(app)
        .post('/api/contacts')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ firstName: 'Bad', email: 'not-an-email' });
      expect(res.statusCode).toBe(400);
    });
  });

  // ── List + Search ─────────────────────────────────────────────────────────

  describe('GET /api/contacts', () => {
    beforeEach(async () => {
      await Contact.create([
        { userId: userA._id, firstName: 'Alice', lastName: 'Smith', email: 'alice@example.com', company: 'Acme' },
        { userId: userA._id, firstName: 'Bob', lastName: 'Jones', email: 'bob@example.com', company: 'Beta' },
        { userId: userA._id, firstName: 'Carol', lastName: 'White', email: 'carol@acme.com', company: 'Acme' },
        { userId: userB._id, firstName: 'Dave', lastName: 'Black', email: 'dave@example.com' },
      ]);
    });

    it('returns only the calling user\'s contacts', async () => {
      const res = await request(app).get('/api/contacts').set('Authorization', `Bearer ${tokenA}`);
      expect(res.statusCode).toBe(200);
      expect(res.body.total).toBe(3);
      res.body.contacts.forEach(c => expect(c.userId).toBe(String(userA._id)));
    });

    it('searches by first name', async () => {
      const res = await request(app).get('/api/contacts?search=alice').set('Authorization', `Bearer ${tokenA}`);
      expect(res.body.total).toBe(1);
      expect(res.body.contacts[0].firstName).toBe('Alice');
    });

    it('searches by last name', async () => {
      const res = await request(app).get('/api/contacts?search=Jones').set('Authorization', `Bearer ${tokenA}`);
      expect(res.body.total).toBe(1);
      expect(res.body.contacts[0].lastName).toBe('Jones');
    });

    it('searches by email', async () => {
      const res = await request(app).get('/api/contacts?search=bob@example').set('Authorization', `Bearer ${tokenA}`);
      expect(res.body.total).toBe(1);
      expect(res.body.contacts[0].firstName).toBe('Bob');
    });

    it('searches by company', async () => {
      const res = await request(app).get('/api/contacts?search=Acme').set('Authorization', `Bearer ${tokenA}`);
      expect(res.body.total).toBe(2);
    });

    it('searches by address', async () => {
      await Contact.create({ userId: userA._id, firstName: 'Eve', address: '42 Eugen Street' });
      const res = await request(app).get('/api/contacts?search=Eugen').set('Authorization', `Bearer ${tokenA}`);
      expect(res.body.total).toBe(1);
      expect(res.body.contacts[0].firstName).toBe('Eve');
    });

    it('searches by phone', async () => {
      await Contact.create({ userId: userA._id, firstName: 'Frank', phone: '+49-555-1234' });
      const res = await request(app).get('/api/contacts?search=555-1234').set('Authorization', `Bearer ${tokenA}`);
      expect(res.body.total).toBe(1);
      expect(res.body.contacts[0].firstName).toBe('Frank');
    });

    it('search is case-insensitive', async () => {
      const res = await request(app).get('/api/contacts?search=ALICE').set('Authorization', `Bearer ${tokenA}`);
      expect(res.body.total).toBe(1);
    });

    it('returns contacts sorted by firstName then lastName', async () => {
      const res = await request(app).get('/api/contacts').set('Authorization', `Bearer ${tokenA}`);
      const names = res.body.contacts.map(c => c.firstName);
      expect(names).toEqual([...names].sort());
    });

    it('paginates results', async () => {
      const res = await request(app).get('/api/contacts?page=1&limit=2').set('Authorization', `Bearer ${tokenA}`);
      expect(res.body.contacts.length).toBe(2);
      expect(res.body.total).toBe(3);
    });
  });

  // ── Read single ───────────────────────────────────────────────────────────

  describe('GET /api/contacts/:id', () => {
    it('returns a contact by id', async () => {
      const contact = await Contact.create({ userId: userA._id, firstName: 'Test' });
      const res = await request(app).get(`/api/contacts/${contact._id}`).set('Authorization', `Bearer ${tokenA}`);
      expect(res.statusCode).toBe(200);
      expect(res.body.firstName).toBe('Test');
    });

    it('returns 404 for another user\'s contact', async () => {
      const contact = await Contact.create({ userId: userB._id, firstName: 'Private' });
      const res = await request(app).get(`/api/contacts/${contact._id}`).set('Authorization', `Bearer ${tokenA}`);
      expect(res.statusCode).toBe(404);
    });

    it('returns 400 for an invalid mongo id', async () => {
      const res = await request(app).get('/api/contacts/not-an-id').set('Authorization', `Bearer ${tokenA}`);
      expect(res.statusCode).toBe(400);
    });
  });

  // ── Update ────────────────────────────────────────────────────────────────

  describe('PATCH /api/contacts/:id', () => {
    it('updates allowed fields', async () => {
      const contact = await Contact.create({ userId: userA._id, firstName: 'Old', phone: '111' });
      const res = await request(app)
        .patch(`/api/contacts/${contact._id}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ firstName: 'New', phone: '999' });
      expect(res.statusCode).toBe(200);
      expect(res.body.firstName).toBe('New');
      expect(res.body.phone).toBe('999');
    });

    it('returns 404 when updating another user\'s contact', async () => {
      const contact = await Contact.create({ userId: userB._id, firstName: 'Not yours' });
      const res = await request(app)
        .patch(`/api/contacts/${contact._id}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ firstName: 'Hacked' });
      expect(res.statusCode).toBe(404);
    });

    it('returns 400 for an invalid email on update', async () => {
      const contact = await Contact.create({ userId: userA._id, firstName: 'Test' });
      const res = await request(app)
        .patch(`/api/contacts/${contact._id}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ email: 'bad-email' });
      expect(res.statusCode).toBe(400);
    });
  });

  // ── Delete ────────────────────────────────────────────────────────────────

  describe('DELETE /api/contacts/:id', () => {
    it('deletes own contact', async () => {
      const contact = await Contact.create({ userId: userA._id, firstName: 'Delete me' });
      const res = await request(app).delete(`/api/contacts/${contact._id}`).set('Authorization', `Bearer ${tokenA}`);
      expect(res.statusCode).toBe(200);
      expect(await Contact.findById(contact._id)).toBeNull();
    });

    it('returns 404 when deleting another user\'s contact', async () => {
      const contact = await Contact.create({ userId: userB._id, firstName: 'Not yours' });
      const res = await request(app).delete(`/api/contacts/${contact._id}`).set('Authorization', `Bearer ${tokenA}`);
      expect(res.statusCode).toBe(404);
    });
  });

  // ── Tag filter ────────────────────────────────────────────────────────────

  describe('GET /api/contacts?tag=', () => {
    it('filters contacts by tag', async () => {
      await Contact.create([
        { userId: userA._id, firstName: 'VIP1', tags: ['vip', 'client'] },
        { userId: userA._id, firstName: 'VIP2', tags: ['vip'] },
        { userId: userA._id, firstName: 'Regular', tags: ['client'] },
      ]);
      const res = await request(app).get('/api/contacts?tag=vip').set('Authorization', `Bearer ${tokenA}`);
      expect(res.body.total).toBe(2);
      res.body.contacts.forEach(c => expect(c.tags).toContain('vip'));
    });
  });

  // ── Sort options ──────────────────────────────────────────────────────────

  describe('GET /api/contacts?sortBy=&order=', () => {
    beforeEach(async () => {
      await Contact.create([
        { userId: userA._id, firstName: 'Charlie', lastName: 'Brown',  company: 'Zeta' },
        { userId: userA._id, firstName: 'Alice',   lastName: 'Zebra',  company: 'Alpha' },
        { userId: userA._id, firstName: 'Bob',     lastName: 'Adams',  company: 'Mango' },
      ]);
    });

    it('sorts by lastName ascending', async () => {
      const res = await request(app).get('/api/contacts?sortBy=lastName&order=asc').set('Authorization', `Bearer ${tokenA}`);
      const lastNames = res.body.contacts.map(c => c.lastName);
      expect(lastNames).toEqual([...lastNames].sort());
    });

    it('sorts by company ascending', async () => {
      const res = await request(app).get('/api/contacts?sortBy=company&order=asc').set('Authorization', `Bearer ${tokenA}`);
      const companies = res.body.contacts.map(c => c.company);
      expect(companies).toEqual([...companies].sort());
    });

    it('sorts by firstName descending', async () => {
      const res = await request(app).get('/api/contacts?sortBy=firstName&order=desc').set('Authorization', `Bearer ${tokenA}`);
      const names = res.body.contacts.map(c => c.firstName);
      expect(names).toEqual([...names].sort().reverse());
    });
  });

  // ── Favorite toggle ───────────────────────────────────────────────────────

  describe('PATCH /api/contacts/:id/favorite', () => {
    it('toggles favorite on', async () => {
      const contact = await Contact.create({ userId: userA._id, firstName: 'Star', favorite: false });
      const res = await request(app)
        .patch(`/api/contacts/${contact._id}/favorite`)
        .set('Authorization', `Bearer ${tokenA}`);
      expect(res.statusCode).toBe(200);
      expect(res.body.favorite).toBe(true);
    });

    it('toggles favorite off', async () => {
      const contact = await Contact.create({ userId: userA._id, firstName: 'Star', favorite: true });
      const res = await request(app)
        .patch(`/api/contacts/${contact._id}/favorite`)
        .set('Authorization', `Bearer ${tokenA}`);
      expect(res.statusCode).toBe(200);
      expect(res.body.favorite).toBe(false);
    });

    it('returns 404 for another user\'s contact', async () => {
      const contact = await Contact.create({ userId: userB._id, firstName: 'Other' });
      const res = await request(app)
        .patch(`/api/contacts/${contact._id}/favorite`)
        .set('Authorization', `Bearer ${tokenA}`);
      expect(res.statusCode).toBe(404);
    });
  });

  describe('GET /api/contacts/export', () => {
    it('returns 401 without auth', async () => {
      const res = await request(app).get('/api/contacts/export');
      expect(res.statusCode).toBe(401);
    });

    it('returns CSV with header row', async () => {
      await Contact.create({ userId: userA._id, firstName: 'Alice', lastName: 'Export' });
      const res = await request(app)
        .get('/api/contacts/export')
        .set('Authorization', `Bearer ${tokenA}`);
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/csv/);
      expect(res.text).toContain('firstName,lastName');
      expect(res.text).toContain('Alice');
    });

    it('returns JSON when format=json', async () => {
      const res = await request(app)
        .get('/api/contacts/export?format=json')
        .set('Authorization', `Bearer ${tokenA}`);
      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });
});
