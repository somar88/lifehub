process.env.JWT_SECRET = 'test-secret';
process.env.ENCRYPTION_KEY = 'c'.repeat(64);

const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../../src/app');
const User = require('../../src/models/User');
const Config = require('../../src/models/Config');
const dbHelper = require('../helpers/dbHelper');
const emailService = require('../../src/services/emailService');

jest.mock('../../src/services/emailService');

async function createUser(overrides = {}) {
  const defaults = { name: 'Test', email: 'test@example.com', password: 'password123', role: 'user' };
  const d = { ...defaults, ...overrides };
  const passwordHash = await bcrypt.hash(d.password, 4);
  return User.create({ name: d.name, email: d.email, passwordHash, role: d.role, isActive: true, status: d.status || 'active' });
}

async function loginAs(email, password = 'password123') {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  return res.body.token;
}

describe('Admin Routes', () => {
  let adminToken, userToken;

  beforeAll(() => dbHelper.connect());
  afterAll(() => dbHelper.disconnect());

  beforeEach(async () => {
    await User.deleteMany({});
    await Config.deleteMany({});
    emailService.sendWelcomeEmail.mockResolvedValue();
    emailService.sendPasswordResetEmail.mockResolvedValue();
    emailService.sendInviteEmail.mockResolvedValue();
    await createUser({ email: 'admin@example.com', role: 'admin' });
    await createUser({ email: 'user@example.com',  role: 'user' });
    adminToken = await loginAs('admin@example.com');
    userToken  = await loginAs('user@example.com');
  });

  afterEach(() => jest.clearAllMocks());

  // ── Access control ────────────────────────────────────────────────────────

  it('returns 401 when no token is provided', async () => {
    const res = await request(app).get('/api/admin/system/status');
    expect(res.statusCode).toBe(401);
  });

  it('returns 403 for non-admin users', async () => {
    const res = await request(app)
      .get('/api/admin/system/status')
      .set('Authorization', `Bearer ${userToken}`);
    expect(res.statusCode).toBe(403);
  });

  // ── System Status ─────────────────────────────────────────────────────────

  describe('GET /api/admin/system/status', () => {
    it('returns system status for admin', async () => {
      const res = await request(app)
        .get('/api/admin/system/status')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.statusCode).toBe(200);
      expect(res.body.database.status).toBe('connected');
      expect(res.body.users.total).toBeGreaterThanOrEqual(2);
      expect(res.body.server.uptime).toBeGreaterThanOrEqual(0);
    });
  });

  // ── Email Config ──────────────────────────────────────────────────────────

  describe('GET /api/admin/config/email', () => {
    it('returns empty object when not configured', async () => {
      const res = await request(app)
        .get('/api/admin/config/email')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({});
    });
  });

  describe('PUT /api/admin/config/email', () => {
    it('saves gmail-smtp config', async () => {
      const res = await request(app)
        .put('/api/admin/config/email')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ provider: 'gmail-smtp', user: 'app@gmail.com', password: 'apppass' });
      expect(res.statusCode).toBe(200);
      expect(res.body.message).toContain('saved');
    });

    it('returns 400 for invalid provider', async () => {
      const res = await request(app)
        .put('/api/admin/config/email')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ provider: 'unknown', user: 'x@gmail.com' });
      expect(res.statusCode).toBe(400);
    });

    it('masks password in subsequent GET', async () => {
      await request(app)
        .put('/api/admin/config/email')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ provider: 'gmail-smtp', user: 'app@gmail.com', password: 'secret' });

      const res = await request(app)
        .get('/api/admin/config/email')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.body.password).toBe('***');
      expect(res.body.user).toBe('app@gmail.com');
    });
  });

  describe('POST /api/admin/config/email/test', () => {
    it('sends test email to the admin', async () => {
      const res = await request(app)
        .post('/api/admin/config/email/test')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.statusCode).toBe(200);
      expect(emailService.sendWelcomeEmail).toHaveBeenCalled();
    });
  });

  // ── Users ─────────────────────────────────────────────────────────────────

  describe('GET /api/admin/users', () => {
    it('returns paginated user list', async () => {
      const res = await request(app)
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.body.users)).toBe(true);
      expect(res.body.total).toBeGreaterThanOrEqual(2);
      expect(res.body.page).toBe(1);
    });

    it('does not expose passwordHash', async () => {
      const res = await request(app)
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${adminToken}`);
      res.body.users.forEach(u => expect(u.passwordHash).toBeUndefined());
    });
  });

  describe('PATCH /api/admin/users/:id', () => {
    it('deactivates a user', async () => {
      const user = await User.findOne({ email: 'user@example.com' });
      const res = await request(app)
        .patch(`/api/admin/users/${user._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ isActive: false });
      expect(res.statusCode).toBe(200);
      expect(res.body.isActive).toBe(false);
    });

    it('promotes a user to admin', async () => {
      const user = await User.findOne({ email: 'user@example.com' });
      const res = await request(app)
        .patch(`/api/admin/users/${user._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: 'admin' });
      expect(res.statusCode).toBe(200);
      expect(res.body.role).toBe('admin');
    });

    it('prevents admin from modifying their own account', async () => {
      const admin = await User.findOne({ email: 'admin@example.com' });
      const res = await request(app)
        .patch(`/api/admin/users/${admin._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ isActive: false });
      expect(res.statusCode).toBe(400);
    });

    it('returns 404 for non-existent user', async () => {
      const res = await request(app)
        .patch('/api/admin/users/000000000000000000000000')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ isActive: false });
      expect(res.statusCode).toBe(404);
    });
  });

  // ── Create User ───────────────────────────────────────────────────────────

  describe('POST /api/admin/users', () => {
    it('creates an invited user and sends invitation email', async () => {
      const res = await request(app)
        .post('/api/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Heidi', email: 'heidi@example.com', role: 'user' });
      expect(res.statusCode).toBe(201);
      expect(res.body.status).toBe('invited');
      expect(res.body.isActive).toBe(false);
      expect(emailService.sendInviteEmail).toHaveBeenCalledWith(
        'heidi@example.com',
        'Heidi',
        expect.stringContaining('token=')
      );
    });

    it('defaults role to user when omitted', async () => {
      const res = await request(app)
        .post('/api/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Ivan', email: 'ivan@example.com' });
      expect(res.statusCode).toBe(201);
      expect(res.body.role).toBe('user');
    });

    it('returns 409 for duplicate email', async () => {
      await request(app)
        .post('/api/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Heidi', email: 'heidi@example.com' });
      const res = await request(app)
        .post('/api/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Heidi2', email: 'heidi@example.com' });
      expect(res.statusCode).toBe(409);
    });

    it('returns 400 for missing name', async () => {
      const res = await request(app)
        .post('/api/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ email: 'noname@example.com' });
      expect(res.statusCode).toBe(400);
    });

    it('returns 400 for invalid email', async () => {
      const res = await request(app)
        .post('/api/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Jane', email: 'not-email' });
      expect(res.statusCode).toBe(400);
    });
  });

  // ── Approve User ──────────────────────────────────────────────────────────

  describe('PATCH /api/admin/users/:id/approve', () => {
    let pendingUser;

    beforeEach(async () => {
      pendingUser = await User.create({
        name: 'Karl',
        email: 'karl@example.com',
        passwordHash: null,
        isActive: false,
        status: 'pending',
      });
    });

    it('changes status to invited and sends invite email', async () => {
      const res = await request(app)
        .patch(`/api/admin/users/${pendingUser._id}/approve`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe('invited');
      expect(emailService.sendInviteEmail).toHaveBeenCalledWith(
        'karl@example.com',
        'Karl',
        expect.stringContaining('token=')
      );
    });

    it('returns 400 if user is not pending', async () => {
      const activeUser = await User.findOne({ email: 'user@example.com' });
      const res = await request(app)
        .patch(`/api/admin/users/${activeUser._id}/approve`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.statusCode).toBe(400);
    });

    it('returns 404 for non-existent user', async () => {
      const res = await request(app)
        .patch('/api/admin/users/000000000000000000000000/approve')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.statusCode).toBe(404);
    });
  });

  // ── Reject User ───────────────────────────────────────────────────────────

  describe('PATCH /api/admin/users/:id/reject', () => {
    let pendingUser;

    beforeEach(async () => {
      pendingUser = await User.create({
        name: 'Laura',
        email: 'laura@example.com',
        passwordHash: null,
        isActive: false,
        status: 'pending',
      });
    });

    it('deletes the pending user', async () => {
      const res = await request(app)
        .patch(`/api/admin/users/${pendingUser._id}/reject`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.statusCode).toBe(200);
      const gone = await User.findById(pendingUser._id);
      expect(gone).toBeNull();
    });

    it('returns 400 if user is not pending', async () => {
      const activeUser = await User.findOne({ email: 'user@example.com' });
      const res = await request(app)
        .patch(`/api/admin/users/${activeUser._id}/reject`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.statusCode).toBe(400);
    });

    it('returns 404 for non-existent user', async () => {
      const res = await request(app)
        .patch('/api/admin/users/000000000000000000000000/reject')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.statusCode).toBe(404);
    });
  });

  // ── Users status filter ───────────────────────────────────────────────────

  describe('GET /api/admin/users?status=', () => {
    beforeEach(async () => {
      await User.create({ name: 'Pending1', email: 'p1@example.com', passwordHash: null, isActive: false, status: 'pending' });
      await User.create({ name: 'Pending2', email: 'p2@example.com', passwordHash: null, isActive: false, status: 'pending' });
      await User.create({ name: 'Invited1', email: 'i1@example.com', passwordHash: null, isActive: false, status: 'invited' });
    });

    it('filters by status=pending', async () => {
      const res = await request(app)
        .get('/api/admin/users?status=pending')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.statusCode).toBe(200);
      expect(res.body.users.every(u => u.status === 'pending')).toBe(true);
      expect(res.body.total).toBe(2);
    });

    it('filters by status=invited', async () => {
      const res = await request(app)
        .get('/api/admin/users?status=invited')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.statusCode).toBe(200);
      expect(res.body.users.every(u => u.status === 'invited')).toBe(true);
    });

    it('returns all users when status is omitted', async () => {
      const res = await request(app)
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.statusCode).toBe(200);
      expect(res.body.total).toBeGreaterThanOrEqual(5);
    });

    it('includes pending count in system status', async () => {
      const res = await request(app)
        .get('/api/admin/system/status')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.statusCode).toBe(200);
      expect(res.body.users.pending).toBe(2);
    });
  });
});
