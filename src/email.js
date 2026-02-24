const https = require('https');
const { appendOutbox } = require('./storage');

function postJson({ host, path, headers, body }) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: host,
        path,
        method: 'POST',
        headers
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          resolve({ statusCode: res.statusCode || 500, data });
        });
      }
    );

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function sendEmailResult(config, toEmail, subject, text, html = '') {
  const entry = {
    toEmail,
    subject,
    text,
    sentAt: new Date().toISOString()
  };

  if (config.email.provider === 'smtp') {
    if (!config.email.smtpHost || !config.email.smtpUser || !config.email.smtpPass) {
      appendOutbox({ ...entry, mode: 'dry-run', response: 'SMTP not configured.' });
      return { ok: true, dryRun: true };
    }

    let nodemailer;
    try {
      // Optional dependency; install when using SMTP mode.
      nodemailer = require('nodemailer');
    } catch {
      appendOutbox({ ...entry, mode: 'failed', response: 'Missing dependency: nodemailer' });
      return { ok: false, statusCode: 500 };
    }

    try {
      const transporter = nodemailer.createTransport({
        host: config.email.smtpHost,
        port: config.email.smtpPort,
        secure: config.email.smtpSecure,
        auth: {
          user: config.email.smtpUser,
          pass: config.email.smtpPass
        }
      });

      const info = await transporter.sendMail({
        from: config.email.from,
        to: toEmail,
        subject,
        text,
        ...(html ? { html } : {})
      });

      appendOutbox({
        ...entry,
        mode: 'sent',
        response: JSON.stringify({
          messageId: info.messageId,
          accepted: info.accepted,
          rejected: info.rejected,
          pending: info.pending,
          response: info.response
        })
      });
      return { ok: true, statusCode: 202 };
    } catch (err) {
      appendOutbox({
        ...entry,
        mode: 'failed',
        statusCode: 500,
        response: err.message
      });
      return { ok: false, statusCode: 500 };
    }
  }

  if (!config.email.apiKey) {
    appendOutbox({ ...entry, mode: 'dry-run' });
    return { ok: true, dryRun: true };
  }

  const payload = JSON.stringify({
    from: config.email.from,
    to: [toEmail],
    subject,
    text,
    ...(html ? { html } : {})
  });

  const response = await postJson({
    host: config.email.host,
    path: config.email.path,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.email.apiKey}`,
      'Content-Length': Buffer.byteLength(payload)
    },
    body: payload
  });

  const ok = response.statusCode >= 200 && response.statusCode < 300;
  appendOutbox({
    ...entry,
    mode: ok ? 'sent' : 'failed',
    statusCode: response.statusCode,
    response: response.data
  });

  return { ok, statusCode: response.statusCode };
}

module.exports = {
  sendEmailResult
};
