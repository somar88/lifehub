require('dotenv').config();
const app = require('./src/app');
const db = require('./src/config/db');
const logger = require('./src/config/logger');
const { startBot } = require('./src/bot/index');

const PORT = process.env.PORT || 3000;

async function start() {
  await db.connect();
  await startBot(app);
  app.listen(PORT, () => {
    logger.info(`LifeHub server running on port ${PORT}`);
  });
}

start().catch((err) => {
  logger.error('Failed to start server', { error: err.message });
  process.exit(1);
});
