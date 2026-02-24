const fs = require('fs');
const path = require('path');

function loadEnvFile() {
  const envPath = path.join(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) return;

  const raw = fs.readFileSync(envPath, 'utf8');
  raw.split(/\r?\n/).forEach((line) => {
    if (!line || line.startsWith('#')) return;
    const idx = line.indexOf('=');
    if (idx === -1) return;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  });
}

loadEnvFile();

module.exports = {
  port: Number(process.env.PORT || 3000),
  appBaseUrl: process.env.APP_BASE_URL || 'http://localhost:3000',
  sessionSecret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  dukeOAuth: {
    clientId: process.env.DUKE_OAUTH_CLIENT_ID || '',
    clientSecret: process.env.DUKE_OAUTH_CLIENT_SECRET || '',
    authUrl: process.env.DUKE_OAUTH_AUTH_URL || '',
    tokenUrl: process.env.DUKE_OAUTH_TOKEN_URL || '',
    userInfoUrl: process.env.DUKE_OAUTH_USERINFO_URL || '',
    redirectUri: process.env.DUKE_OAUTH_REDIRECT_URI || ''
  },
  schedule: {
    minute: Number(process.env.MATCH_CRON_MINUTE || 0),
    hour: Number(process.env.MATCH_CRON_HOUR || 2)
  },
  email: {
    provider: process.env.EMAIL_PROVIDER || 'resend',
    apiKey: process.env.EMAIL_API_KEY || '',
    from: process.env.EMAIL_FROM || 'linkdku@duke.edu',
    host: process.env.EMAIL_API_HOST || 'api.resend.com',
    path: process.env.EMAIL_API_PATH || '/emails',
    testTo: process.env.EMAIL_TEST_TO || '',
    smtpHost: process.env.SMTP_HOST || '',
    smtpPort: Number(process.env.SMTP_PORT || 465),
    smtpSecure: (process.env.SMTP_SECURE || 'true') === 'true',
    smtpUser: process.env.SMTP_USER || '',
    smtpPass: process.env.SMTP_PASS || ''
  },
  database: {
    provider: process.env.DB_PROVIDER || 'json',
    sqlitePath: process.env.DB_SQLITE_PATH || './data/linkdku.sqlite',
    postgresUrl: process.env.DATABASE_URL || process.env.POSTGRES_URL || '',
    postgresSsl: (process.env.POSTGRES_SSL || 'true') === 'true'
  },
  adminAuth: {
    username: process.env.ADMIN_USERNAME || 'yh405',
    password: process.env.ADMIN_PASSWORD || '123456'
    
  }
};
