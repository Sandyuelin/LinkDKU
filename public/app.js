async function api(path, options = {}) {
  const res = await fetch(path, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    },
    ...options
  });

  let json = {};
  try {
    json = await res.json();
  } catch {
    json = {};
  }

  if (!res.ok) {
    throw new Error(json.error || json.message || `Request failed: ${res.status}`);
  }

  return json;
}

function selectedValues(name) {
  return Array.from(document.querySelectorAll(`input[name="${name}"]:checked`)).map((x) => x.value);
}

function setStatus(el, msg, type = '') {
  if (!el) return;
  el.textContent = msg;
  el.className = `status ${type}`;
}

function enforceCheckboxLimit(containerId, inputName, limit, statusEl) {
  const box = document.getElementById(containerId);
  if (!box) return;

  box.addEventListener('change', (e) => {
    const checked = selectedValues(inputName);
    if (checked.length > limit) {
      e.target.checked = false;
      setStatus(statusEl, `You can select up to ${limit}.`, 'error');
    } else {
      setStatus(statusEl, '');
    }
  });
}

function initBubbleScales() {
  const rows = Array.from(document.querySelectorAll('.bubble-row'));
  rows.forEach((row) => {
    const name = row.dataset.name;
    const left = row.dataset.left || 'Low';
    const right = row.dataset.right || 'High';
    const defaultValue = Number(row.dataset.default || 3);

    const hidden = document.createElement('input');
    hidden.type = 'hidden';
    hidden.name = name;
    hidden.value = String(defaultValue);

    const labels = document.createElement('div');
    labels.className = 'bubble-labels';
    labels.innerHTML = `<span>${left}</span><span>${right}</span>`;

    const bubbles = document.createElement('div');
    bubbles.className = 'bubbles';

    for (let i = 1; i <= 5; i += 1) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'bubble';
      b.dataset.size = String(i);
      b.dataset.value = String(i);
      b.setAttribute('aria-label', `${name} ${i}`);

      b.addEventListener('click', () => {
        bubbles.querySelectorAll('.bubble').forEach((x) => x.classList.remove('active'));
        b.classList.add('active');
        hidden.value = String(i);
      });

      bubbles.appendChild(b);
    }

    row.appendChild(hidden);
    row.appendChild(labels);
    row.appendChild(bubbles);
  });
}

async function initHome() {
  const dukeOauthBtn = document.getElementById('dukeOauthBtn');
  const devLoginBtn = document.getElementById('devLoginBtn');
  const netidInput = document.getElementById('netidInput');
  const homeAdminLoginBtn = document.getElementById('homeAdminLoginBtn');
  const showAdminPanelBtn = document.getElementById('showAdminPanelBtn');
  const homeAdminPanel = document.getElementById('homeAdminPanel');
  const homeAdminUsername = document.getElementById('homeAdminUsername');
  const homeAdminPassword = document.getElementById('homeAdminPassword');
  const homeAdminStatus = document.getElementById('homeAdminStatus');
  const loginStatus = document.getElementById('loginStatus');

  if (!dukeOauthBtn) return;

  dukeOauthBtn.addEventListener('click', () => {
    window.location.href = '/auth/duke';
  });

  devLoginBtn?.addEventListener('click', async () => {
    setStatus(loginStatus, 'Signing in...');
    try {
      const netid = (netidInput?.value || '').trim().toLowerCase();
      if (!netid) {
        setStatus(loginStatus, 'Please enter a netid.', 'error');
        return;
      }
      await api('/auth/dev-login', {
        method: 'POST',
        body: JSON.stringify({ netid })
      });
      window.location.href = '/dashboard.html';
    } catch (err) {
      setStatus(loginStatus, err.message, 'error');
    }
  });

  showAdminPanelBtn?.addEventListener('click', () => {
    const isHidden = homeAdminPanel?.hasAttribute('hidden');
    if (isHidden) homeAdminPanel.removeAttribute('hidden');
    else homeAdminPanel.setAttribute('hidden', '');
  });

  homeAdminLoginBtn?.addEventListener('click', async () => {
    setStatus(homeAdminStatus, 'Signing in...');
    try {
      await api('/auth/admin/login', {
        method: 'POST',
        body: JSON.stringify({
          username: homeAdminUsername?.value?.trim() || '',
          password: homeAdminPassword?.value || ''
        })
      });
      window.location.href = '/admin.html';
    } catch (err) {
      setStatus(homeAdminStatus, err.message, 'error');
    }
  });

  try {
    const me = await api('/api/me');
    if (me.user) {
      setStatus(loginStatus, `Signed in as ${me.user.netid}.`, 'success');
    }
  } catch {
    // no-op
  }
}

