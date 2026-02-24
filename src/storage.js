const fs = require('fs');
const path = require('path');
const config = require('./config');

const dataDir = path.join(process.cwd(), 'data');
const usersPath = path.join(dataDir, 'users.json');
const surveyPath = path.join(dataDir, 'survey_responses.json');
const matchPath = path.join(dataDir, 'matches.json');
const statePath = path.join(dataDir, 'job_state.json');
const outboxPath = path.join(dataDir, 'email_outbox.json');

function ensureDataFile(filePath, defaultValue) {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(defaultValue, null, 2));
  }
}

function readJson(filePath, defaultValue) {
  ensureDataFile(filePath, defaultValue);
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return defaultValue;
  }
}

function writeJson(filePath, value) {
  ensureDataFile(filePath, value);
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

const jsonBackend = {
  upsertUser(user) {
    const users = readJson(usersPath, []);
    const idx = users.findIndex((u) => u.netid === user.netid);
    const now = new Date().toISOString();
    const merged = { ...users[idx], ...user, updatedAt: now };
    if (idx >= 0) users[idx] = merged;
    else users.push({ ...merged, createdAt: now });
    writeJson(usersPath, users);
    return merged;
  },

  getUserByNetid(netid) {
    const users = readJson(usersPath, []);
    return users.find((u) => u.netid === netid) || null;
  },

  saveSurvey(response) {
    const rows = readJson(surveyPath, []);
    const idx = rows.findIndex((r) => r.netid === response.netid);
    const now = new Date().toISOString();
    const record = { ...rows[idx], ...response, updatedAt: now };
    if (idx >= 0) rows[idx] = record;
    else rows.push({ ...record, createdAt: now });
    writeJson(surveyPath, rows);
    return record;
  },

  getAllSurvey() {
    return readJson(surveyPath, []);
  },

  getAllUsers() {
    return readJson(usersPath, []);
  },

  saveMatches(payload) {
    const allMatches = readJson(matchPath, []);
    allMatches.push(payload);
    writeJson(matchPath, allMatches);
    return payload;
  },

  getAllMatches() {
    return readJson(matchPath, []);
  },

  getLatestMatches() {
    const allMatches = readJson(matchPath, []);
    return allMatches[allMatches.length - 1] || null;
  },

  getState() {
    return readJson(statePath, {});
  },

  setState(nextState) {
    writeJson(statePath, nextState);
    return nextState;
  },

  appendOutbox(entry) {
    const outbox = readJson(outboxPath, []);
    outbox.push(entry);
    writeJson(outboxPath, outbox);
  },

  getEmailOutbox() {
    return readJson(outboxPath, []);
  }
};

let pgPool = null;
let pgInitPromise = null;

function getPgPool() {
  if (pgPool) return pgPool;
  if (!config.database.postgresUrl) {
    throw new Error('DB_PROVIDER=postgres but DATABASE_URL/POSTGRES_URL is not configured.');
  }
  const { Pool } = require('pg');
  pgPool = new Pool({
    connectionString: config.database.postgresUrl,
    ssl: config.database.postgresSsl ? { rejectUnauthorized: false } : false
  });
  return pgPool;
}

async function ensurePgSchema() {
  if (pgInitPromise) return pgInitPromise;
  pgInitPromise = (async () => {
    const pool = getPgPool();
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        netid TEXT PRIMARY KEY,
        payload JSONB NOT NULL
      );
      CREATE TABLE IF NOT EXISTS survey_responses (
        netid TEXT PRIMARY KEY,
        payload JSONB NOT NULL
      );
      CREATE TABLE IF NOT EXISTS match_runs (
        id BIGSERIAL PRIMARY KEY,
        payload JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS app_state (
        state_key TEXT PRIMARY KEY,
        payload JSONB NOT NULL
      );
      CREATE TABLE IF NOT EXISTS email_outbox (
        id BIGSERIAL PRIMARY KEY,
        payload JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
  })().catch((err) => {
    pgInitPromise = null;
    throw err;
  });
  return pgInitPromise;
}

async function pgSelectOne(table, keyField, keyValue) {
  await ensurePgSchema();
  const pool = getPgPool();
  const { rows } = await pool.query(`SELECT payload FROM ${table} WHERE ${keyField} = $1`, [keyValue]);
  return rows[0]?.payload || null;
}

async function pgUpsertPayload(table, keyField, keyValue, payload) {
  await ensurePgSchema();
  const pool = getPgPool();
  await pool.query(
    `INSERT INTO ${table} (${keyField}, payload)
     VALUES ($1, $2::jsonb)
     ON CONFLICT (${keyField}) DO UPDATE SET payload = EXCLUDED.payload`,
    [keyValue, JSON.stringify(payload)]
  );
  return payload;
}

const pgBackend = {
  async upsertUser(user) {
    const existing = await pgSelectOne('users', 'netid', user.netid);
    const now = new Date().toISOString();
    const merged = existing ? { ...existing, ...user, updatedAt: now } : { ...user, createdAt: now, updatedAt: now };
    return pgUpsertPayload('users', 'netid', user.netid, merged);
  },

  getUserByNetid(netid) {
    return pgSelectOne('users', 'netid', netid);
  },

  async saveSurvey(response) {
    const existing = await pgSelectOne('survey_responses', 'netid', response.netid);
    const now = new Date().toISOString();
    const record = existing
      ? { ...existing, ...response, updatedAt: now }
      : { ...response, createdAt: now, updatedAt: now };
    return pgUpsertPayload('survey_responses', 'netid', response.netid, record);
  },

  async getAllSurvey() {
    await ensurePgSchema();
    const { rows } = await getPgPool().query('SELECT payload FROM survey_responses ORDER BY netid ASC');
    return rows.map((r) => r.payload);
  },

  async getAllUsers() {
    await ensurePgSchema();
    const { rows } = await getPgPool().query('SELECT payload FROM users ORDER BY netid ASC');
    return rows.map((r) => r.payload);
  },

  async saveMatches(payload) {
    await ensurePgSchema();
    await getPgPool().query('INSERT INTO match_runs (payload) VALUES ($1::jsonb)', [JSON.stringify(payload)]);
    return payload;
  },

  async getAllMatches() {
    await ensurePgSchema();
    const { rows } = await getPgPool().query('SELECT payload FROM match_runs ORDER BY id ASC');
    return rows.map((r) => r.payload);
  },

  async getLatestMatches() {
    await ensurePgSchema();
    const { rows } = await getPgPool().query('SELECT payload FROM match_runs ORDER BY id DESC LIMIT 1');
    return rows[0]?.payload || null;
  },

  async getState() {
    return (await pgSelectOne('app_state', 'state_key', 'global')) || {};
  },

  setState(nextState) {
    return pgUpsertPayload('app_state', 'state_key', 'global', nextState);
  },

  async appendOutbox(entry) {
    await ensurePgSchema();
    await getPgPool().query('INSERT INTO email_outbox (payload) VALUES ($1::jsonb)', [JSON.stringify(entry)]);
  },

  async getEmailOutbox() {
    await ensurePgSchema();
    const { rows } = await getPgPool().query('SELECT payload FROM email_outbox ORDER BY id ASC');
    return rows.map((r) => r.payload);
  }
};

const backend = config.database.provider === 'postgres' ? pgBackend : jsonBackend;

module.exports = {
  upsertUser: (...args) => backend.upsertUser(...args),
  getUserByNetid: (...args) => backend.getUserByNetid(...args),
  saveSurvey: (...args) => backend.saveSurvey(...args),
  getAllSurvey: (...args) => backend.getAllSurvey(...args),
  getAllUsers: (...args) => backend.getAllUsers(...args),
  saveMatches: (...args) => backend.saveMatches(...args),
  getAllMatches: (...args) => backend.getAllMatches(...args),
  getLatestMatches: (...args) => backend.getLatestMatches(...args),
  getState: (...args) => backend.getState(...args),
  setState: (...args) => backend.setState(...args),
  appendOutbox: (...args) => backend.appendOutbox(...args),
  getEmailOutbox: (...args) => backend.getEmailOutbox(...args)
};
