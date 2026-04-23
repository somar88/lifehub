#!/usr/bin/env node
'use strict';

require('dotenv').config();

const inquirer = require('inquirer');
const chalk = require('chalk');
const ora = require('ora');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');

// ── Banner ────────────────────────────────────────────────────────────────────

function printBanner() {
  console.clear();
  console.log(chalk.blue('╔══════════════════════════════════════════╗'));
  console.log(chalk.blue('║') + chalk.bold.white('        LifeHub  ·  Server Setup          ') + chalk.blue('║'));
  console.log(chalk.blue('║') + chalk.gray('        First-time provisioning wizard    ') + chalk.blue('║'));
  console.log(chalk.blue('╚══════════════════════════════════════════╝'));
  console.log();
}

function step(n, total, label) {
  console.log(chalk.blue(`\n  Step ${n}/${total}  `) + chalk.bold(label));
  console.log(chalk.gray('  ' + '─'.repeat(40)));
}

function success(msg) { console.log(chalk.green('  ✔  ') + msg); }
function warn(msg)    { console.log(chalk.yellow('  ⚠  ') + msg); }
function info(msg)    { console.log(chalk.gray('  ·  ') + msg); }

// ── Step 1: Database ──────────────────────────────────────────────────────────

async function connectDatabase() {
  step(1, 5, 'Database Connection');

  const { uri } = await inquirer.prompt([{
    type: 'input',
    name: 'uri',
    message: 'MongoDB URI:',
    default: process.env.MONGODB_URI || 'mongodb://localhost:27017/lifehub',
  }]);

  const spinner = ora('Connecting to MongoDB...').start();
  try {
    mongoose.set('strictQuery', true);
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
    spinner.succeed(chalk.green('Connected to MongoDB'));

    // Update .env if URI changed
    if (uri !== process.env.MONGODB_URI) {
      warn('Remember to update MONGODB_URI in your .env file.');
    }
    return uri;
  } catch (err) {
    spinner.fail(chalk.red('Connection failed: ') + err.message);
    process.exit(1);
  }
}

// ── Step 2: Admin User ────────────────────────────────────────────────────────

async function setupAdminUser() {
  step(2, 5, 'Admin User');

  const User = require('../src/models/User');
  const existing = await User.findOne({ role: 'admin' });

  if (existing) {
    warn(`Admin user already exists: ${chalk.cyan(existing.email)}`);
    const { overwrite } = await inquirer.prompt([{
      type: 'confirm',
      name: 'overwrite',
      message: 'Create another admin user?',
      default: false,
    }]);
    if (!overwrite) {
      success('Using existing admin user.');
      return;
    }
  }

  const answers = await inquirer.prompt([
    { type: 'input',    name: 'name',     message: 'Full name:',         validate: v => v.trim() ? true : 'Name is required' },
    { type: 'input',    name: 'email',    message: 'Email address:',     validate: v => /\S+@\S+\.\S+/.test(v) ? true : 'Valid email required' },
    { type: 'password', name: 'password', message: 'Password (min 8):',  validate: v => v.length >= 8 ? true : 'At least 8 characters' },
    { type: 'password', name: 'confirm',  message: 'Confirm password:',  validate: (v, a) => v === a.password ? true : 'Passwords do not match' },
  ]);

  const spinner = ora('Creating admin user...').start();
  try {
    const passwordHash = await bcrypt.hash(answers.password, 12);
    await User.findOneAndUpdate(
      { email: answers.email.toLowerCase() },
      { name: answers.name, email: answers.email.toLowerCase(), passwordHash, role: 'admin', isActive: true },
      { upsert: true, new: true }
    );
    spinner.succeed(chalk.green(`Admin user created: ${chalk.cyan(answers.email)}`));
  } catch (err) {
    spinner.fail(chalk.red('Failed: ') + err.message);
    process.exit(1);
  }
}

// ── Step 3: Email Service ─────────────────────────────────────────────────────

