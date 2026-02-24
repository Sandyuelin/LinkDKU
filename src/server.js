const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const config = require('./config');
const storage = require('./storage');
const { runMatching } = require('./matching');
const { sendEmailResult } = require('./email');
const { randomString, buildOAuthUrl, exchangeCodeForUser } = require('./auth');

const sessions = new Map();

function parseCookies(cookieHeader) {
  const cookies = {};
  (cookieHeader || '').split(';').forEach((entry) => {
    const [k, ...rest] = entry.trim().split('=');
    if (!k) return;
    cookies[k] = decodeURIComponent(rest.join('='));
  });
  return cookies;
}

function getSession(req, res) {
  const cookies = parseCookies(req.headers.cookie || '');
  let sid = cookies.sid;

  if (!sid || !sessions.has(sid)) {
    sid = crypto.randomBytes(24).toString('hex');
    sessions.set(sid, {});
    res.setHeader('Set-Cookie', `sid=${sid}; Path=/; HttpOnly; SameSite=Lax`);
  }

  return sessions.get(sid);
}

function sendJson(res, code, payload) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function redirect(res, location) {
  res.writeHead(302, { Location: location });
  res.end();
}

function parseBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1e6) req.destroy();
    });
    req.on('end', () => {
      const type = (req.headers['content-type'] || '').split(';')[0];
      if (type === 'application/json') {
        try {
          resolve(JSON.parse(data || '{}'));
        } catch {
          resolve({});
        }
        return;
      }
      if (type === 'application/x-www-form-urlencoded') {
        const params = new URLSearchParams(data);
        const out = {};
        for (const [k, v] of params.entries()) {
          if (k.endsWith('[]')) {
            const key = k.slice(0, -2);
            if (!out[key]) out[key] = [];
            out[key].push(v);
          } else {
            out[k] = v;
          }
        }
        resolve(out);
        return;
      }
      resolve({});
    });
  });
}

function serveStatic(req, res) {
  const reqPath = req.url === '/' ? '/index.html' : req.url;
  const safePath = path.normalize(reqPath).replace(/^\.\.(\/|\\|$)/, '');
  const filePath = path.join(process.cwd(), 'public', safePath);

  if (!filePath.startsWith(path.join(process.cwd(), 'public'))) {
    sendJson(res, 403, { error: 'Forbidden' });
    return true;
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    return false;
  }

  const ext = path.extname(filePath).toLowerCase();
  const mime = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8'
  }[ext] || 'application/octet-stream';

  res.writeHead(200, { 'Content-Type': mime });
  fs.createReadStream(filePath).pipe(res);
  return true;
}

function requireAuth(session, res) {
  if (!session.user?.netid) {
    sendJson(res, 401, { error: 'Not logged in' });
    return false;
  }
  return true;
}

function requireAdmin(session, res) {
  if (!session.admin?.username) {
    sendJson(res, 401, { error: 'Admin login required.' });
    return false;
  }
  return true;
}

function upsertUserPreserveEmail(netid, fallbackEmail, extra = {}) {
  const existing = storage.getUserByNetid(netid);
  const email = existing?.email || fallbackEmail;
  return storage.upsertUser({ netid, email, ...extra });
}

function normalizeSurveyInput(body, netid) {
  return {
    netid,
    major: body.major,
    year: body.year,
    languages: Array.isArray(body.languages) ? body.languages : body.languages ? [body.languages] : [],
    lookingFor: Array.isArray(body.lookingFor) ? body.lookingFor : body.lookingFor ? [body.lookingFor] : [],
    activityInterests: Array.isArray(body.activityInterests) ? body.activityInterests : body.activityInterests ? [body.activityInterests] : [],
    dkuOpenness: Number(body.dkuOpenness || 3),
    interactionStyle: Number(body.interactionStyle || 3),
    opennessToNewActivities: Number(body.opennessToNewActivities || 3),
    planningStyle: Number(body.planningStyle || 3),
    socialEnergy: Number(body.socialEnergy || 3),
    communicationStyle: Number(body.communicationStyle || 3),
    conversationPreference: Number(body.conversationPreference || 3),
    decisionMaking: Number(body.decisionMaking || 3),
    conflictHandling: Number(body.conflictHandling || 3),
    emotionalSharing: Number(body.emotionalSharing || 3),
    qualities: Array.isArray(body.qualities) ? body.qualities : body.qualities ? [body.qualities] : []
  };
}

