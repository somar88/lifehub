process.env.JWT_SECRET = 'test-secret';
process.env.ENCRYPTION_KEY = 'c'.repeat(64);

const request = require('supertest');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const app = require('../../src/app');
const User = require('../../src/models/User');
const AuditLog = require('../../src/models/AuditLog');
const Config = require('../../src/models/Config');
const dbHelper = require('../helpers/dbHelper');
const emailService = require('../../src/services/emailService');

jest.mock('../../src/services/emailService');

function hashTok(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

async function createUser(overrides = {}) {
  const defaults = { name: 'Test', email: 'test@example.com', password: 'TestPass1!', role: 'user' };
  const d = { ...defaults, ...overrides };
  const passwordHash = await bcrypt.hash(d.password, 4);
  return User.create({ name: d.name, email: d.email, passwordHash, role: d.role, isActive: true, status: d.status || 'active' });
}

async function loginAs(email, password = 'TestPass1!') {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  return res.body.token;
}

describe('Admin Routes', () => {
  let adminToken, userToken, adminUser, normalUser;

  beforeAll(() => dbHelper.connect());
  afterAll(() => dbHelper.disconnect());

  beforeEach(async () => {
    await User.deleteMany({});
    await Config.deleteMany({});
    await AuditLog.deleteMany({});
    emailService.sendWelcomeEmail.mockResolvedValue();
    emailService.sendPasswordResetEmail.mockResolvedValue();
    emailService.sendInviteEmail.mockResolvedValue();
    emailService.sendEmailChangeVerificationEmail.mockResolvedValue();
    adminUser = await createUser({ email: 'admin@example.com', role: 'admin' });
    normalUser = await createUser({ email: 'user@example.com', role: 'user' });
    adminToken = await loginAs('admin@example.com');
    userToken = await loginAs('user@example.com');
  });

  afterEach(() => jest.clearAllMocks());

  // ── Access control ────────────────────────────────────────────────────────

  it('returns 401 when no token is provided', async () => {
    const res = await request(app).get('/api/admin/system/status');
    expect(res.statusCode).toBe(401);
  });

  it('returns 403 for non-admin users', async () => {
    const res = await request(app).get('/api/admin/system/status').set('Authorization', `Bearer ${userToken}`);
    expect(res.statusCode).toBe(403);
  });

  // ── System Status ─────────────────────────────────────────────────────────

  describe('GET /api/admin/system/status', () => {
    it('returns system status with per-status user counts', async () => {
      await User.create({ name: 'P', email: 'p@example.com', passwordHash: null, isActive: false, status: 'pending' });
      const res = await request(app).get('/api/admin/system/status').set('Authorization', `Bearer ${adminToken}`);
      expect(res.statusCode).toBe(200);
      expect(res.body.database.status).toBe('connected');
      expect(res.body.users.total).toBeGreaterThanOrEqual(3);
      expect(res.body.users.pending).toBe(1);
      expect(res.body.users.active).toBeGreaterThanOrEqual(2);
      expect(res.body.server.uptime).toBeGreaterThanOrEqual(0);
    });
  });

  // ── Email Config ──────────────────────────────────────────────────────────

  describe('GET /api/admin/config/email', () => {
    it('returns empty object when not configured', async () => {
      const res = await request(app).get('/api/admin/config/email').set('Authorization', `Bearer ${adminToken}`);
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
      const res = await request(app).get('/api/admin/config/email').set('Authorization', `Bearer ${adminToken}`);
      expect(res.body.password).toBe('***');
      expect(res.body.user).toBe('app@gmail.com');
    });

    it('writes an audit log entry', async () => {
      await request(app)
        .put('/api/admin/config/email')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ provider: 'gmail-smtp', user: 'app@gmail.com', password: 'secret' });
      const log = await AuditLog.findOne({ action: 'email_config_updated' });
      expect(log).not.toBeNull();
    });
  });

  describe('POST /api/admin/config/email/test', () => {
    it('sends test email to the admin', async () => {
      const res = await request(app).post('/api/admin/config/email/test').set('Authorization', `Bearer ${adminToken}`);
      expect(res.statusCode).toBe(200);
      expect(emailService.sendWelcomeEmail).toHaveBeenCalled();
    });
  });

  // ── Users ─────────────────────────────────────────────────────────────────

  describe('GET /api/admin/users', () => {
    it('returns paginated user list', async () => {
      const res = await request(app).get('/api/admin/users').set('Authorization', `Bearer ${adminToken}`);
      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.body.users)).toBe(true);
      expect(res.body.total).toBeGreaterThanOrEqual(2);
      expect(res.body.page).toBe(1);
    });

    it('does not expose passwordHash', async () => {
      const res = await request(app).get('/api/admin/users').set('Authorization', `Bearer ${adminToken}`);
      res.body.users.forEach(u => expect(u.passwordHash).toBeUndefined());
    });

    it('filters by status=pending', async () => {
      await User.create({ name: 'P1', email: 'p1@example.com', passwordHash: null, isActive: false, status: 'pending' });
      await User.create({ name: 'P2', email: 'p2@example.com', passwordHash: null, isActive: false, status: 'pending' });
      const res = await request(app).get('/api/admin/users?status=pending').set('Authorization', `Bearer ${adminToken}`);
      expect(res.statusCode).toBe(200);
      expect(res.body.users.every(u => u.status === 'pending')).toBe(true);
      expect(res.body.total).toBe(2);
    });

    it('searches users by name', async () => {
      await createUser({ name: 'Unique Zebra', email: 'zebra@example.com' });
      const res = await request(app).get('/api/admin/users?search=zebra').set('Authorization', `Bearer ${adminToken}`);
      expect(res.statusCode).toBe(200);
      expect(res.body.users.length).toBe(1);
      expect(res.body.users[0].name).toBe('Unique Zebra');
    });

    it('searches users by email', async () => {
      await createUser({ name: 'Someone', email: 'uniqueaddr@example.com' });
      const res = await request(app).get('/api/admin/users?search=uniqueaddr').set('Authorization', `Bearer ${adminToken}`);
      expect(res.statusCode).toBe(200);
      expect(res.body.users.length).toBe(1);
    });

    it('search is case-insensitive', async () => {
      await createUser({ name: 'CaseSensitive', email: 'cs@example.com' });
      const res = await request(app).get('/api/admin/users?search=casesensitive').set('Authorization', `Bearer ${adminToken}`);
      expect(res.statusCode).toBe(200);
      expect(res.body.users.length).toBe(1);
    });
  });

  describe('PATCH /api/admin/users/:id', () => {
    it('deactivates a user', async () => {
      const res = await request(app)
        .patch(`/api/admin/users/${normalUser._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ isActive: false });
      expect(res.statusCode).toBe(200);
      expect(res.body.isActive).toBe(false);
      expect(res.body.status).toBe('inactive');
    });

    it('promotes a user to admin', async () => {
      const res = await request(app)
        .patch(`/api/admin/users/${normalUser._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: 'admin' });
      expect(res.statusCode).toBe(200);
      expect(res.body.role).toBe('admin');
    });

    it('writes an audit log entry on user update', async () => {
      await request(app)
        .patch(`/api/admin/users/${normalUser._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: 'admin' });
      const log = await AuditLog.findOne({ action: 'user_updated', targetId: normalUser._id });
      expect(log).not.toBeNull();
      expect(log.changes.role).toBe('admin');
    });

    it('prevents admin from modifying their own account', async () => {
      const res = await request(app)
        .patch(`/api/admin/users/${adminUser._id}`)
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
      expect(emailService.sendInviteEmail).toHaveBeenCalledWith('heidi@example.com', 'Heidi', expect.stringContaining('token='));
    });

    it('stores invite token as a hash (raw token sent in email URL)', async () => {
      await request(app)
        .post('/api/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Heidi', email: 'heidi@example.com' });

      await new Promise((r) => setTimeout(r, 50));
      const inviteUrl = emailService.sendInviteEmail.mock.calls[0][2];
      const rawToken = new URL(inviteUrl).searchParams.get('token');

      const user = await User.findOne({ email: 'heidi@example.com' }).select('+inviteToken');
      expect(user.inviteToken).toBe(hashTok(rawToken));
      expect(user.inviteToken).not.toBe(rawToken);
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
      await request(app).post('/api/admin/users').set('Authorization', `Bearer ${adminToken}`).send({ name: 'H', email: 'heidi@example.com' });
      const res = await request(app).post('/api/admin/users').set('Authorization', `Bearer ${adminToken}`).send({ name: 'H2', email: 'heidi@example.com' });
      expect(res.statusCode).toBe(409);
    });

    it('returns 400 for missing name', async () => {
      const res = await request(app).post('/api/admin/users').set('Authorization', `Bearer ${adminToken}`).send({ email: 'noname@example.com' });
      expect(res.statusCode).toBe(400);
    });

    it('writes an audit log entry', async () => {
      await request(app).post('/api/admin/users').set('Authorization', `Bearer ${adminToken}`).send({ name: 'Logged', email: 'logged@example.com' });
      const log = await AuditLog.findOne({ action: 'user_created' });
      expect(log).not.toBeNull();
    });
  });

  // ── Approve User ──────────────────────────────────────────────────────────

  describe('PATCH /api/admin/users/:id/approve', () => {
    let pendingUser;

    beforeEach(async () => {
      pendingUser = await User.create({ name: 'Karl', email: 'karl@example.com', passwordHash: null, isActive: false, status: 'pending' });
    });

    it('changes status to invited and sends invite email with hashed token', async () => {
      const res = await request(app)
        .patch(`/api/admin/users/${pendingUser._id}/approve`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe('invited');

      await new Promise((r) => setTimeout(r, 50));
      expect(emailService.sendInviteEmail).toHaveBeenCalledWith('karl@example.com', 'Karl', expect.stringContaining('token='));

      const inviteUrl = emailService.sendInviteEmail.mock.calls[0][2];
      const rawToken = new URL(inviteUrl).searchParams.get('token');
      const user = await User.findById(pendingUser._id).select('+inviteToken');
      expect(user.inviteToken).toBe(hashTok(rawToken));
    });

    it('returns 400 if user is not pending', async () => {
      const res = await request(app)
        .patch(`/api/admin/users/${normalUser._id}/approve`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.statusCode).toBe(400);
    });

    it('returns 404 for non-existent user', async () => {
      const res = await request(app)
        .patch('/api/admin/users/000000000000000000000000/approve')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.statusCode).toBe(404);
    });

    it('writes an audit log entry', async () => {
      await request(app).patch(`/api/admin/users/${pendingUser._id}/approve`).set('Authorization', `Bearer ${adminToken}`);
      const log = await AuditLog.findOne({ action: 'user_approved', targetId: pendingUser._id });
      expect(log).not.toBeNull();
    });
  });

  // ── Reject User ───────────────────────────────────────────────────────────

  describe('PATCH /api/admin/users/:id/reject', () => {
    let pendingUser;

    beforeEach(async () => {
      pendingUser = await User.create({ name: 'Laura', email: 'laura@example.com', passwordHash: null, isActive: false, status: 'pending' });
    });

    it('deletes the pending user', async () => {
      const res = await request(app).patch(`/api/admin/users/${pendingUser._id}/reject`).set('Authorization', `Bearer ${adminToken}`);
      expect(res.statusCode).toBe(200);
      expect(await User.findById(pendingUser._id)).toBeNull();
    });

    it('returns 400 if user is not pending', async () => {
      const res = await request(app).patch(`/api/admin/users/${normalUser._id}/reject`).set('Authorization', `Bearer ${adminToken}`);
      expect(res.statusCode).toBe(400);
    });

    it('returns 404 for non-existent user', async () => {
      const res = await request(app).patch('/api/admin/users/000000000000000000000000/reject').set('Authorization', `Bearer ${adminToken}`);
      expect(res.statusCode).toBe(404);
    });

    it('writes an audit log entry', async () => {
      await request(app).patch(`/api/admin/users/${pendingUser._id}/reject`).set('Authorization', `Bearer ${adminToken}`);
      const log = await AuditLog.findOne({ action: 'user_rejected' });
      expect(log).not.toBeNull();
    });
  });

  // ── Resend Invite ─────────────────────────────────────────────────────────

  describe('POST /api/admin/users/:id/resend-invite', () => {
    let invitedUser;

    beforeEach(async () => {
      const rawToken = crypto.randomBytes(32).toString('hex');
      invitedUser = await User.create({
        name: 'Mia',
        email: 'mia@example.com',
        passwordHash: null,
        isActive: false,
        status: 'invited',
        inviteToken: hashTok(rawToken),
        inviteTokenExpiry: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });
    });

    it('generates a new token and resends invite email', async () => {
      const res = await request(app)
        .post(`/api/admin/users/${invitedUser._id}/resend-invite`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.statusCode).toBe(200);
      expect(res.body.message).toMatch(/resent/i);
      expect(emailService.sendInviteEmail).toHaveBeenCalledWith('mia@example.com', 'Mia', expect.stringContaining('token='));
    });

    it('updates inviteToken and expiry', async () => {
      const before = await User.findById(invitedUser._id).select('+inviteToken');
      const oldHash = before.inviteToken;
      await request(app).post(`/api/admin/users/${invitedUser._id}/resend-invite`).set('Authorization', `Bearer ${adminToken}`);
      const after = await User.findById(invitedUser._id).select('+inviteToken');
      expect(after.inviteToken).not.toBe(oldHash);
    });

    it('returns 400 if user is not in invited status', async () => {
      const res = await request(app).post(`/api/admin/users/${normalUser._id}/resend-invite`).set('Authorization', `Bearer ${adminToken}`);
      expect(res.statusCode).toBe(400);
    });

    it('returns 404 for non-existent user', async () => {
      const res = await request(app).post('/api/admin/users/000000000000000000000000/resend-invite').set('Authorization', `Bearer ${adminToken}`);
      expect(res.statusCode).toBe(404);
    });
  });

  // ── Revoke Sessions ───────────────────────────────────────────────────────

  describe('POST /api/admin/users/:id/revoke-sessions', () => {
    it('sets tokensValidFrom and invalidates existing tokens', async () => {
      const loginRes = await request(app).post('/api/auth/login').send({ email: 'user@example.com', password: 'TestPass1!' });
      const userToken2 = loginRes.body.token;

      const res = await request(app)
        .post(`/api/admin/users/${normalUser._id}/revoke-sessions`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.statusCode).toBe(200);
      expect(res.body.message).toMatch(/revoked/i);

      const meRes = await request(app).get('/api/users/me').set('Authorization', `Bearer ${userToken2}`);
      expect(meRes.statusCode).toBe(401);
    });

    it('prevents admin from revoking their own sessions', async () => {
      const res = await request(app)
        .post(`/api/admin/users/${adminUser._id}/revoke-sessions`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.statusCode).toBe(400);
    });

    it('returns 404 for non-existent user', async () => {
      const res = await request(app).post('/api/admin/users/000000000000000000000000/revoke-sessions').set('Authorization', `Bearer ${adminToken}`);
      expect(res.statusCode).toBe(404);
    });

    it('writes an audit log entry', async () => {
      await request(app).post(`/api/admin/users/${normalUser._id}/revoke-sessions`).set('Authorization', `Bearer ${adminToken}`);
      const log = await AuditLog.findOne({ action: 'sessions_revoked', targetId: normalUser._id });
      expect(log).not.toBeNull();
    });
  });

  // ── Audit Log ─────────────────────────────────────────────────────────────

  describe('GET /api/admin/audit-log', () => {
    beforeEach(async () => {
      await request(app).patch(`/api/admin/users/${normalUser._id}`).set('Authorization', `Bearer ${adminToken}`).send({ role: 'admin' });
      await request(app).patch(`/api/admin/users/${normalUser._id}`).set('Authorization', `Bearer ${adminToken}`).send({ isActive: false });
    });

    it('returns paginated audit log', async () => {
      const res = await request(app).get('/api/admin/audit-log').set('Authorization', `Bearer ${adminToken}`);
      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.body.logs)).toBe(true);
      expect(res.body.total).toBeGreaterThanOrEqual(2);
    });

    it('populates admin and target user info', async () => {
      const res = await request(app).get('/api/admin/audit-log').set('Authorization', `Bearer ${adminToken}`);
      const log = res.body.logs[0];
      expect(log.adminId.email).toBe('admin@example.com');
      expect(log.targetId.email).toBe('user@example.com');
    });

    it('filters by action', async () => {
      const res = await request(app).get('/api/admin/audit-log?action=user_updated').set('Authorization', `Bearer ${adminToken}`);
      expect(res.statusCode).toBe(200);
      expect(res.body.logs.every(l => l.action === 'user_updated')).toBe(true);
    });

    it('returns 401 for non-admin', async () => {
      const res = await request(app).get('/api/admin/audit-log').set('Authorization', `Bearer ${userToken}`);
      expect(res.statusCode).toBe(403);
    });
  });
});
