'use strict';
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../../src/models/User');

const DEFAULT_PASSWORD = 'TestPass1!';

async function createUser(overrides = {}) {
  const passwordHash = await bcrypt.hash(overrides.password || DEFAULT_PASSWORD, 4);
  return User.create({
    name: 'Test User',
    email: `user-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
    passwordHash,
    status: 'active',
    isActive: true,
    role: 'user',
    ...overrides,
    password: undefined,
  });
}

async function createAdmin(overrides = {}) {
  return createUser({ name: 'Admin User', role: 'admin', ...overrides });
}

function tokenFor(user) {
  return jwt.sign(
    { userId: user._id, role: user.role, jti: crypto.randomUUID() },
    process.env.JWT_SECRET || 'test-secret',
    { expiresIn: '1h' }
  );
}

function authHeader(user) {
  return { Authorization: `Bearer ${tokenFor(user)}` };
}

module.exports = { createUser, createAdmin, tokenFor, authHeader, DEFAULT_PASSWORD };