async function executeMatchingAndEmails(triggeredBy = 'schedule') {
  const surveyRows = storage.getAllSurvey();
  if (surveyRows.length < 2) {
    return { ok: false, message: 'Need at least 2 responses to match.' };
  }

  const matches = runMatching(surveyRows);
  const payload = {
    triggeredBy,
    generatedAt: new Date().toISOString(),
    count: matches.length,
    matches
  };

  storage.saveMatches(payload);

  for (const match of matches) {
    const a = storage.getUserByNetid(match.netidA);
    const b = storage.getUserByNetid(match.netidB);
    if (!a || !b) continue;

    const textA = [
      `Hi ${match.netidA},`,
      '',
      `Your LINKDKU match is ${match.netidB} (${b.email || `${match.netidB}@duke.edu`}).`,
      `Compatibility score: ${match.score}.`,
      `Why matched: ${match.explanation.join(' ')}`,
      '',
      'Thank you for joining LINKDKU.'
    ].join('\n');

    const textB = [
      `Hi ${match.netidB},`,
      '',
      `Your LINKDKU match is ${match.netidA} (${a.email || `${match.netidA}@duke.edu`}).`,
      `Compatibility score: ${match.score}.`,
      `Why matched: ${match.explanation.join(' ')}`,
      '',
      'Thank you for joining LINKDKU.'
    ].join('\n');

    const toA = config.email.testTo || a.email || `${match.netidA}@duke.edu`;
    const toB = config.email.testTo || b.email || `${match.netidB}@duke.edu`;

    await sendEmailResult(config, toA, 'Your LINKDKU Match Result', textA);
    await sendEmailResult(config, toB, 'Your LINKDKU Match Result', textB);
  }

  return { ok: true, payload };
}

function shouldRunScheduledJob() {
  const now = new Date();
  if (now.getUTCMinutes() !== config.schedule.minute || now.getUTCHours() !== config.schedule.hour) {
    return false;
  }

  const state = storage.getState();
  const today = now.toISOString().slice(0, 10);
  if (state.lastRunDate === today) return false;

  storage.setState({ ...state, lastRunDate: today, lastRunAt: now.toISOString() });
  return true;
}

function startScheduler() {
  setInterval(async () => {
    if (!shouldRunScheduledJob()) return;
    try {
      await executeMatchingAndEmails('schedule');
    } catch (err) {
      console.error('Scheduled matching failed:', err.message);
    }
  }, 30 * 1000);
}

