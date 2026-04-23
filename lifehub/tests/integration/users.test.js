process.env.JWT_SECRET = 'test-secret-key';

const request = require('supertest');
const app = require('../../src/app');
const User = require('../../src/models/User');
const Task = require('../../src/models/Task');
const Contact = require('../../src/models/Contact');
const ShoppingList = require('../../src/models/ShoppingList');
const dbHelper = require('../helpers/dbHelper');
const emailService = require('../../src/services/emailService');

jest.mock('../../src/services/emailService');

async function registerAndLogin(overrides = {}) {
  const data = { name: 'Test User', email: 'test@example.com', password: 'password123', ...overrides };
  emailService.sendWelcomeEmail.mockResolvedValue();
  const res = await request(app).post('/api/auth/register').send(data);
  return res.body.token;
}

describe('User Routes', () => {
  beforeAll(() => dbHelper.connect());
  afterAll(() => dbHelper.disconnect());
  afterEach(async () => {
    await User.deleteMany({});
    jest.clearAllMocks();
  });

  describe('GET /api/users/me', () => {
    it('returns the authenticated user profile', async () => {
      const token = await registerAndLogin();
      const res = await request(app).get('/api/users/me').set('Authorization', `Bearer ${token}`);
      expect(res.statusCode).toBe(200);
      expect(res.body.email).toBe('test@example.com');
      expect(res.body.passwordHash).toBeUndefined();
    });

    it('returns 401 without a token', async () => {
      const res = await request(app).get('/api/users/me');
      expect(res.statusCode).toBe(401);
    });

    it('returns 401 with an invalid token', async () => {
      const res = await request(app).get('/api/users/me').set('Authorization', 'Bearer not.a.valid.token');
      expect(res.statusCode).toBe(401);
    });
  });

  describe('PATCH /api/users/me', () => {
    it('updates the user name', async () => {
      const token = await registerAndLogin();
      const res = await request(app).patch('/api/users/me').set('Authorization', `Bearer ${token}`).send({ name: 'Updated Name' });
      expect(res.statusCode).toBe(200);
      expect(res.body.name).toBe('Updated Name');
    });

    it('returns 400 when name is empty string', async () => {
      const token = await registerAndLogin();
      const res = await request(app).patch('/api/users/me').set('Authorization', `Bearer ${token}`).send({ name: '' });
      expect(res.statusCode).toBe(400);
    });

    it('returns 401 without a token', async () => {
      const res = await request(app).patch('/api/users/me').send({ name: 'X' });
      expect(res.statusCode).toBe(401);
    });
  });

  describe('POST /api/users/me/password', () => {
    it('changes password with correct current password', async () => {
      const token = await registerAndLogin();
      const res = await request(app)
        .post('/api/users/me/password')
        .set('Authorization', `Bearer ${token}`)
        .send({ currentPassword: 'password123', newPassword: 'newpassword456' });
      expect(res.statusCode).toBe(200);
      expect(res.body.message).toMatch(/changed/i);
    });

    it('returns 401 when current password is wrong', async () => {
      const token = await registerAndLogin();
      const res = await request(app)
        .post('/api/users/me/password')
        .set('Authorization', `Bearer ${token}`)
        .send({ currentPassword: 'wrongpassword', newPassword: 'newpassword456' });
      expect(res.statusCode).toBe(401);
    });

    it('returns 400 when new password is too short', async () => {
      const token = await registerAndLogin();
      const res = await request(app)
        .post('/api/users/me/password')
        .set('Authorization', `Bearer ${token}`)
        .send({ currentPassword: 'password123', newPassword: 'short' });
      expect(res.statusCode).toBe(400);
    });

    it('returns 400 when currentPassword is missing', async () => {
      const token = await registerAndLogin();
      const res = await request(app)
        .post('/api/users/me/password')
        .set('Authorization', `Bearer ${token}`)
        .send({ newPassword: 'newpassword456' });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('PATCH /api/users/me/email', () => {
    it('changes email with correct password', async () => {
      const token = await registerAndLogin();
      const res = await request(app)
        .patch('/api/users/me/email')
        .set('Authorization', `Bearer ${token}`)
        .send({ email: 'newemail@example.com', currentPassword: 'password123' });
      expect(res.statusCode).toBe(200);
      expect(res.body.email).toBe('newemail@example.com');
    });

    it('returns 401 when password is wrong', async () => {
      const token = await registerAndLogin();
      const res = await request(app)
        .patch('/api/users/me/email')
        .set('Authorization', `Bearer ${token}`)
        .send({ email: 'new@example.com', currentPassword: 'wrongpassword' });
      expect(res.statusCode).toBe(401);
    });

    it('returns 400 for invalid email format', async () => {
      const token = await registerAndLogin();
      const res = await request(app)
        .patch('/api/users/me/email')
        .set('Authorization', `Bearer ${token}`)
        .send({ email: 'not-an-email', currentPassword: 'password123' });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('DELETE /api/users/me', () => {
    it('deletes own account with correct password', async () => {
      const token = await registerAndLogin();
      const res = await request(app)
        .delete('/api/users/me')
        .set('Authorization', `Bearer ${token}`)
        .send({ password: 'password123' });
      expect(res.statusCode).toBe(200);
      expect(await User.findOne({ email: 'test@example.com' })).toBeNull();
    });

    it('deletes all user data on account deletion', async () => {
      const token = await registerAndLogin();
      const user = await User.findOne({ email: 'test@example.com' });

      await Task.create({ userId: user._id, title: 'My task' });
      await Contact.create({ userId: user._id, firstName: 'My contact' });
      await ShoppingList.create({ userId: user._id, name: 'My list' });

      await request(app)
        .delete('/api/users/me')
        .set('Authorization', `Bearer ${token}`)
        .send({ password: 'password123' });

      expect(await Task.countDocuments({ userId: user._id })).toBe(0);
      expect(await Contact.countDocuments({ userId: user._id })).toBe(0);
      expect(await ShoppingList.countDocuments({ userId: user._id })).toBe(0);
    });

    it('returns 401 when password is wrong', async () => {
      const token = await registerAndLogin();
      const res = await request(app)
        .delete('/api/users/me')
        .set('Authorization', `Bearer ${token}`)
        .send({ password: 'wrongpassword' });
      expect(res.statusCode).toBe(401);
    });

    it('returns 400 when password is missing', async () => {
      const token = await registerAndLogin();
      const res = await request(app).delete('/api/users/me').set('Authorization', `Bearer ${token}`).send({});
      expect(res.statusCode).toBe(400);
    });
  });
});
