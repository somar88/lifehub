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

const PASS = 'TestPass1!';

async function registerAndLogin(overrides = {}) {
  const data = { name: 'Test User', email: 'test@example.com', password: PASS, ...overrides };
  emailService.sendWelcomeEmail.mockResolvedValue();
  const res = await request(app).post('/api/auth/register').send(data);
  return res.body.token;
}

describe('User Routes', () => {
  beforeAll(async () => {
    await dbHelper.connect();
    emailService.sendWelcomeEmail.mockResolvedValue();
    emailService.sendEmailChangeVerificationEmail.mockResolvedValue();
  });

  afterAll(() => dbHelper.disconnect());

  afterEach(async () => {
    await User.deleteMany({});
    jest.clearAllMocks();
    emailService.sendWelcomeEmail.mockResolvedValue();
    emailService.sendEmailChangeVerificationEmail.mockResolvedValue();
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

    it('updates the timezone preference', async () => {
      const token = await registerAndLogin();
      const res = await request(app).patch('/api/users/me').set('Authorization', `Bearer ${token}`).send({ timezone: 'America/New_York' });
      expect(res.statusCode).toBe(200);
      expect(res.body.timezone).toBe('America/New_York');
    });

    it('updates dailyDigestHour', async () => {
      const token = await registerAndLogin();
      const res = await request(app).patch('/api/users/me').set('Authorization', `Bearer ${token}`).send({ dailyDigestHour: 9 });
      expect(res.statusCode).toBe(200);
      expect(res.body.dailyDigestHour).toBe(9);
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
        .send({ currentPassword: PASS, newPassword: 'NewPass2@' });
      expect(res.statusCode).toBe(200);
      expect(res.body.message).toMatch(/changed/i);
      expect(res.body.token).toBeDefined();
    });

    it('invalidates old token after password change', async () => {
      const token = await registerAndLogin();
      await request(app)
        .post('/api/users/me/password')
        .set('Authorization', `Bearer ${token}`)
        .send({ currentPassword: PASS, newPassword: 'NewPass2@' });
      const res = await request(app).get('/api/users/me').set('Authorization', `Bearer ${token}`);
      expect(res.statusCode).toBe(401);
    });

    it('returns 401 when current password is wrong', async () => {
      const token = await registerAndLogin();
      const res = await request(app)
        .post('/api/users/me/password')
        .set('Authorization', `Bearer ${token}`)
        .send({ currentPassword: 'WrongPass1!', newPassword: 'NewPass2@' });
      expect(res.statusCode).toBe(401);
    });

    it('returns 400 when new password is too short', async () => {
      const token = await registerAndLogin();
      const res = await request(app)
        .post('/api/users/me/password')
        .set('Authorization', `Bearer ${token}`)
        .send({ currentPassword: PASS, newPassword: 'short' });
      expect(res.statusCode).toBe(400);
    });

    it('returns 400 when new password has no special character', async () => {
      const token = await registerAndLogin();
      const res = await request(app)
        .post('/api/users/me/password')
        .set('Authorization', `Bearer ${token}`)
        .send({ currentPassword: PASS, newPassword: 'NewPass123' });
      expect(res.statusCode).toBe(400);
    });

    it('returns 400 when currentPassword is missing', async () => {
      const token = await registerAndLogin();
      const res = await request(app)
        .post('/api/users/me/password')
        .set('Authorization', `Bearer ${token}`)
        .send({ newPassword: 'NewPass2@' });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('PATCH /api/users/me/email', () => {
    it('initiates email change and sends verification email', async () => {
      const token = await registerAndLogin();
      const res = await request(app)
        .patch('/api/users/me/email')
        .set('Authorization', `Bearer ${token}`)
        .send({ email: 'newemail@example.com', currentPassword: PASS });
      expect(res.statusCode).toBe(200);
      expect(res.body.message).toMatch(/verification/i);

      await new Promise((r) => setTimeout(r, 50));
      expect(emailService.sendEmailChangeVerificationEmail).toHaveBeenCalledWith(
        'newemail@example.com',
        expect.any(String),
        expect.stringContaining('emailChangeToken=')
      );
    });

    it('sets pendingEmail on user', async () => {
      const token = await registerAndLogin();
      await request(app)
        .patch('/api/users/me/email')
        .set('Authorization', `Bearer ${token}`)
        .send({ email: 'pending@example.com', currentPassword: PASS });
      const user = await User.findOne({ email: 'test@example.com' });
      expect(user.pendingEmail).toBe('pending@example.com');
    });

    it('returns 409 when new email is already taken', async () => {
      await request(app).post('/api/auth/register').send({ name: 'Other', email: 'taken@example.com', password: PASS });
      const token = await registerAndLogin();
      const res = await request(app)
        .patch('/api/users/me/email')
        .set('Authorization', `Bearer ${token}`)
        .send({ email: 'taken@example.com', currentPassword: PASS });
      expect(res.statusCode).toBe(409);
    });

    it('returns 400 when new email equals current email', async () => {
      const token = await registerAndLogin();
      const res = await request(app)
        .patch('/api/users/me/email')
        .set('Authorization', `Bearer ${token}`)
        .send({ email: 'test@example.com', currentPassword: PASS });
      expect(res.statusCode).toBe(400);
    });

    it('returns 401 when password is wrong', async () => {
      const token = await registerAndLogin();
      const res = await request(app)
        .patch('/api/users/me/email')
        .set('Authorization', `Bearer ${token}`)
        .send({ email: 'new@example.com', currentPassword: 'WrongPass1!' });
      expect(res.statusCode).toBe(401);
    });

    it('returns 400 for invalid email format', async () => {
      const token = await registerAndLogin();
      const res = await request(app)
        .patch('/api/users/me/email')
        .set('Authorization', `Bearer ${token}`)
        .send({ email: 'not-an-email', currentPassword: PASS });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('GET /api/users/me/email/verify', () => {
    it('applies pending email change with valid token', async () => {
      emailService.sendEmailChangeVerificationEmail.mockResolvedValue();
      const token = await registerAndLogin();

      await request(app)
        .patch('/api/users/me/email')
        .set('Authorization', `Bearer ${token}`)
        .send({ email: 'new@example.com', currentPassword: PASS });

      await new Promise((r) => setTimeout(r, 50));
      const verifyUrl = emailService.sendEmailChangeVerificationEmail.mock.calls[0][2];
      const verifyToken = new URL(verifyUrl).searchParams.get('emailChangeToken');

      const res = await request(app).get(`/api/users/me/email/verify?token=${verifyToken}`);
      expect(res.statusCode).toBe(200);
      expect(res.body.message).toMatch(/updated/i);

      const user = await User.findOne({ email: 'new@example.com' });
      expect(user).not.toBeNull();
      expect(user.pendingEmail).toBeNull();
    });

    it('returns 400 for invalid verification token', async () => {
      const res = await request(app).get('/api/users/me/email/verify?token=badtoken');
      expect(res.statusCode).toBe(400);
    });

    it('returns 400 when token is omitted', async () => {
      const res = await request(app).get('/api/users/me/email/verify');
      expect(res.statusCode).toBe(400);
    });
  });

  describe('DELETE /api/users/me', () => {
    it('soft-deletes the account — user record remains with status deleted', async () => {
      emailService.sendAccountRecoveryEmail.mockResolvedValue();
      const token = await registerAndLogin();
      const res = await request(app).delete('/api/users/me').set('Authorization', `Bearer ${token}`).send({ password: PASS });
      expect(res.statusCode).toBe(200);
      const user = await User.findOne({ email: 'test@example.com' });
      expect(user).not.toBeNull();
      expect(user.status).toBe('deleted');
      expect(user.deletedAt).toBeTruthy();
    });

    it('preserves user data during grace period', async () => {
      emailService.sendAccountRecoveryEmail.mockResolvedValue();
      const token = await registerAndLogin();
      const user = await User.findOne({ email: 'test@example.com' });

      await Task.create({ userId: user._id, title: 'My task' });
      await Contact.create({ userId: user._id, firstName: 'My contact' });
      await ShoppingList.create({ userId: user._id, name: 'My list' });

      await request(app).delete('/api/users/me').set('Authorization', `Bearer ${token}`).send({ password: PASS });

      expect(await Task.countDocuments({ userId: user._id })).toBe(1);
      expect(await Contact.countDocuments({ userId: user._id })).toBe(1);
      expect(await ShoppingList.countDocuments({ userId: user._id })).toBe(1);
    });

    it('sends a recovery email on soft-delete', async () => {
      emailService.sendAccountRecoveryEmail.mockResolvedValue();
      const token = await registerAndLogin();
      await request(app).delete('/api/users/me').set('Authorization', `Bearer ${token}`).send({ password: PASS });
      expect(emailService.sendAccountRecoveryEmail).toHaveBeenCalledWith(
        'test@example.com', expect.any(String), expect.any(String), expect.any(Number)
      );
    });

    it('returns 401 when password is wrong', async () => {
      const token = await registerAndLogin();
      const res = await request(app).delete('/api/users/me').set('Authorization', `Bearer ${token}`).send({ password: 'WrongPass1!' });
      expect(res.statusCode).toBe(401);
    });

    it('returns 400 when password is missing', async () => {
      const token = await registerAndLogin();
      const res = await request(app).delete('/api/users/me').set('Authorization', `Bearer ${token}`).send({});
      expect(res.statusCode).toBe(400);
    });
  });

  describe('POST /api/auth/restore', () => {
    beforeEach(() => {
      emailService.sendAccountRecoveryEmail.mockResolvedValue();
    });

    async function softDeleteUser() {
      const token = await registerAndLogin();
      await request(app).delete('/api/users/me').set('Authorization', `Bearer ${token}`).send({ password: PASS });
      return emailService.sendAccountRecoveryEmail.mock.calls[0][2]; // recoveryUrl
    }

    function tokenFromUrl(url) {
      return new URL(url).searchParams.get('recoveryToken');
    }

    it('restores account with a valid recovery token', async () => {
      const recoveryUrl = await softDeleteUser();
      const rawToken = tokenFromUrl(recoveryUrl);
      const res = await request(app).post('/api/auth/restore').send({ token: rawToken });
      expect(res.statusCode).toBe(200);
      expect(res.body.message).toContain('recovered');
      const user = await User.findOne({ email: 'test@example.com' });
      expect(user.status).toBe('active');
      expect(user.deletedAt).toBeNull();
    });

    it('returns 400 for an invalid token', async () => {
      await softDeleteUser();
      const res = await request(app).post('/api/auth/restore').send({ token: 'invalidtoken' });
      expect(res.statusCode).toBe(400);
    });

    it('returns 400 for an expired token', async () => {
      await softDeleteUser();
      await User.findOneAndUpdate({ email: 'test@example.com' }, { recoveryTokenExpiry: new Date(Date.now() - 1000) });
      const recoveryUrl = emailService.sendAccountRecoveryEmail.mock.calls[0][2];
      const rawToken = tokenFromUrl(recoveryUrl);
      const res = await request(app).post('/api/auth/restore').send({ token: rawToken });
      expect(res.statusCode).toBe(400);
    });

    it('returns 400 when token field is missing', async () => {
      const res = await request(app).post('/api/auth/restore').send({});
      expect(res.statusCode).toBe(400);
    });
  });

  describe('POST /api/auth/recover', () => {
    beforeEach(() => {
      emailService.sendAccountRecoveryEmail.mockResolvedValue();
    });

    it('sends a recovery email for a deleted account within grace period', async () => {
      const token = await registerAndLogin();
      await request(app).delete('/api/users/me').set('Authorization', `Bearer ${token}`).send({ password: PASS });
      emailService.sendAccountRecoveryEmail.mockClear();

      const res = await request(app).post('/api/auth/recover').send({ email: 'test@example.com' });
      expect(res.statusCode).toBe(200);
      expect(emailService.sendAccountRecoveryEmail).toHaveBeenCalledTimes(1);
    });

    it('returns 200 silently for a non-deleted account (no email sent)', async () => {
      await registerAndLogin();
      emailService.sendAccountRecoveryEmail.mockClear();
      const res = await request(app).post('/api/auth/recover').send({ email: 'test@example.com' });
      expect(res.statusCode).toBe(200);
      expect(emailService.sendAccountRecoveryEmail).not.toHaveBeenCalled();
    });

    it('returns 200 silently for an unknown email', async () => {
      const res = await request(app).post('/api/auth/recover').send({ email: 'nobody@example.com' });
      expect(res.statusCode).toBe(200);
      expect(emailService.sendAccountRecoveryEmail).not.toHaveBeenCalled();
    });
  });
});
