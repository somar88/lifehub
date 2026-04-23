process.env.JWT_SECRET = 'test-secret';
process.env.ENCRYPTION_KEY = 'c'.repeat(64);

const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../../src/app');
const User = require('../../src/models/User');
const Category = require('../../src/models/Category');
const Transaction = require('../../src/models/Transaction');
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

describe('Budget API', () => {
  let tokenA, tokenB, userA, userB;

  beforeAll(() => dbHelper.connect());
  afterAll(() => dbHelper.disconnect());

  beforeEach(async () => {
    await User.deleteMany({});
    await Category.deleteMany({});
    await Transaction.deleteMany({});
    userA = await createUser({ email: 'a@example.com' });
    userB = await createUser({ email: 'b@example.com' });
    tokenA = await loginAs('a@example.com');
    tokenB = await loginAs('b@example.com');
  });

  // ── Auth guard ────────────────────────────────────────────────────────────

  it('returns 401 with no token', async () => {
    const res = await request(app).get('/api/budget/categories');
    expect(res.statusCode).toBe(401);
  });

  // ── Categories ────────────────────────────────────────────────────────────

  describe('POST /api/budget/categories', () => {
    it('creates an income category', async () => {
      const res = await request(app)
        .post('/api/budget/categories')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ name: 'Salary', type: 'income', color: 'green' });
      expect(res.statusCode).toBe(201);
      expect(res.body.name).toBe('Salary');
      expect(res.body.type).toBe('income');
    });

    it('creates an expense category', async () => {
      const res = await request(app)
        .post('/api/budget/categories')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ name: 'Groceries', type: 'expense' });
      expect(res.statusCode).toBe(201);
      expect(res.body.type).toBe('expense');
    });

    it('returns 400 for missing name', async () => {
      const res = await request(app)
        .post('/api/budget/categories')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ type: 'expense' });
      expect(res.statusCode).toBe(400);
    });

    it('returns 400 for invalid type', async () => {
      const res = await request(app)
        .post('/api/budget/categories')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ name: 'Bad', type: 'savings' });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('GET /api/budget/categories', () => {
    it('returns only the calling user\'s categories', async () => {
      await Category.create([
        { userId: userA._id, name: 'Salary', type: 'income' },
        { userId: userA._id, name: 'Groceries', type: 'expense' },
        { userId: userB._id, name: 'Other', type: 'expense' },
      ]);
      const res = await request(app).get('/api/budget/categories').set('Authorization', `Bearer ${tokenA}`);
      expect(res.statusCode).toBe(200);
      expect(res.body.length).toBe(2);
      res.body.forEach(c => expect(c.userId).toBe(String(userA._id)));
    });
  });

  describe('PATCH /api/budget/categories/:id', () => {
    it('updates a category', async () => {
      const cat = await Category.create({ userId: userA._id, name: 'Old', type: 'expense' });
      const res = await request(app)
        .patch(`/api/budget/categories/${cat._id}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ name: 'New', color: 'red' });
      expect(res.statusCode).toBe(200);
      expect(res.body.name).toBe('New');
      expect(res.body.color).toBe('red');
    });

    it('returns 404 for another user\'s category', async () => {
      const cat = await Category.create({ userId: userB._id, name: 'Other', type: 'expense' });
      const res = await request(app)
        .patch(`/api/budget/categories/${cat._id}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ name: 'Hacked' });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('DELETE /api/budget/categories/:id', () => {
    it('deletes a category and nullifies transactions referencing it', async () => {
      const cat = await Category.create({ userId: userA._id, name: 'ToDelete', type: 'expense' });
      const tx = await Transaction.create({ userId: userA._id, amount: 50, type: 'expense', categoryId: cat._id, date: new Date() });

      const res = await request(app).delete(`/api/budget/categories/${cat._id}`).set('Authorization', `Bearer ${tokenA}`);
      expect(res.statusCode).toBe(200);

      const updated = await Transaction.findById(tx._id);
      expect(updated.categoryId).toBeNull();
    });
  });

  // ── Transactions ──────────────────────────────────────────────────────────

  describe('POST /api/budget/transactions', () => {
    it('creates a transaction with category', async () => {
      const cat = await Category.create({ userId: userA._id, name: 'Food', type: 'expense' });
      const res = await request(app)
        .post('/api/budget/transactions')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ amount: 42.5, type: 'expense', categoryId: cat._id, description: 'Lunch', date: '2026-06-01' });
      expect(res.statusCode).toBe(201);
      expect(res.body.amount).toBe(42.5);
      expect(res.body.type).toBe('expense');
    });

    it('creates a transaction without category', async () => {
      const res = await request(app)
        .post('/api/budget/transactions')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ amount: 1000, type: 'income' });
      expect(res.statusCode).toBe(201);
      expect(res.body.categoryId).toBeNull();
    });

    it('returns 400 for missing amount', async () => {
      const res = await request(app)
        .post('/api/budget/transactions')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ type: 'expense' });
      expect(res.statusCode).toBe(400);
    });

    it('returns 400 for negative amount', async () => {
      const res = await request(app)
        .post('/api/budget/transactions')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ amount: -10, type: 'expense' });
      expect(res.statusCode).toBe(400);
    });

    it('returns 400 when categoryId belongs to another user', async () => {
      const cat = await Category.create({ userId: userB._id, name: 'Other', type: 'expense' });
      const res = await request(app)
        .post('/api/budget/transactions')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ amount: 10, type: 'expense', categoryId: cat._id });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('GET /api/budget/transactions', () => {
    beforeEach(async () => {
      const salarycat = await Category.create({ userId: userA._id, name: 'Salary', type: 'income' });
      const foodCat = await Category.create({ userId: userA._id, name: 'Food', type: 'expense' });
      await Transaction.create([
        { userId: userA._id, amount: 3000, type: 'income', categoryId: salarycat._id, date: new Date('2026-05-01') },
        { userId: userA._id, amount: 50, type: 'expense', categoryId: foodCat._id, date: new Date('2026-05-10') },
        { userId: userA._id, amount: 30, type: 'expense', categoryId: foodCat._id, date: new Date('2026-06-05') },
        { userId: userB._id, amount: 999, type: 'income', date: new Date('2026-05-01') },
      ]);
    });

    it('returns only the calling user\'s transactions', async () => {
      const res = await request(app).get('/api/budget/transactions').set('Authorization', `Bearer ${tokenA}`);
      expect(res.body.total).toBe(3);
    });

    it('filters by type', async () => {
      const res = await request(app).get('/api/budget/transactions?type=expense').set('Authorization', `Bearer ${tokenA}`);
      expect(res.body.total).toBe(2);
      res.body.transactions.forEach(t => expect(t.type).toBe('expense'));
    });

    it('filters by date range', async () => {
      const res = await request(app)
        .get('/api/budget/transactions?from=2026-05-01&to=2026-05-31')
        .set('Authorization', `Bearer ${tokenA}`);
      expect(res.body.total).toBe(2);
    });

    it('returns transactions sorted newest first', async () => {
      const res = await request(app).get('/api/budget/transactions').set('Authorization', `Bearer ${tokenA}`);
      const dates = res.body.transactions.map(t => new Date(t.date).getTime());
      for (let i = 1; i < dates.length; i++) expect(dates[i]).toBeLessThanOrEqual(dates[i - 1]);
    });

    it('populates category name on transactions', async () => {
      const res = await request(app).get('/api/budget/transactions').set('Authorization', `Bearer ${tokenA}`);
      const withCat = res.body.transactions.filter(t => t.categoryId);
      withCat.forEach(t => expect(t.categoryId.name).toBeDefined());
    });

    it('paginates results', async () => {
      const res = await request(app).get('/api/budget/transactions?page=1&limit=2').set('Authorization', `Bearer ${tokenA}`);
      expect(res.body.transactions.length).toBe(2);
      expect(res.body.total).toBe(3);
    });
  });

  describe('PATCH /api/budget/transactions/:id', () => {
    it('updates a transaction', async () => {
      const tx = await Transaction.create({ userId: userA._id, amount: 10, type: 'expense', date: new Date() });
      const res = await request(app)
        .patch(`/api/budget/transactions/${tx._id}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ amount: 25, description: 'Updated' });
      expect(res.statusCode).toBe(200);
      expect(res.body.amount).toBe(25);
      expect(res.body.description).toBe('Updated');
    });

    it('returns 404 for another user\'s transaction', async () => {
      const tx = await Transaction.create({ userId: userB._id, amount: 10, type: 'expense', date: new Date() });
      const res = await request(app)
        .patch(`/api/budget/transactions/${tx._id}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ amount: 999 });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('DELETE /api/budget/transactions/:id', () => {
    it('deletes own transaction', async () => {
      const tx = await Transaction.create({ userId: userA._id, amount: 10, type: 'expense', date: new Date() });
      const res = await request(app).delete(`/api/budget/transactions/${tx._id}`).set('Authorization', `Bearer ${tokenA}`);
      expect(res.statusCode).toBe(200);
      expect(await Transaction.findById(tx._id)).toBeNull();
    });

    it('returns 404 when deleting another user\'s transaction', async () => {
      const tx = await Transaction.create({ userId: userB._id, amount: 10, type: 'expense', date: new Date() });
      const res = await request(app).delete(`/api/budget/transactions/${tx._id}`).set('Authorization', `Bearer ${tokenA}`);
      expect(res.statusCode).toBe(404);
    });
  });

  // ── Summary ───────────────────────────────────────────────────────────────

  describe('GET /api/budget/summary', () => {
    beforeEach(async () => {
      const foodCat = await Category.create({ userId: userA._id, name: 'Food', type: 'expense' });
      await Transaction.create([
        { userId: userA._id, amount: 3000, type: 'income', date: new Date('2026-05-01') },
        { userId: userA._id, amount: 500, type: 'income', date: new Date('2026-05-15') },
        { userId: userA._id, amount: 200, type: 'expense', categoryId: foodCat._id, date: new Date('2026-05-10') },
        { userId: userA._id, amount: 50, type: 'expense', date: new Date('2026-05-20') },
      ]);
    });

    it('returns correct totals and balance', async () => {
      const res = await request(app).get('/api/budget/summary').set('Authorization', `Bearer ${tokenA}`);
      expect(res.statusCode).toBe(200);
      expect(res.body.income.total).toBe(3500);
      expect(res.body.expense.total).toBe(250);
      expect(res.body.balance).toBe(3250);
    });

    it('returns breakdown by category', async () => {
      const res = await request(app).get('/api/budget/summary').set('Authorization', `Bearer ${tokenA}`);
      expect(Array.isArray(res.body.byCategory)).toBe(true);
      const food = res.body.byCategory.find(c => c.categoryName === 'Food');
      expect(food).toBeDefined();
      expect(food.total).toBe(200);
    });

    it('filters summary by date range', async () => {
      const res = await request(app)
        .get('/api/budget/summary?from=2026-05-15&to=2026-05-31')
        .set('Authorization', `Bearer ${tokenA}`);
      expect(res.body.income.total).toBe(500);
      expect(res.body.expense.total).toBe(50);
      expect(res.body.balance).toBe(450);
    });

    it('returns zeros when no transactions exist', async () => {
      await Transaction.deleteMany({});
      const res = await request(app).get('/api/budget/summary').set('Authorization', `Bearer ${tokenA}`);
      expect(res.body.income.total).toBe(0);
      expect(res.body.expense.total).toBe(0);
      expect(res.body.balance).toBe(0);
    });
  });

  describe('GET /api/budget/transactions/export', () => {
    it('returns 401 without auth', async () => {
      const res = await request(app).get('/api/budget/transactions/export');
      expect(res.statusCode).toBe(401);
    });

    it('returns CSV with header row', async () => {
      await Transaction.create({ userId: userA._id, type: 'expense', amount: 50, description: 'Coffee', date: new Date() });
      const res = await request(app)
        .get('/api/budget/transactions/export')
        .set('Authorization', `Bearer ${tokenA}`);
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/csv/);
      expect(res.text).toContain('description,amount,type');
      expect(res.text).toContain('Coffee');
    });

    it('returns JSON when format=json', async () => {
      const res = await request(app)
        .get('/api/budget/transactions/export?format=json')
        .set('Authorization', `Bearer ${tokenA}`);
      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });
});
