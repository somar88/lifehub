#!/usr/bin/env node
'use strict';
/**
 * Non-interactive admin-user creation for CI / Docker bootstrap.
 *
 * Usage:
 *   node scripts/create-admin.js --email admin@example.com --password secret123 [--name "Admin"]
 *
 * All three flags are required (name defaults to "Admin" if omitted).
 * If a user with the same email already exists it is promoted to admin and
 * its password is updated.
 */

require('dotenv').config();

const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

function arg(flag) {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? process.argv[i + 1] : null;
}

const email    = arg('--email');
const password = arg('--password');
const name     = arg('--name') || 'Admin';

if (!email || !password) {
  console.error('Usage: node scripts/create-admin.js --email <email> --password <password> [--name <name>]');
  process.exit(1);
}
if (password.length < 8) {
  console.error('Password must be at least 8 characters.');
  process.exit(1);
}

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/lifehub';

async function run() {
  await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 5000 });

  const User = require('../src/models/User');
  const passwordHash = await bcrypt.hash(password, 12);

  const user = await User.findOneAndUpdate(
    { email: email.toLowerCase() },
    { name, email: email.toLowerCase(), passwordHash, role: 'admin', isActive: true, status: 'active' },
    { upsert: true, new: true }
  );

  console.log(`Admin user ready: ${user.email} (id: ${user._id})`);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
