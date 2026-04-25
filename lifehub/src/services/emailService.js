const nodemailer = require('nodemailer');
const logger = require('../config/logger');

async function buildTransporter() {
  let provider, user, password, clientId, clientSecret, refreshToken;

  try {
    const configService = require('./configService');
    provider = await configService.get('email.provider');
    user = await configService.get('email.user');
    password = await configService.get('email.password');
    clientId = await configService.get('email.clientId');
    clientSecret = await configService.get('email.clientSecret');
    refreshToken = await configService.get('email.refreshToken');
  } catch {
    // DB not available — fall through to env vars
  }

  // Fall back to environment variables
  provider = provider || (process.env.GMAIL_APP_PASSWORD ? 'gmail-smtp' : null);
  user = user || process.env.GMAIL_USER;
  password = password || process.env.GMAIL_APP_PASSWORD;

  if (!provider || !user) {
    throw new Error('Email service is not configured. Run the provisioning wizard or set GMAIL_USER and GMAIL_APP_PASSWORD in .env');
  }

  if (provider === 'gmail-oauth2') {
    return nodemailer.createTransport({
      service: 'gmail',
      auth: {
        type: 'OAuth2',
        user,
        clientId,
        clientSecret,
        refreshToken,
      },
    });
  }

  // gmail-smtp (STARTTLS)
  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: { user, pass: password },
  });
}

async function sendWelcomeEmail(to, name) {
  const transporter = await buildTransporter();
  const user = (await require('./configService').get('email.user').catch(() => null)) || process.env.GMAIL_USER;
  await transporter.sendMail({
    from: `"LifeHub" <${user}>`,
    to,
    subject: 'Welcome to LifeHub!',
    html: `<h1>Welcome, ${name}!</h1><p>Your LifeHub account has been created successfully.</p>`,
  });
  logger.info('Welcome email sent', { to });
}

async function sendPasswordResetEmail(to, resetToken) {
  const transporter = await buildTransporter();
  const user = (await require('./configService').get('email.user').catch(() => null)) || process.env.GMAIL_USER;
  const resetUrl = `${process.env.APP_URL || 'http://localhost:3000'}/reset-password?token=${resetToken}`;
  await transporter.sendMail({
    from: `"LifeHub" <${user}>`,
    to,
    subject: 'LifeHub — Password Reset Request',
    html: `<p>Click <a href="${resetUrl}">here</a> to reset your password.</p><p>This link expires in 1 hour.</p>`,
  });
  logger.info('Password reset email sent', { to });
}

async function sendInviteEmail(to, name, inviteUrl) {
  const transporter = await buildTransporter();
  const user = (await require('./configService').get('email.user').catch(() => null)) || process.env.GMAIL_USER;
  await transporter.sendMail({
    from: `"LifeHub" <${user}>`,
    to,
    subject: "You're invited to LifeHub!",
    html: `<h1>Hello, ${name}!</h1>
<p>Your LifeHub account has been approved. Click the link below to set your password and complete your signup.</p>
<p><a href="${inviteUrl}">Complete your signup</a></p>
<p>This link expires in 7 days.</p>`,
  });
  logger.info('Invite email sent', { to });
}

module.exports = {
  buildTransporter,
  sendWelcomeEmail,
  sendPasswordResetEmail,
  sendInviteEmail,
  sendEmailChangeVerificationEmail,
  sendAccountRecoveryEmail,
  sendReminderEmail,
  sendTaskDueEmail,
  sendDailyDigestEmail,
};

async function sendAccountRecoveryEmail(to, name, recoveryUrl, graceDays) {
  const transporter = await buildTransporter();
  const from = (await require('./configService').get('email.user').catch(() => null)) || process.env.GMAIL_USER;
  await transporter.sendMail({
    from: `"LifeHub" <${from}>`,
    to,
    subject: 'LifeHub — Your account has been scheduled for deletion',
    html: `<h1>Hi ${name},</h1>
<p>Your LifeHub account has been scheduled for deletion. All your data will be permanently removed in <strong>${graceDays} days</strong>.</p>
<p>If this was a mistake, you can recover your account by clicking the link below. The link is valid for the entire grace period.</p>
<p><a href="${recoveryUrl}">Recover my account</a></p>
<p>If you did not request this, please use the recovery link above immediately to secure your account.</p>`,
  });
  logger.info('Account recovery email sent', { to });
}

async function sendEmailChangeVerificationEmail(to, name, verifyUrl) {
  const transporter = await buildTransporter();
  const from = (await require('./configService').get('email.user').catch(() => null)) || process.env.GMAIL_USER;
  await transporter.sendMail({
    from: `"LifeHub" <${from}>`,
    to,
    subject: 'LifeHub — Confirm your new email address',
    html: `<h1>Hi ${name},</h1>
<p>You requested to change your LifeHub email to <strong>${to}</strong>.</p>
<p><a href="${verifyUrl}">Confirm new email address</a></p>
<p>This link expires in 24 hours. If you did not request this change, you can safely ignore this email.</p>`,
  });
  logger.info('Email change verification sent', { to });
}

async function sendReminderEmail(user, event, minutesUntil) {
  const transporter = await buildTransporter();
  const from = (await require('./configService').get('email.user').catch(() => null)) || process.env.GMAIL_USER;
  await transporter.sendMail({
    from: `"LifeHub" <${from}>`,
    to: user.email,
    subject: `Reminder: ${event.title}`,
    text: `Hi ${user.name},\n\nReminder: "${event.title}" starts in ${minutesUntil} minute(s).\n\nLifeHub`,
  });
  logger.info('Reminder email sent', { to: user.email, eventId: event._id });
}

async function sendTaskDueEmail(user, task) {
  const transporter = await buildTransporter();
  const from = (await require('./configService').get('email.user').catch(() => null)) || process.env.GMAIL_USER;
  await transporter.sendMail({
    from: `"LifeHub" <${from}>`,
    to: user.email,
    subject: `Task due today: ${task.title}`,
    text: `Hi ${user.name},\n\nYour task "${task.title}" is due today.\n\nLifeHub`,
  });
  logger.info('Task due email sent', { to: user.email, taskId: task._id });
}

async function sendDailyDigestEmail(user, { taskCount, events }) {
  const transporter = await buildTransporter();
  const from = (await require('./configService').get('email.user').catch(() => null)) || process.env.GMAIL_USER;
  const eventLines = events.length
    ? events.map(e => `  • ${e.title} at ${new Date(e.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`).join('\n')
    : '  None scheduled';
  await transporter.sendMail({
    from: `"LifeHub" <${from}>`,
    to: user.email,
    subject: 'Your LifeHub Daily Digest',
    text: `Good morning ${user.name},\n\nOpen tasks: ${taskCount}\n\nToday's events:\n${eventLines}\n\nLifeHub`,
  });
  logger.info('Daily digest email sent', { to: user.email });
}
