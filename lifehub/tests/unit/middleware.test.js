process.env.JWT_SECRET = 'test-secret-key';

// Hoisted mocks — apply to all requires in this file
jest.mock('jsonwebtoken');
jest.mock('../../src/middleware/tokenBlacklist');

const jwt = require('jsonwebtoken');
const { isRevoked } = require('../../src/middleware/tokenBlacklist');

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

function mockReq(overrides = {}) {
  return { headers: {}, ...overrides };
}

// ── tokenBlacklist ────────────────────────────────────────────────────────────
// Use jest.requireActual so these tests exercise the real Set-based implementation.
// Each test uses a unique JTI to avoid cross-test state pollution.

describe('tokenBlacklist', () => {
  const blacklist = jest.requireActual('../../src/middleware/tokenBlacklist');

  it('isRevoked returns false for an unknown JTI', () => {
    expect(blacklist.isRevoked('tb-unknown-001')).toBe(false);
  });

  it('revoke adds the JTI; isRevoked then returns true', () => {
    blacklist.revoke('tb-revoked-001');
    expect(blacklist.isRevoked('tb-revoked-001')).toBe(true);
  });

  it('revoking one JTI does not affect other JTIs', () => {
    blacklist.revoke('tb-x-001');
    expect(blacklist.isRevoked('tb-y-001')).toBe(false);
  });
});

// ── auth middleware ───────────────────────────────────────────────────────────
// auth.js internally requires jwt (mocked) and tokenBlacklist (mocked),
// so we can control both via the hoisted jest.mock calls above.

describe('auth middleware', () => {
  const auth = require('../../src/middleware/auth');

  beforeEach(() => {
    jwt.verify.mockReset();
    isRevoked.mockReset();
    isRevoked.mockReturnValue(false);
  });

  it('returns 401 when Authorization header is absent', () => {
    const req = mockReq();
    const res = mockRes();
    const next = jest.fn();

    auth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'No token provided' });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when Authorization header does not start with Bearer', () => {
    const req = mockReq({ headers: { authorization: 'Basic abc123' } });
    const res = mockRes();
    const next = jest.fn();

    auth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when JWT verification throws', () => {
    jwt.verify.mockImplementation(() => { throw new Error('invalid signature'); });
    const req = mockReq({ headers: { authorization: 'Bearer bad.token' } });
    const res = mockRes();
    const next = jest.fn();

    auth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid or expired token' });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when the token JTI is revoked', () => {
    jwt.verify.mockReturnValue({ userId: 'u1', jti: 'revoked-jti' });
    isRevoked.mockReturnValue(true);
    const req = mockReq({ headers: { authorization: 'Bearer valid.token' } });
    const res = mockRes();
    const next = jest.fn();

    auth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Token has been revoked' });
    expect(next).not.toHaveBeenCalled();
  });

  it('sets req.user and calls next() for a valid non-revoked token', () => {
    const decoded = { userId: 'u1', role: 'user' };
    jwt.verify.mockReturnValue(decoded);
    const req = mockReq({ headers: { authorization: 'Bearer valid.token' } });
    const res = mockRes();
    const next = jest.fn();

    auth(req, res, next);

    expect(req.user).toEqual(decoded);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});

// ── requireAdmin middleware ───────────────────────────────────────────────────
// requireAdmin calls auth internally. Since jwt and tokenBlacklist are already
// mocked at the top level, we just need jwt.verify to return the right role.

describe('requireAdmin middleware', () => {
  const requireAdmin = require('../../src/middleware/requireAdmin');

  beforeEach(() => {
    jwt.verify.mockReset();
    isRevoked.mockReset();
    isRevoked.mockReturnValue(false);
  });

  it('calls next() when the authenticated user has role admin', () => {
    jwt.verify.mockReturnValue({ userId: 'u1', role: 'admin' });
    const req = mockReq({ headers: { authorization: 'Bearer valid.token' } });
    const res = mockRes();
    const next = jest.fn();

    requireAdmin(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('returns 403 when the authenticated user has role user', () => {
    jwt.verify.mockReturnValue({ userId: 'u1', role: 'user' });
    const req = mockReq({ headers: { authorization: 'Bearer valid.token' } });
    const res = mockRes();
    const next = jest.fn();

    requireAdmin(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'Admin access required' });
    expect(next).not.toHaveBeenCalled();
  });
});

// ── errorHandler middleware ───────────────────────────────────────────────────

describe('errorHandler middleware', () => {
  const errorHandler = require('../../src/middleware/errorHandler');
  const req = mockReq({ originalUrl: '/api/test' });
  const next = jest.fn();

  it('returns 400 for a Mongoose ValidationError', () => {
    const err = Object.assign(new Error('Validation failed'), { name: 'ValidationError' });
    const res = mockRes();

    errorHandler(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Validation failed' });
  });

  it('returns 409 for a MongoDB duplicate-key error (code 11000)', () => {
    const err = Object.assign(new Error('dup'), { code: 11000, keyValue: { email: 'x@x.com' } });
    const res = mockRes();

    errorHandler(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({ error: 'email already in use' });
  });

  it('uses err.status when explicitly set', () => {
    const err = Object.assign(new Error('not found'), { status: 404 });
    const res = mockRes();

    errorHandler(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'not found' });
  });

  it('defaults to 500 for unrecognised errors', () => {
    const err = new Error('something broke');
    const res = mockRes();

    errorHandler(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'something broke' });
  });
});