async function setupEmail() {
  step(3, 5, 'Email Service');

  const configService = require('../src/services/configService');

  const { provider } = await inquirer.prompt([{
    type: 'list',
    name: 'provider',
    message: 'Email provider:',
    choices: [
      { name: 'Gmail SMTP  (App Password — quick setup)', value: 'gmail-smtp' },
      { name: 'Gmail OAuth2 (recommended for production)', value: 'gmail-oauth2' },
      { name: 'Skip for now',                              value: 'skip' },
    ],
  }]);

  if (provider === 'skip') {
    warn('Email service skipped. Configure it later in the admin dashboard.');
    return;
  }

  const { emailUser } = await inquirer.prompt([{
    type: 'input',
    name: 'emailUser',
    message: 'Gmail address (the app\'s own account):',
    validate: v => /\S+@gmail\.com$/.test(v) ? true : 'Must be a @gmail.com address',
  }]);

  const spinner = ora('Saving email configuration...').start();
  try {
    await configService.set('email.provider', provider, 'email');
    await configService.set('email.user', emailUser, 'email');

    spinner.stop();

    if (provider === 'gmail-smtp') {
      info('Generate an App Password at: https://myaccount.google.com/apppasswords');
      info('You need 2-Step Verification enabled on the Gmail account.');
      const { appPassword } = await inquirer.prompt([{
        type: 'password',
        name: 'appPassword',
        message: 'Gmail App Password (16 chars, spaces optional):',
        validate: v => v.replace(/\s/g, '').length === 16 ? true : 'App Password must be 16 characters',
        filter: v => v.replace(/\s/g, ''),
      }]);
      const s2 = ora('Saving...').start();
      await configService.set('email.password', appPassword, 'email');
      s2.succeed(chalk.green('Gmail SMTP configured'));
    } else {
      info('Create OAuth2 credentials at: https://console.cloud.google.com/');
      info('Enable the Gmail API, create an OAuth2 client, and generate a refresh token.');
      const oauth = await inquirer.prompt([
        { type: 'input',    name: 'clientId',     message: 'Client ID:',      validate: v => v.trim() ? true : 'Required' },
        { type: 'password', name: 'clientSecret', message: 'Client Secret:',  validate: v => v.trim() ? true : 'Required' },
        { type: 'password', name: 'refreshToken', message: 'Refresh Token:',  validate: v => v.trim() ? true : 'Required' },
      ]);
      const s2 = ora('Saving...').start();
      await configService.set('email.clientId',     oauth.clientId,     'email');
      await configService.set('email.clientSecret', oauth.clientSecret, 'email');
      await configService.set('email.refreshToken', oauth.refreshToken, 'email');
      s2.succeed(chalk.green('Gmail OAuth2 configured'));
    }
  } catch (err) {
    spinner.fail(chalk.red('Failed: ') + err.message);
  }
}

// ── Step 4: Test Email ────────────────────────────────────────────────────────

async function testEmail() {
  step(4, 5, 'Send Test Email');

  const { sendTest } = await inquirer.prompt([{
    type: 'confirm',
    name: 'sendTest',
    message: 'Send a test email to the admin address?',
    default: true,
  }]);

  if (!sendTest) {
    info('Skipped.');
    return;
  }

  const User = require('../src/models/User');
  const emailService = require('../src/services/emailService');
  const admin = await User.findOne({ role: 'admin' }).sort({ createdAt: 1 });

  if (!admin) {
    warn('No admin user found — skipping test email.');
    return;
  }

  const spinner = ora(`Sending test email to ${admin.email}...`).start();
  try {
    await emailService.sendWelcomeEmail(admin.email, admin.name);
    spinner.succeed(chalk.green(`Test email sent to ${chalk.cyan(admin.email)}`));
  } catch (err) {
    spinner.fail(chalk.red('Failed: ') + err.message);
    warn('You can retry from the admin dashboard at /admin');
  }
}

// ── Step 5: Summary ───────────────────────────────────────────────────────────

async function printSummary() {
  step(5, 5, 'Setup Complete');

  const User = require('../src/models/User');
  const configService = require('../src/services/configService');

  const adminUser = await User.findOne({ role: 'admin' }).sort({ createdAt: 1 });
  const emailProvider = await configService.get('email.provider');
  const emailUser = await configService.get('email.user');

  console.log();
  console.log(chalk.blue('  ┌──────────────────────────────────────────┐'));
  console.log(chalk.blue('  │') + chalk.bold('  Configuration Summary                  ') + chalk.blue('│'));
  console.log(chalk.blue('  ├──────────────────────────────────────────┤'));
  console.log(chalk.blue('  │') + `  Admin user   ${chalk.cyan((adminUser?.email || '—').padEnd(26))}` + chalk.blue('│'));
  console.log(chalk.blue('  │') + `  Email        ${chalk.cyan((emailProvider || 'not configured').padEnd(26))}` + chalk.blue('│'));
  console.log(chalk.blue('  │') + `  From address ${chalk.cyan((emailUser || '—').padEnd(26))}` + chalk.blue('│'));
  console.log(chalk.blue('  └──────────────────────────────────────────┘'));
  console.log();
  success('LifeHub is ready to run.');
  console.log();
  info('Start the server:    ' + chalk.cyan('npm start'));
  info('Development mode:    ' + chalk.cyan('npm run dev'));
  info('Admin dashboard:     ' + chalk.cyan('http://localhost:3000/admin'));
  console.log();
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  printBanner();
  await connectDatabase();
  await setupAdminUser();
  await setupEmail();
  await testEmail();
  await printSummary();
  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error(chalk.red('\nUnexpected error: ') + err.message);
  process.exit(1);
});
