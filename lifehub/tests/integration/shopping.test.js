process.env.JWT_SECRET = 'test-secret';
process.env.ENCRYPTION_KEY = 'c'.repeat(64);

const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../../src/app');
const User = require('../../src/models/User');
const ShoppingList = require('../../src/models/ShoppingList');
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

describe('Shopping Lists API', () => {
  let tokenA, tokenB, userA, userB;

  beforeAll(() => dbHelper.connect());
  afterAll(() => dbHelper.disconnect());

  beforeEach(async () => {
    await User.deleteMany({});
    await ShoppingList.deleteMany({});
    userA = await createUser({ email: 'a@example.com' });
    userB = await createUser({ email: 'b@example.com' });
    tokenA = await loginAs('a@example.com');
    tokenB = await loginAs('b@example.com');
  });

  // ── Auth guard ────────────────────────────────────────────────────────────

  it('returns 401 with no token', async () => {
    const res = await request(app).get('/api/shopping');
    expect(res.statusCode).toBe(401);
  });

  // ── Create list ───────────────────────────────────────────────────────────

  describe('POST /api/shopping', () => {
    it('creates a shopping list', async () => {
      const res = await request(app)
        .post('/api/shopping')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ name: 'Weekly Groceries' });
      expect(res.statusCode).toBe(201);
      expect(res.body.name).toBe('Weekly Groceries');
      expect(res.body.items).toEqual([]);
    });

    it('returns 400 when name is missing', async () => {
      const res = await request(app)
        .post('/api/shopping')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({});
      expect(res.statusCode).toBe(400);
    });
  });

  // ── List ──────────────────────────────────────────────────────────────────

  describe('GET /api/shopping', () => {
    beforeEach(async () => {
      await ShoppingList.create([
        { userId: userA._id, name: 'Groceries' },
        { userId: userA._id, name: 'Hardware' },
        { userId: userB._id, name: 'Other user list' },
      ]);
    });

    it('returns only the calling user\'s lists', async () => {
      const res = await request(app).get('/api/shopping').set('Authorization', `Bearer ${tokenA}`);
      expect(res.statusCode).toBe(200);
      expect(res.body.total).toBe(2);
      res.body.lists.forEach(l => expect(l.userId).toBe(String(userA._id)));
    });

    it('paginates results', async () => {
      const res = await request(app).get('/api/shopping?page=1&limit=1').set('Authorization', `Bearer ${tokenA}`);
      expect(res.body.lists.length).toBe(1);
      expect(res.body.total).toBe(2);
    });
  });

  // ── Read single ───────────────────────────────────────────────────────────

  describe('GET /api/shopping/:id', () => {
    it('returns a list by id', async () => {
      const list = await ShoppingList.create({ userId: userA._id, name: 'Test List' });
      const res = await request(app).get(`/api/shopping/${list._id}`).set('Authorization', `Bearer ${tokenA}`);
      expect(res.statusCode).toBe(200);
      expect(res.body.name).toBe('Test List');
    });

    it('returns 404 for another user\'s list', async () => {
      const list = await ShoppingList.create({ userId: userB._id, name: 'Private' });
      const res = await request(app).get(`/api/shopping/${list._id}`).set('Authorization', `Bearer ${tokenA}`);
      expect(res.statusCode).toBe(404);
    });

    it('returns 400 for an invalid mongo id', async () => {
      const res = await request(app).get('/api/shopping/not-an-id').set('Authorization', `Bearer ${tokenA}`);
      expect(res.statusCode).toBe(400);
    });
  });

  // ── Update list ───────────────────────────────────────────────────────────

  describe('PATCH /api/shopping/:id', () => {
    it('updates the list name', async () => {
      const list = await ShoppingList.create({ userId: userA._id, name: 'Old Name' });
      const res = await request(app)
        .patch(`/api/shopping/${list._id}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ name: 'New Name' });
      expect(res.statusCode).toBe(200);
      expect(res.body.name).toBe('New Name');
    });

    it('returns 404 when updating another user\'s list', async () => {
      const list = await ShoppingList.create({ userId: userB._id, name: 'Not yours' });
      const res = await request(app)
        .patch(`/api/shopping/${list._id}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ name: 'Hacked' });
      expect(res.statusCode).toBe(404);
    });
  });

  // ── Delete list ───────────────────────────────────────────────────────────

  describe('DELETE /api/shopping/:id', () => {
    it('deletes own list', async () => {
      const list = await ShoppingList.create({ userId: userA._id, name: 'Delete me' });
      const res = await request(app).delete(`/api/shopping/${list._id}`).set('Authorization', `Bearer ${tokenA}`);
      expect(res.statusCode).toBe(200);
      expect(await ShoppingList.findById(list._id)).toBeNull();
    });

    it('returns 404 when deleting another user\'s list', async () => {
      const list = await ShoppingList.create({ userId: userB._id, name: 'Not yours' });
      const res = await request(app).delete(`/api/shopping/${list._id}`).set('Authorization', `Bearer ${tokenA}`);
      expect(res.statusCode).toBe(404);
    });
  });

  // ── Add item ──────────────────────────────────────────────────────────────

  describe('POST /api/shopping/:id/items', () => {
    it('adds an item with all fields', async () => {
      const list = await ShoppingList.create({ userId: userA._id, name: 'Groceries' });
      const res = await request(app)
        .post(`/api/shopping/${list._id}/items`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ name: 'Milk', quantity: 2, unit: 'L' });
      expect(res.statusCode).toBe(201);
      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].name).toBe('Milk');
      expect(res.body.items[0].quantity).toBe(2);
      expect(res.body.items[0].unit).toBe('L');
      expect(res.body.items[0].checked).toBe(false);
    });

    it('adds an item with only required name', async () => {
      const list = await ShoppingList.create({ userId: userA._id, name: 'Groceries' });
      const res = await request(app)
        .post(`/api/shopping/${list._id}/items`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ name: 'Bread' });
      expect(res.statusCode).toBe(201);
      expect(res.body.items[0].quantity).toBe(1);
      expect(res.body.items[0].unit).toBe('');
    });

    it('returns 400 when item name is missing', async () => {
      const list = await ShoppingList.create({ userId: userA._id, name: 'Groceries' });
      const res = await request(app)
        .post(`/api/shopping/${list._id}/items`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ quantity: 3 });
      expect(res.statusCode).toBe(400);
    });

    it('returns 404 when adding to another user\'s list', async () => {
      const list = await ShoppingList.create({ userId: userB._id, name: 'Not yours' });
      const res = await request(app)
        .post(`/api/shopping/${list._id}/items`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ name: 'Egg' });
      expect(res.statusCode).toBe(404);
    });
  });

  // ── Update item ───────────────────────────────────────────────────────────

  describe('PATCH /api/shopping/:id/items/:itemId', () => {
    it('updates item fields', async () => {
      const list = await ShoppingList.create({
        userId: userA._id,
        name: 'Groceries',
        items: [{ name: 'Milk', quantity: 1, unit: '' }],
      });
      const itemId = list.items[0]._id;

      const res = await request(app)
        .patch(`/api/shopping/${list._id}/items/${itemId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ name: 'Almond Milk', quantity: 3, unit: 'L' });
      expect(res.statusCode).toBe(200);
      const updated = res.body.items.find(i => String(i._id) === String(itemId));
      expect(updated.name).toBe('Almond Milk');
      expect(updated.quantity).toBe(3);
      expect(updated.unit).toBe('L');
    });

    it('returns 404 for a non-existent item', async () => {
      const list = await ShoppingList.create({ userId: userA._id, name: 'Groceries' });
      const fakeItemId = new (require('mongoose').Types.ObjectId)();
      const res = await request(app)
        .patch(`/api/shopping/${list._id}/items/${fakeItemId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ name: 'Ghost' });
      expect(res.statusCode).toBe(404);
    });
  });

  // ── Toggle item ───────────────────────────────────────────────────────────

  describe('PATCH /api/shopping/:id/items/:itemId/toggle', () => {
    it('toggles checked on', async () => {
      const list = await ShoppingList.create({
        userId: userA._id,
        name: 'Groceries',
        items: [{ name: 'Eggs', checked: false }],
      });
      const itemId = list.items[0]._id;

      const res = await request(app)
        .patch(`/api/shopping/${list._id}/items/${itemId}/toggle`)
        .set('Authorization', `Bearer ${tokenA}`);
      expect(res.statusCode).toBe(200);
      const item = res.body.items.find(i => String(i._id) === String(itemId));
      expect(item.checked).toBe(true);
    });

    it('toggles checked off', async () => {
      const list = await ShoppingList.create({
        userId: userA._id,
        name: 'Groceries',
        items: [{ name: 'Eggs', checked: true }],
      });
      const itemId = list.items[0]._id;

      const res = await request(app)
        .patch(`/api/shopping/${list._id}/items/${itemId}/toggle`)
        .set('Authorization', `Bearer ${tokenA}`);
      expect(res.statusCode).toBe(200);
      const item = res.body.items.find(i => String(i._id) === String(itemId));
      expect(item.checked).toBe(false);
    });

    it('returns 404 for a non-existent item', async () => {
      const list = await ShoppingList.create({ userId: userA._id, name: 'Groceries' });
      const fakeItemId = new (require('mongoose').Types.ObjectId)();
      const res = await request(app)
        .patch(`/api/shopping/${list._id}/items/${fakeItemId}/toggle`)
        .set('Authorization', `Bearer ${tokenA}`);
      expect(res.statusCode).toBe(404);
    });
  });

  // ── Remove item ───────────────────────────────────────────────────────────

  describe('DELETE /api/shopping/:id/items/:itemId', () => {
    it('removes an item from the list', async () => {
      const list = await ShoppingList.create({
        userId: userA._id,
        name: 'Groceries',
        items: [{ name: 'Butter' }, { name: 'Cheese' }],
      });
      const itemId = list.items[0]._id;

      const res = await request(app)
        .delete(`/api/shopping/${list._id}/items/${itemId}`)
        .set('Authorization', `Bearer ${tokenA}`);
      expect(res.statusCode).toBe(200);
      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].name).toBe('Cheese');
    });

    it('returns 404 for a non-existent item', async () => {
      const list = await ShoppingList.create({ userId: userA._id, name: 'Groceries' });
      const fakeItemId = new (require('mongoose').Types.ObjectId)();
      const res = await request(app)
        .delete(`/api/shopping/${list._id}/items/${fakeItemId}`)
        .set('Authorization', `Bearer ${tokenA}`);
      expect(res.statusCode).toBe(404);
    });
  });

  describe('GET /api/shopping/export', () => {
    it('returns 401 without auth', async () => {
      const res = await request(app).get('/api/shopping/export');
      expect(res.statusCode).toBe(401);
    });

    it('returns CSV with header row', async () => {
      await ShoppingList.create({
        userId: userA._id, name: 'Groceries',
        items: [{ name: 'Milk', checked: false, quantity: 1 }],
      });
      const res = await request(app)
        .get('/api/shopping/export')
        .set('Authorization', `Bearer ${tokenA}`);
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/csv/);
      expect(res.text).toContain('listName,itemName,checked');
      expect(res.text).toContain('Groceries');
    });

    it('returns JSON when format=json', async () => {
      const res = await request(app)
        .get('/api/shopping/export?format=json')
        .set('Authorization', `Bearer ${tokenA}`);
      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });
});
