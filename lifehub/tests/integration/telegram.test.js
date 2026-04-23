process.env.JWT_SECRET = 'test-secret';

const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../../src/app');
const User = require('../../src/models/User');
const dbHelper = require('../helpers/dbHelper');

async function createUser(overrides = {}) {
  const passwordHash = await bcrypt.hash('password123', 4);
  return User.create({
    name: 'Test User',
    email: 'test@example.com',
    passwordHash,
    role: 'user',
    isActive: true,
    status: 'active',
    ...overrides,
  });
}

async function loginAs(email, password = 'password123') {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  return res.body.token;
}

describe('Telegram Routes', () => {
  beforeAll(() => dbHelper.connect());
  afterAll(() => dbHelper.disconnect());

  afterEach(async () => {
    await User.deleteMany({});
  });

  // ── POST /api/telegram/link-code ──────────────────────────────────────────

  describe('POST /api/telegram/link-code', () => {
    it('returns 401 without auth', async () => {
      const res = await request(app).post('/api/telegram/link-code');
      expect(res.statusCode).toBe(401);
    });

    it('generates a 6-char uppercase code and saves it', async () => {
      await createUser({ email: 'alice@example.com' });
      const token = await loginAs('alice@example.com');

      const res = await request(app)
        .post('/api/telegram/link-code')
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.code).toMatch(/^[A-F0-9]{6}$/);
      expect(res.body.expiresIn).toBe(900);

      const user = await User.findOne({ email: 'alice@example.com' }).select('+telegramLinkToken');
      expect(user.telegramLinkToken).toBe(res.body.code);
      expect(user.telegramLinkTokenExpiry).toBeDefined();
    });

    it('overwrites the previous code on repeat calls', async () => {
      await createUser({ email: 'alice@example.com' });
      const token = await loginAs('alice@example.com');

      const first  = await request(app).post('/api/telegram/link-code').set('Authorization', `Bearer ${token}`);
      const second = await request(app).post('/api/telegram/link-code').set('Authorization', `Bearer ${token}`);

      expect(second.statusCode).toBe(200);
      const user = await User.findOne({ email: 'alice@example.com' }).select('+telegramLinkToken');
      expect(user.telegramLinkToken).toBe(second.body.code);
    });
  });

  // ── DELETE /api/telegram/link ─────────────────────────────────────────────

  describe('DELETE /api/telegram/link', () => {
    it('returns 401 without auth', async () => {
      const res = await request(app).delete('/api/telegram/link');
      expect(res.statusCode).toBe(401);
    });

    it('clears telegramChatId', async () => {
      await createUser({ email: 'bob@example.com', telegramChatId: '12345678' });
      const token = await loginAs('bob@example.com');

      const res = await request(app)
        .delete('/api/telegram/link')
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.message).toContain('unlinked');

      const user = await User.findOne({ email: 'bob@example.com' });
      expect(user.telegramChatId).toBeNull();
    });

    it('succeeds even if no Telegram was linked', async () => {
      await createUser({ email: 'carol@example.com' });
      const token = await loginAs('carol@example.com');

      const res = await request(app)
        .delete('/api/telegram/link')
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toBe(200);
    });
  });

  // ── GET /api/users/me — telegramChatId in response ───────────────────────

  describe('GET /api/users/me — telegram fields', () => {
    it('exposes telegramChatId when linked', async () => {
      await createUser({ email: 'dave@example.com', telegramChatId: '99887766' });
      const token = await loginAs('dave@example.com');

      const res = await request(app)
        .get('/api/users/me')
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.telegramChatId).toBe('99887766');
    });

    it('does not expose telegramLinkToken', async () => {
      await createUser({ email: 'eve@example.com' });
      const token = await loginAs('eve@example.com');

      await request(app).post('/api/telegram/link-code').set('Authorization', `Bearer ${token}`);

      const res = await request(app)
        .get('/api/users/me')
        .set('Authorization', `Bearer ${token}`);

      expect(res.body.telegramLinkToken).toBeUndefined();
      expect(res.body.telegramLinkTokenExpiry).toBeUndefined();
    });
  });
});
