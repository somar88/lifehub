process.env.JWT_SECRET = 'test-secret-key';
process.env.JWT_EXPIRES_IN = '1h';

const request = require('supertest');
const crypto = require('crypto');
const app = require('../../src/app');
const User = require('../../src/models/User');
const dbHelper = require('../helpers/dbHelper');
const emailService = require('../../src/services/emailService');

jest.mock('../../src/services/emailService');

const PASS = 'TestPass1!';

function hashTok(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

describe('Auth Routes', () => {
  beforeAll(async () => {
    await dbHelper.connect();
    emailService.sendWelcomeEmail.mockResolvedValue();
    emailService.sendPasswordResetEmail.mockResolvedValue();
    emailService.sendInviteEmail.mockResolvedValue();
    emailService.sendEmailChangeVerificationEmail.mockResolvedValue();
  });

  afterAll(() => dbHelper.disconnect());

  afterEach(async () => {
    await User.deleteMany({});
    jest.clearAllMocks();
  });

  // ── Register ──────────────────────────────────────────────────────────────

  describe('POST /api/auth/register', () => {
    it('creates a user and returns 201 with token', async () => {
      const res = await request(app).post('/api/auth/register').send({
        name: 'Alice',
        email: 'alice@example.com',
        password: PASS,
      });
      expect(res.statusCode).toBe(201);
      expect(res.body.token).toBeDefined();
      expect(res.body.user.email).toBe('alice@example.com');
      expect(res.body.user.passwordHash).toBeUndefined();
    });

    it('sends a welcome email on registration', async () => {
      await request(app).post('/api/auth/register').send({
        name: 'Alice',
        email: 'alice@example.com',
        password: PASS,
      });
      await new Promise((r) => setTimeout(r, 50));
      expect(emailService.sendWelcomeEmail).toHaveBeenCalledWith('alice@example.com', 'Alice');
    });

    it('returns 400 for missing fields', async () => {
      const res = await request(app).post('/api/auth/register').send({ email: 'bad' });
      expect(res.statusCode).toBe(400);
      expect(res.body.errors).toBeDefined();
    });

    it('returns 400 if password is shorter than 8 characters', async () => {
      const res = await request(app).post('/api/auth/register').send({
        name: 'Alice',
        email: 'alice@example.com',
        password: 'Sh1!',
      });
      expect(res.statusCode).toBe(400);
    });

    it('returns 400 if password has no uppercase letter', async () => {
      const res = await request(app).post('/api/auth/register').send({
        name: 'Alice',
        email: 'alice@example.com',
        password: 'testpass1!',
      });
      expect(res.statusCode).toBe(400);
    });

    it('returns 400 if password has no lowercase letter', async () => {
      const res = await request(app).post('/api/auth/register').send({
        name: 'Alice',
        email: 'alice@example.com',
        password: 'TESTPASS1!',
      });
      expect(res.statusCode).toBe(400);
    });

    it('returns 400 if password has no number', async () => {
      const res = await request(app).post('/api/auth/register').send({
        name: 'Alice',
        email: 'alice@example.com',
        password: 'TestPass!!',
      });
      expect(res.statusCode).toBe(400);
    });

    it('returns 400 if password has no special character', async () => {
      const res = await request(app).post('/api/auth/register').send({
        name: 'Alice',
        email: 'alice@example.com',
        password: 'TestPass123',
      });
      expect(res.statusCode).toBe(400);
    });

    it('returns 409 on duplicate email', async () => {
      await request(app).post('/api/auth/register').send({ name: 'Alice', email: 'alice@example.com', password: PASS });
      const res = await request(app).post('/api/auth/register').send({ name: 'Alice2', email: 'alice@example.com', password: PASS });
      expect(res.statusCode).toBe(409);
    });
  });

  // ── Login ────────────────────────────────────────────────────────────────

  describe('POST /api/auth/login', () => {
    beforeEach(async () => {
      await request(app).post('/api/auth/register').send({ name: 'Bob', email: 'bob@example.com', password: PASS });
    });

    it('returns 200 with token on valid credentials', async () => {
      const res = await request(app).post('/api/auth/login').send({ email: 'bob@example.com', password: PASS });
      expect(res.statusCode).toBe(200);
      expect(res.body.token).toBeDefined();
      expect(res.body.user.passwordHash).toBeUndefined();
    });

    it('sets lastLoginAt on successful login', async () => {
      await request(app).post('/api/auth/login').send({ email: 'bob@example.com', password: PASS });
      const user = await User.findOne({ email: 'bob@example.com' });
      expect(user.lastLoginAt).not.toBeNull();
    });

    it('returns 401 on wrong password', async () => {
      const res = await request(app).post('/api/auth/login').send({ email: 'bob@example.com', password: 'WrongPass1!' });
      expect(res.statusCode).toBe(401);
    });

    it('increments loginAttempts on failed login', async () => {
      await request(app).post('/api/auth/login').send({ email: 'bob@example.com', password: 'WrongPass1!' });
      const user = await User.findOne({ email: 'bob@example.com' }).select('+loginAttempts');
      expect(user.loginAttempts).toBe(1);
    });

    it('resets loginAttempts on successful login', async () => {
      await request(app).post('/api/auth/login').send({ email: 'bob@example.com', password: 'WrongPass1!' });
      await request(app).post('/api/auth/login').send({ email: 'bob@example.com', password: PASS });
      const user = await User.findOne({ email: 'bob@example.com' }).select('+loginAttempts');
      expect(user.loginAttempts).toBe(0);
    });

    it('locks account after 5 failed attempts', async () => {
      for (let i = 0; i < 5; i++) {
        await request(app).post('/api/auth/login').send({ email: 'bob@example.com', password: 'WrongPass1!' });
      }
      const res = await request(app).post('/api/auth/login').send({ email: 'bob@example.com', password: PASS });
      expect(res.statusCode).toBe(401);
      expect(res.body.error).toMatch(/locked/i);
    });

    it('returns 401 on unknown email', async () => {
      const res = await request(app).post('/api/auth/login').send({ email: 'nobody@example.com', password: PASS });
      expect(res.statusCode).toBe(401);
    });

    it('returns 401 for inactive user', async () => {
      await User.findOneAndUpdate({ email: 'bob@example.com' }, { isActive: false, status: 'inactive' });
      const res = await request(app).post('/api/auth/login').send({ email: 'bob@example.com', password: PASS });
      expect(res.statusCode).toBe(401);
    });

    it('returns 401 with status message for pending user', async () => {
      await User.findOneAndUpdate({ email: 'bob@example.com' }, { status: 'pending' });
      const res = await request(app).post('/api/auth/login').send({ email: 'bob@example.com', password: PASS });
      expect(res.statusCode).toBe(401);
      expect(res.body.error).toContain('pending');
    });

    it('returns 401 with status message for invited user', async () => {
      await User.findOneAndUpdate({ email: 'bob@example.com' }, { status: 'invited' });
      const res = await request(app).post('/api/auth/login').send({ email: 'bob@example.com', password: PASS });
      expect(res.statusCode).toBe(401);
      expect(res.body.error).toContain('signup');
    });

    it('returns 401 with status message for inactive user', async () => {
      await User.findOneAndUpdate({ email: 'bob@example.com' }, { status: 'inactive', isActive: false });
      const res = await request(app).post('/api/auth/login').send({ email: 'bob@example.com', password: PASS });
      expect(res.statusCode).toBe(401);
      expect(res.body.error).toContain('deactivated');
    });

    it('logs in successfully with a dotted Gmail address (regression: BUG-1)', async () => {
      await request(app).post('/api/auth/register').send({ name: 'Dot User', email: 'first.last@gmail.com', password: PASS });
      const res = await request(app).post('/api/auth/login').send({ email: 'first.last@gmail.com', password: PASS });
      expect(res.statusCode).toBe(200);
      expect(res.body.token).toBeDefined();
    });
  });

  // ── Forgot Password ──────────────────────────────────────────────────────

  describe('POST /api/auth/forgot-password', () => {
    beforeEach(async () => {
      await request(app).post('/api/auth/register').send({ name: 'Carol', email: 'carol@example.com', password: PASS });
    });

    it('always returns 200 (does not leak whether email exists)', async () => {
      const res = await request(app).post('/api/auth/forgot-password').send({ email: 'nobody@example.com' });
      expect(res.statusCode).toBe(200);
      expect(res.body.message).toContain('reset link');
    });

    it('sets resetToken on user and sends email', async () => {
      await request(app).post('/api/auth/forgot-password').send({ email: 'carol@example.com' });
      await new Promise((r) => setTimeout(r, 50));
      const user = await User.findOne({ email: 'carol@example.com' });
      expect(user.resetToken).toBeTruthy();
      expect(emailService.sendPasswordResetEmail).toHaveBeenCalledWith('carol@example.com', expect.any(String));
    });
  });

  // ── Reset Password ───────────────────────────────────────────────────────

  describe('POST /api/auth/reset-password', () => {
    let resetToken;

    beforeEach(async () => {
      await request(app).post('/api/auth/register').send({ name: 'Dave', email: 'dave@example.com', password: PASS });
      await request(app).post('/api/auth/forgot-password').send({ email: 'dave@example.com' });
      resetToken = emailService.sendPasswordResetEmail.mock.calls[0][1];
    });

    it('resets password with valid token', async () => {
      const res = await request(app).post('/api/auth/reset-password').send({ token: resetToken, password: 'NewPass2@' });
      expect(res.statusCode).toBe(200);
      expect(res.body.message).toContain('reset successfully');

      const login = await request(app).post('/api/auth/login').send({ email: 'dave@example.com', password: 'NewPass2@' });
      expect(login.statusCode).toBe(200);
    });

    it('returns 400 for invalid token', async () => {
      const res = await request(app).post('/api/auth/reset-password').send({ token: 'invalidtoken', password: 'NewPass2@' });
      expect(res.statusCode).toBe(400);
    });

    it('returns 400 for expired token', async () => {
      await User.findOneAndUpdate({ email: 'dave@example.com' }, { resetTokenExpiry: new Date(Date.now() - 1000) });
      const res = await request(app).post('/api/auth/reset-password').send({ token: resetToken, password: 'NewPass2@' });
      expect(res.statusCode).toBe(400);
    });

    it('clears token after use (no replay)', async () => {
      await request(app).post('/api/auth/reset-password').send({ token: resetToken, password: 'NewPass2@' });
      const res = await request(app).post('/api/auth/reset-password').send({ token: resetToken, password: 'NewPass3#' });
      expect(res.statusCode).toBe(400);
    });

    it('returns 400 for weak new password', async () => {
      const res = await request(app).post('/api/auth/reset-password').send({ token: resetToken, password: 'weakpass' });
      expect(res.statusCode).toBe(400);
      expect(res.body.errors).toBeDefined();
    });
  });

  // ── Logout ───────────────────────────────────────────────────────────────

  describe('POST /api/auth/logout', () => {
    let token;
    beforeEach(async () => {
      const res = await request(app).post('/api/auth/register').send({ name: 'Lou', email: 'lou@example.com', password: PASS });
      token = res.body.token;
    });

    it('returns 200 on logout', async () => {
      const res = await request(app).post('/api/auth/logout').set('Authorization', `Bearer ${token}`);
      expect(res.statusCode).toBe(200);
      expect(res.body.message).toBe('Logged out');
    });

    it('revokes the token so subsequent requests fail', async () => {
      await request(app).post('/api/auth/logout').set('Authorization', `Bearer ${token}`);
      const res = await request(app).get('/api/users/me').set('Authorization', `Bearer ${token}`);
      expect(res.statusCode).toBe(401);
    });

    it('returns 401 without token', async () => {
      const res = await request(app).post('/api/auth/logout');
      expect(res.statusCode).toBe(401);
    });
  });

  // ── Apply ────────────────────────────────────────────────────────────────

  describe('POST /api/auth/apply', () => {
    it('creates a pending application and returns 201', async () => {
      const res = await request(app).post('/api/auth/apply').send({ firstName: 'Eve', lastName: 'Smith', email: 'eve@example.com' });
      expect(res.statusCode).toBe(201);
      expect(res.body.message).toContain('Application submitted');

      const user = await User.findOne({ email: 'eve@example.com' }).select('+passwordHash');
      expect(user.status).toBe('pending');
      expect(user.isActive).toBe(false);
      expect(user.passwordHash).toBeNull();
    });

    it('returns 400 for missing firstName', async () => {
      const res = await request(app).post('/api/auth/apply').send({ email: 'eve@example.com' });
      expect(res.statusCode).toBe(400);
      expect(res.body.errors).toBeDefined();
    });

    it('returns 400 for invalid email', async () => {
      const res = await request(app).post('/api/auth/apply').send({ firstName: 'Eve', email: 'not-an-email' });
      expect(res.statusCode).toBe(400);
    });

    it('returns 409 for duplicate email', async () => {
      await request(app).post('/api/auth/apply').send({ firstName: 'Eve', email: 'eve@example.com' });
      const res = await request(app).post('/api/auth/apply').send({ firstName: 'Eve2', email: 'eve@example.com' });
      expect(res.statusCode).toBe(409);
    });

    it('sets name as firstName + lastName', async () => {
      await request(app).post('/api/auth/apply').send({ firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com' });
      const user = await User.findOne({ email: 'ada@example.com' });
      expect(user.name).toBe('Ada Lovelace');
    });
  });

  // ── Verify Invite ────────────────────────────────────────────────────────

  describe('GET /api/auth/verify-invite', () => {
    let rawToken;

    beforeEach(async () => {
      rawToken = crypto.randomBytes(32).toString('hex');
      await User.create({
        name: 'Frank',
        email: 'frank@example.com',
        passwordHash: null,
        isActive: false,
        status: 'invited',
        inviteToken: hashTok(rawToken),
        inviteTokenExpiry: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });
    });

    it('returns valid: true with name and email for valid token', async () => {
      const res = await request(app).get(`/api/auth/verify-invite?token=${rawToken}`);
      expect(res.statusCode).toBe(200);
      expect(res.body.valid).toBe(true);
      expect(res.body.email).toBe('frank@example.com');
      expect(res.body.name).toBe('Frank');
    });

    it('returns 400 for invalid token', async () => {
      const res = await request(app).get('/api/auth/verify-invite?token=badtoken');
      expect(res.statusCode).toBe(400);
    });

    it('returns 400 when passing the hash directly (security: raw token required)', async () => {
      const res = await request(app).get(`/api/auth/verify-invite?token=${hashTok(rawToken)}`);
      expect(res.statusCode).toBe(400);
    });

    it('returns 400 for expired token', async () => {
      await User.findOneAndUpdate({ email: 'frank@example.com' }, { inviteTokenExpiry: new Date(Date.now() - 1000) });
      const res = await request(app).get(`/api/auth/verify-invite?token=${rawToken}`);
      expect(res.statusCode).toBe(400);
    });

    it('returns 400 when token is omitted', async () => {
      const res = await request(app).get('/api/auth/verify-invite');
      expect(res.statusCode).toBe(400);
    });
  });

  // ── Accept Invite ────────────────────────────────────────────────────────

  describe('POST /api/auth/accept-invite', () => {
    let rawToken;

    beforeEach(async () => {
      rawToken = crypto.randomBytes(32).toString('hex');
      await User.create({
        name: 'Grace',
        email: 'grace@example.com',
        passwordHash: null,
        isActive: false,
        status: 'invited',
        inviteToken: hashTok(rawToken),
        inviteTokenExpiry: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });
    });

    it('activates user and returns token', async () => {
      const res = await request(app).post('/api/auth/accept-invite').send({ token: rawToken, password: PASS });
      expect(res.statusCode).toBe(200);
      expect(res.body.token).toBeDefined();
      expect(res.body.user.status).toBe('active');
      expect(res.body.user.isActive).toBe(true);
      expect(res.body.user.passwordHash).toBeUndefined();
    });

    it('allows login after accepting invite', async () => {
      await request(app).post('/api/auth/accept-invite').send({ token: rawToken, password: PASS });
      const login = await request(app).post('/api/auth/login').send({ email: 'grace@example.com', password: PASS });
      expect(login.statusCode).toBe(200);
      expect(login.body.token).toBeDefined();
    });

    it('clears inviteToken after acceptance (no replay)', async () => {
      await request(app).post('/api/auth/accept-invite').send({ token: rawToken, password: PASS });
      const res = await request(app).post('/api/auth/accept-invite').send({ token: rawToken, password: 'NewPass2@' });
      expect(res.statusCode).toBe(400);
    });

    it('returns 400 for invalid token', async () => {
      const res = await request(app).post('/api/auth/accept-invite').send({ token: 'badtoken', password: PASS });
      expect(res.statusCode).toBe(400);
    });

    it('returns 400 for expired token', async () => {
      await User.findOneAndUpdate({ email: 'grace@example.com' }, { inviteTokenExpiry: new Date(Date.now() - 1000) });
      const res = await request(app).post('/api/auth/accept-invite').send({ token: rawToken, password: PASS });
      expect(res.statusCode).toBe(400);
    });

    it('returns 400 for weak password', async () => {
      const res = await request(app).post('/api/auth/accept-invite').send({ token: rawToken, password: 'short' });
      expect(res.statusCode).toBe(400);
    });
  });
});