async function initUserDashboard() {
  const welcomeNetid = document.getElementById('welcomeNetid');
  if (!welcomeNetid) return;

  const accountBtn = document.getElementById('accountBtn');
  const dropdown = document.getElementById('accountDropdown');
  const logoutBtn = document.getElementById('userLogoutBtn');
  const howItWorksBtn = document.getElementById('howItWorksBtn');
  const howItWorksPanel = document.getElementById('howItWorksPanel');

  try {
    const me = await api('/api/me');
    if (!me.user) {
      window.location.href = '/';
      return;
    }
    welcomeNetid.textContent = me.user.netid;
  } catch {
    window.location.href = '/';
    return;
  }

  accountBtn?.addEventListener('click', () => {
    dropdown?.classList.toggle('open');
  });

  document.addEventListener('click', (e) => {
    if (!dropdown || !accountBtn) return;
    if (!dropdown.contains(e.target) && !accountBtn.contains(e.target)) {
      dropdown.classList.remove('open');
    }
  });

  ['profileLink', 'preferencesLink', 'historyLink'].forEach((id) => {
    const el = document.getElementById(id);
    el?.addEventListener('click', (e) => {
      e.preventDefault();
      howItWorksPanel.style.display = 'block';
      howItWorksPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  howItWorksBtn?.addEventListener('click', () => {
    const isOpen = howItWorksPanel.style.display === 'block';
    howItWorksPanel.style.display = isOpen ? 'none' : 'block';
    if (!isOpen) howItWorksPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  logoutBtn?.addEventListener('click', async () => {
    await api('/auth/logout', { method: 'POST', body: '{}' });
    window.location.href = '/';
  });
}

async function initSurvey() {
  const form = document.getElementById('surveyForm');
  if (!form) return;

  const meBox = document.getElementById('meBox');
  const surveyStatus = document.getElementById('surveyStatus');
  const logoutBtn = document.getElementById('logoutBtn');
  const prevBtn = document.getElementById('prevStepBtn');
  const nextBtn = document.getElementById('nextStepBtn');
  const submitBtn = document.getElementById('submitSurveyBtn');
  const progressFill = document.getElementById('progressFill');
  const stepLabel = document.getElementById('stepLabel');
  const progressPct = document.getElementById('progressPct');

  try {
    const me = await api('/api/me');
    if (!me.user) {
      window.location.href = '/';
      return;
    }
    meBox.textContent = `${me.user.netid}@duke.edu`;
  } catch {
    window.location.href = '/';
    return;
  }

  initBubbleScales();
  enforceCheckboxLimit('interestsBox', 'activityInterests', 3, surveyStatus);
  enforceCheckboxLimit('qualitiesBox', 'qualities', 2, surveyStatus);

  const steps = Array.from(document.querySelectorAll('.survey-step'));
  let currentStep = 1;
  const totalSteps = steps.length;

  function renderStep() {
    steps.forEach((s, idx) => {
      s.hidden = idx + 1 !== currentStep;
    });

    const pct = Math.round((currentStep / totalSteps) * 100);
    if (progressFill) progressFill.style.width = `${pct}%`;
    if (stepLabel) stepLabel.textContent = `Step ${currentStep} of ${totalSteps}`;
    if (progressPct) progressPct.textContent = `${pct}%`;

    document.querySelectorAll('.step-dot').forEach((dot) => {
      const n = Number(dot.dataset.dot || 0);
      dot.classList.toggle('active', n <= currentStep);
    });

    prevBtn.style.display = currentStep === 1 ? 'none' : 'inline-block';
    nextBtn.style.display = currentStep === totalSteps ? 'none' : 'inline-block';
    submitBtn.style.display = currentStep === totalSteps ? 'inline-block' : 'none';
  }

  function validateStep(stepNo) {
    if (stepNo === 1) {
      if (!form.major.value) {
        setStatus(surveyStatus, 'Select your major.', 'error');
        return false;
      }
      if (!form.year.value) {
        setStatus(surveyStatus, 'Select your year.', 'error');
        return false;
      }
      if (!selectedValues('languages').length) {
        setStatus(surveyStatus, 'Select at least one language.', 'error');
        return false;
      }
    }

    if (stepNo === 2) {
      if (selectedValues('activityInterests').length > 3) {
        setStatus(surveyStatus, 'Select at most 3 activity interests.', 'error');
        return false;
      }
    }

    if (stepNo === 4) {
      if (selectedValues('qualities').length > 2) {
        setStatus(surveyStatus, 'Select at most 2 qualities.', 'error');
        return false;
      }
    }

    setStatus(surveyStatus, '');
    return true;
  }

  prevBtn.addEventListener('click', () => {
    if (currentStep > 1) {
      currentStep -= 1;
      renderStep();
    }
  });

  nextBtn.addEventListener('click', () => {
    if (!validateStep(currentStep)) return;
    if (currentStep < totalSteps) {
      currentStep += 1;
      renderStep();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });

  logoutBtn.addEventListener('click', async () => {
    await api('/auth/logout', { method: 'POST', body: '{}' });
    window.location.href = '/';
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!validateStep(currentStep)) return;
    setStatus(surveyStatus, 'Submitting...');

    const payload = {
      major: form.major.value,
      year: form.year.value,
      languages: (() => {
        const list = selectedValues('languages');
        const other = (form.languageOther?.value || '').trim();
        if (other) list.push(other);
        return list;
      })(),
      lookingFor: selectedValues('lookingFor'),
      activityInterests: selectedValues('activityInterests'),
      dkuOpenness: Number(form.dkuOpenness.value),
      interactionStyle: Number(form.interactionStyle.value),
      opennessToNewActivities: Number(form.opennessToNewActivities.value),
      planningStyle: Number(form.planningStyle.value),
      socialEnergy: Number(form.socialEnergy.value),
      communicationStyle: Number(form.communicationStyle.value),
      conversationPreference: Number(form.conversationPreference.value),
      decisionMaking: Number(form.decisionMaking.value),
      conflictHandling: Number(form.conflictHandling.value),
      emotionalSharing: Number(form.emotionalSharing.value),
      qualities: selectedValues('qualities')
    };

    try {
      await api('/api/survey', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      setStatus(surveyStatus, 'Submitted successfully.', 'success');
      setTimeout(() => {
        window.location.href = '/thank-you.html';
      }, 500);
    } catch (err) {
      setStatus(surveyStatus, err.message, 'error');
    }
  });

  renderStep();
}

async function initDukeFallbackLogin() {
  const dukeBtn = document.getElementById('dukeFallbackLoginBtn');
  if (!dukeBtn) return;

  const input = document.getElementById('dukeNetidInput');
  const status = document.getElementById('dukeLoginStatus');

  dukeBtn.addEventListener('click', async () => {
    setStatus(status, 'Signing in...');
    try {
      const netid = (input?.value || '').trim().toLowerCase();
      if (!netid) {
        setStatus(status, 'Please enter your netid.', 'error');
        return;
      }
      await api('/auth/duke-fallback-login', {
        method: 'POST',
        body: JSON.stringify({ netid })
      });
      window.location.href = '/dashboard.html';
    } catch (err) {
      setStatus(status, err.message, 'error');
    }
  });
}

async function initAdminLogin() {
  const adminLoginBtn = document.getElementById('adminLoginBtn');
  if (!adminLoginBtn) return;

  const usernameInput = document.getElementById('adminUsername');
  const passwordInput = document.getElementById('adminPassword');
  const statusEl = document.getElementById('adminLoginStatus');

  try {
    const me = await api('/api/me');
    if (me.admin) {
      window.location.href = '/admin.html';
      return;
    }
  } catch {
    // continue
  }

  adminLoginBtn.addEventListener('click', async () => {
    setStatus(statusEl, 'Signing in...');
    try {
      await api('/auth/admin/login', {
        method: 'POST',
        body: JSON.stringify({
          username: usernameInput.value.trim(),
          password: passwordInput.value
        })
      });
      window.location.href = '/admin.html';
    } catch (err) {
      setStatus(statusEl, err.message, 'error');
    }
  });
}

function renderSummary(summary) {
  const grid = document.getElementById('summaryGrid');
  if (!grid) return;
  grid.innerHTML = '';
  const items = [
    { label: 'Users', value: summary.totalUsers || 0 },
    { label: 'Survey Responses', value: summary.totalSurveyResponses || 0 },
    { label: 'Match Runs', value: summary.totalMatchRuns || 0 },
    { label: 'Email Logs', value: summary.totalEmailsLogged || 0 }
  ];

  items.forEach((item) => {
    const card = document.createElement('div');
    card.className = 'metric';
    card.innerHTML = `<div class="metric-value">${item.value}</div><div class="metric-label">${item.label}</div>`;
    grid.appendChild(card);
  });
}

function renderMatches(latest) {
  const meta = document.getElementById('latestRunMeta');
  const body = document.getElementById('matchesBody');
  const reportWrap = document.getElementById('readReportWrap');
  if (!meta || !body) return;

  if (!latest) {
    meta.innerHTML = '<small>No matching run has been completed yet.</small>';
    if (reportWrap) reportWrap.style.display = 'none';
    body.innerHTML = '<tr><td colspan="4">No data</td></tr>';
    return;
  }

  meta.innerHTML = `<small>Generated: <code>${latest.generatedAt}</code> | Source: <code>${latest.triggeredBy}</code> | Matches: <code>${latest.count}</code></small>`;
  if (reportWrap) reportWrap.style.display = 'block';
  body.innerHTML = '';
  (latest.matches || []).forEach((m) => {
    const row = document.createElement('tr');
    row.innerHTML = `<td>${m.netidA}</td><td>${m.netidB}</td><td>${m.score}</td><td>${(m.explanation || []).join(' ')}</td>`;
    body.appendChild(row);
  });
  if (!latest.matches?.length) {
    body.innerHTML = '<tr><td colspan="4">No matched pairs in the latest run.</td></tr>';
  }
}

function renderResponses(rows) {
  const body = document.getElementById('responsesBody');
  if (!body) return;
  body.innerHTML = '';

  rows.forEach((r) => {
    const row = document.createElement('tr');
    row.innerHTML = `<td>${r.netid || ''}</td><td>${r.major || ''} / ${r.year || ''}</td><td>${(r.languages || []).join(', ')}</td><td>${(r.activityInterests || []).join(', ')}</td><td>${r.updatedAt || r.createdAt || ''}</td>`;
    body.appendChild(row);
  });

  if (!rows.length) {
    body.innerHTML = '<tr><td colspan="5">No survey responses yet.</td></tr>';
  }
}

function renderEmails(rows) {
  const body = document.getElementById('emailsBody');
  if (!body) return;
  body.innerHTML = '';
  rows.forEach((r) => {
    const row = document.createElement('tr');
    row.innerHTML = `<td>${r.toEmail || ''}</td><td>${r.mode || ''}${r.statusCode ? ` (${r.statusCode})` : ''}</td><td>${r.subject || ''}</td><td>${r.sentAt || ''}</td>`;
    body.appendChild(row);
  });
  if (!rows.length) {
    body.innerHTML = '<tr><td colspan="4">No email logs yet.</td></tr>';
  }
}

async function initAdminDashboard() {
  const runBtn = document.getElementById('runMatchingBtn');
  if (!runBtn) return;

  const refreshBtn = document.getElementById('refreshAdminBtn');
  const logoutBtn = document.getElementById('adminLogoutBtn');
  const statusEl = document.getElementById('adminStatus');
  const who = document.getElementById('adminWho');

  async function loadDashboard() {
    try {
      const me = await api('/api/me');
      if (!me.admin) {
        window.location.href = '/admin-login.html';
        return;
      }
      who.innerHTML = `<div class="brand-pill">${me.admin.username}</div>`;

      const data = await api('/api/admin/dashboard');
      renderSummary(data.summary || {});
      renderMatches(data.latest || null);
      renderResponses(data.recentResponses || []);
      renderEmails(data.recentEmails || []);
      setStatus(statusEl, 'Dashboard loaded.', 'success');
    } catch (err) {
      setStatus(statusEl, err.message, 'error');
      if (String(err.message).includes('Admin login required')) {
        window.location.href = '/admin-login.html';
      }
    }
  }

  runBtn.addEventListener('click', async () => {
    setStatus(statusEl, 'Running matching...');
    try {
      const result = await api('/api/admin/run-matching', { method: 'POST', body: '{}' });
      setStatus(statusEl, `Matching finished. ${result.payload?.count || 0} pairs generated.`, 'success');
      await loadDashboard();
    } catch (err) {
      setStatus(statusEl, err.message, 'error');
    }
  });

  const readReportBtn = document.getElementById('readReportBtn');
  const reportModal = document.getElementById('reportModal');
  const reportFrame = document.getElementById('reportFrame');
  const closeReportBtn = document.getElementById('closeReportBtn');

  if (readReportBtn && reportModal && reportFrame) {
    readReportBtn.addEventListener('click', () => {
      reportFrame.src = '/api/admin/report-html';
      reportModal.setAttribute('aria-hidden', 'false');
    });
    function closeReportModal() {
      reportModal.setAttribute('aria-hidden', 'true');
      reportFrame.src = 'about:blank';
    }
    if (closeReportBtn) closeReportBtn.addEventListener('click', closeReportModal);
    if (reportModal) {
      const backdrop = reportModal.querySelector('.report-modal-backdrop');
      if (backdrop) backdrop.addEventListener('click', closeReportModal);
    }
  }

  refreshBtn.addEventListener('click', loadDashboard);
  logoutBtn.addEventListener('click', async () => {
    await api('/auth/admin/logout', { method: 'POST', body: '{}' });
    window.location.href = '/admin-login.html';
  });

  await loadDashboard();
}

initHome();
initUserDashboard();
initSurvey();
initDukeFallbackLogin();
initAdminLogin();
initAdminDashboard();
