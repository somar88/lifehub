const { MongoMemoryServer } = require('mongodb-memory-server');
const db = require('../../src/config/db');

let mongod;

async function connect() {
  mongod = await MongoMemoryServer.create();
  await db.connect(mongod.getUri(), { retries: 0 });
}

async function disconnect() {
  await db.disconnect();
  await mongod.stop();
}

module.exports = { connect, disconnect };
