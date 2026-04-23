// Rate limiting tests must run with NODE_ENV !== 'test' so the
// rate-limiter skip function (skipInTest) does not suppress limiting.
// We toggle NODE_ENV around each test and restore it in afterEach.

process.env.JWT_SECRET = 'test-secret';

const request = require('supertest');
const app = require('../../src/app');
const User = require('../../src/models/User');
const dbHelper = require('../helpers/dbHelper');

describe('Rate limiting', () => {
  beforeAll(() => dbHelper.connect());

  afterAll(async () => {
    process.env.NODE_ENV = 'test';
    await dbHelper.disconnect();
  });

  beforeEach(async () => {
    await User.deleteMany({});
    process.env.NODE_ENV = 'production';
  });

  afterEach(() => {
    process.env.NODE_ENV = 'test';
  });

  it('allows up to 10 login attempts and blocks the 11th (loginLimiter)', async () => {
    for (let i = 0; i < 10; i++) {
      const r = await request(app)
        .post('/api/auth/login')
        .send({ email: 'nobody@example.com', password: 'wrong' });
      expect(r.statusCode).not.toBe(429);
    }
    const blocked = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: 'wrong' });
    expect(blocked.statusCode).toBe(429);
  });

  it('allows up to 5 apply attempts and blocks the 6th (applyLimiter)', async () => {
    for (let i = 0; i < 5; i++) {
      const r = await request(app)
        .post('/api/auth/apply')
        .send({ firstName: `User${i}`, email: `apply${i}@example.com` });
      expect(r.statusCode).not.toBe(429);
    }
    const blocked = await request(app)
      .post('/api/auth/apply')
      .send({ firstName: 'Blocked', email: 'blocked@example.com' });
    expect(blocked.statusCode).toBe(429);
  });
});
