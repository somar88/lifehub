const mongoose = require('mongoose');
const logger = require('./logger');

const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 5000;

mongoose.connection.on('error', (err) => {
  logger.error('MongoDB connection error', { error: err.message });
});

mongoose.connection.on('disconnected', () => {
  logger.warn('MongoDB disconnected');
});

async function connect(uri, options = {}) {
  const { retries = MAX_RETRIES, retryDelay = RETRY_DELAY_MS } = options;
  const connectionUri = uri || process.env.MONGODB_URI;

  mongoose.set('strictQuery', true);

  try {
    await mongoose.connect(connectionUri, {
      serverSelectionTimeoutMS: options.serverSelectionTimeoutMS ?? 5000,
      connectTimeoutMS: options.connectTimeoutMS ?? 5000,
    });
    logger.info('MongoDB connected', { host: mongoose.connection.host });
  } catch (err) {
    if (retries > 0) {
      logger.warn(`MongoDB connection failed, retrying in ${retryDelay / 1000}s... (${retries} retries left)`, {
        error: err.message,
      });
      await new Promise((res) => setTimeout(res, retryDelay));
      return connect(uri, { retries: retries - 1, retryDelay });
    }
    logger.error('MongoDB connection failed after all retries', { error: err.message });
    throw err;
  }
}

async function disconnect() {
  await mongoose.disconnect();
  logger.info('MongoDB disconnected');
}

module.exports = { connect, disconnect };