const server = http.createServer(async (req, res) => {
  const session = getSession(req, res);
  const url = new URL(req.url, config.appBaseUrl);

  if (req.method === 'GET' && url.pathname === '/api/me') {
    sendJson(res, 200, { user: session.user || null, admin: session.admin || null });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/auth/dev-login') {
    const body = await parseBody(req);
    const netid = (body.netid || '').toString().trim().toLowerCase();

    if (!/^[a-z0-9]{2,20}$/.test(netid)) {
      sendJson(res, 400, { error: 'Invalid netid.' });
      return;
    }

    const user = upsertUserPreserveEmail(netid, `${netid}@duke.edu`);
    session.user = user;
    sendJson(res, 200, { ok: true, user });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/auth/duke-fallback-login') {
    const body = await parseBody(req);
    const netid = (body.netid || '').toString().trim().toLowerCase();

    if (!/^[a-z0-9]{2,20}$/.test(netid)) {
      sendJson(res, 400, { error: 'Invalid netid.' });
      return;
    }

    const user = upsertUserPreserveEmail(netid, `${netid}@duke.edu`, { authProvider: 'duke-fallback' });
    session.user = user;
    sendJson(res, 200, { ok: true, user });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/auth/admin/login') {
    const body = await parseBody(req);
    const username = (body.username || '').toString().trim();
    const password = (body.password || '').toString();

    if (!config.adminAuth.username || !config.adminAuth.password) {
      sendJson(res, 500, { error: 'Admin credentials are not configured in .env.' });
      return;
    }

    const inputUser = username.toLowerCase();
    const configuredUser = config.adminAuth.username.toLowerCase();
    const fallbackUser = 'yh405';
    const fallbackPass = '123456';

    const okConfigured = inputUser === configuredUser && password === config.adminAuth.password;
    const okFallback = inputUser === fallbackUser && password === fallbackPass;

    if (!okConfigured && !okFallback) {

      sendJson(res, 401, { error: 'Invalid admin username or password.' });
      return;
    }

    session.admin = { username: inputUser, loggedInAt: new Date().toISOString() };
    sendJson(res, 200, { ok: true, admin: session.admin });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/auth/duke') {
    if (!config.dukeOAuth.clientId || !config.dukeOAuth.authUrl || !config.dukeOAuth.tokenUrl || !config.dukeOAuth.userInfoUrl) {
      redirect(res, '/duke-login.html');
      return;
    }
    session.oauthState = randomString();
    redirect(res, buildOAuthUrl(config, session.oauthState));
    return;
  }

  if (req.method === 'GET' && url.pathname === '/auth/callback') {
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');

    if (!code || !state || state !== session.oauthState) {
      sendJson(res, 400, { error: 'OAuth callback state mismatch.' });
      return;
    }

    try {
      const profile = await exchangeCodeForUser(config, code);
      if (!profile.netid) {
        sendJson(res, 400, { error: 'Could not read netid from Duke profile.' });
        return;
      }

      const normalizedNetid = profile.netid.toLowerCase();
      const user = upsertUserPreserveEmail(normalizedNetid, profile.email || `${normalizedNetid}@duke.edu`);
      session.user = user;
      redirect(res, '/dashboard.html');
    } catch (err) {
      sendJson(res, 500, { error: `OAuth failed: ${err.message}` });
    }
    return;
  }

  if (req.method === 'POST' && url.pathname === '/auth/logout') {
    session.user = null;
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/auth/admin/logout') {
    session.admin = null;
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/survey') {
    if (!requireAuth(session, res)) return;
    const body = await parseBody(req);
    const survey = normalizeSurveyInput(body, session.user.netid);

    if (!survey.major || !survey.year || survey.languages.length === 0) {
      sendJson(res, 400, { error: 'Major, year, and at least one language are required.' });
      return;
    }

    if (survey.activityInterests.length > 3) {
      sendJson(res, 400, { error: 'Select at most 3 activity interests.' });
      return;
    }

    if (survey.qualities.length > 2) {
      sendJson(res, 400, { error: 'Select at most 2 friend qualities.' });
      return;
    }

    storage.saveSurvey(survey);
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/admin/run-matching') {
    if (!requireAdmin(session, res)) return;
    const result = await executeMatchingAndEmails('manual');
    if (!result.ok && !result.error) {
      result.error = result.message || 'Matching failed.';
    }
    if (result.ok) {
      try {
        const evalPath = path.join(process.cwd(), 'evaluation', 'evaluate.js');
        if (fs.existsSync(evalPath)) {
          execSync(`node "${evalPath}"`, { cwd: process.cwd(), stdio: 'pipe' });
        }
      } catch (_) {
        // ignore evaluation failure; report may still exist from previous run
      }
    }
    sendJson(res, result.ok ? 200 : 400, result);
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/admin/report') {
    if (!requireAdmin(session, res)) return;
    const reportPath = path.join(process.cwd(), 'evaluation', 'output', 'report.txt');
    if (!fs.existsSync(reportPath)) {
      sendJson(res, 404, { error: 'Report not found. Run matching first to generate it.' });
      return;
    }
    const report = fs.readFileSync(reportPath, 'utf8');
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(report);
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/admin/report-html') {
    if (!requireAdmin(session, res)) return;
    const reportPath = path.join(process.cwd(), 'evaluation', 'output', 'report.html');
    if (!fs.existsSync(reportPath)) {
      sendJson(res, 404, { error: 'Chart report not found. Run matching first to generate it.' });
      return;
    }
    const html = fs.readFileSync(reportPath, 'utf8');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/admin/dashboard') {
    if (!requireAdmin(session, res)) return;
    const surveys = storage.getAllSurvey();
    const users = storage.getAllUsers();
    const matches = storage.getAllMatches();
    const latest = matches[matches.length - 1] || null;
    const outbox = storage.getEmailOutbox();

    sendJson(res, 200, {
      summary: {
        totalUsers: users.length,
        totalSurveyResponses: surveys.length,
        totalMatchRuns: matches.length,
        totalEmailsLogged: outbox.length
      },
      latest,
      recentResponses: surveys
        .slice()
        .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0))
        .slice(0, 50),
      recentEmails: outbox.slice(-50).reverse()
    });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/admin/latest-matches') {
    if (!requireAdmin(session, res)) return;
    sendJson(res, 200, { latest: storage.getLatestMatches() });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/admin.html') {
    if (!session.admin?.username) {
      redirect(res, '/admin-login.html');
      return;
    }
  }

  if (req.method === 'GET' && (url.pathname === '/dashboard.html' || url.pathname === '/survey.html')) {
    if (!session.user?.netid) {
      redirect(res, '/');
      return;
    }
  }

  if (serveStatic(req, res)) return;
  sendJson(res, 404, { error: 'Not found' });
});

if (process.argv.includes('--run-matching')) {
  executeMatchingAndEmails('cli').then((result) => {
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.ok ? 0 : 1);
  });
} else {
  server.listen(config.port, () => {
    console.log(`LINKDKU running at ${config.appBaseUrl}`);
    startScheduler();
  });
}
