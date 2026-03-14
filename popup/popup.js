// popup/popup.js — JobHunt AI Copilot v4
import { testConnection, streamGenerate, buildPrompt } from '../utils/ollama.js';
import { getProfile, saveProfile, getLog, addLogEntry, deleteLogEntry, getStats, incrementStat } from '../utils/storage.js';
import { extractKeywords, computeMatchScore, detectSite } from '../utils/parser.js';

// ─── State ─────────────────────────────────────────────────────────────────
let currentJobData = null;
let currentProfile = null;
let currentMode = 'resume';
let currentModel = 'llama3';
let isStreaming = false;
let matchResult = null;

// ─── Session Storage Keys ───────────────────────────────────────────────────
const SESSION_KEY = 'jobhunt_session';

// ─── DOM Helpers ────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const $$ = sel => document.querySelectorAll(sel);

function showToast(msg, duration = 2200) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), duration);
}

function flashCopy(btn) {
  const orig = btn.textContent;
  btn.textContent = '✓ Copied';
  setTimeout(() => (btn.textContent = orig), 1500);
}

function copyToClipboard(text, btn) {
  navigator.clipboard.writeText(text || '').then(() => { if (btn) flashCopy(btn); });
}

// ─── Session Persistence ────────────────────────────────────────────────────

async function saveSession(data) {
  try {
    await chrome.storage.local.set({ [SESSION_KEY]: { jobData: data, savedAt: Date.now() } });
  } catch (e) { console.warn('[JobHunt] Session save failed', e); }
}

async function loadSession() {
  try {
    const result = await chrome.storage.local.get(SESSION_KEY);
    const session = result[SESSION_KEY];
    // Expire sessions older than 24 hours
    if (session && session.jobData && (Date.now() - session.savedAt) < 86400000) {
      return session.jobData;
    }
  } catch { }
  return null;
}

async function clearSession() {
  try {
    await chrome.storage.local.remove(SESSION_KEY);
  } catch { }
}

// ─── Tab Switching ──────────────────────────────────────────────────────────

$$('.p-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    $$('.p-tab').forEach(t => t.classList.remove('on'));
    $$('.tab-panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('on');
    const panel = $('panel-' + tab.dataset.tab);
    if (panel) panel.classList.add('active');
    onTabActivated(tab.dataset.tab);
  });
});

function onTabActivated(name) {
  if (name === 'job')      initJobTab();
  else if (name === 'generate') initGenerateTab();
  else if (name === 'fill')     initFillTab();
  else if (name === 'log')      renderLog();
  else if (name === 'me')       initMeTab();
  else if (name === 'setup')    initSetupTab();
}

function switchToTab(name) {
  $$('.p-tab').forEach(t => t.classList.toggle('on', t.dataset.tab === name));
  $$('.tab-panel').forEach(p => p.classList.remove('active'));
  const panel = $('panel-' + name);
  if (panel) panel.classList.add('active');
  onTabActivated(name);
}

// ─── Header Status ──────────────────────────────────────────────────────────

function setHeaderStatus(state, text) {
  const chip = $('hdr-status');
  chip.className = 'p-status ' + state;
  $('hdr-status-text').textContent = text;
}

async function checkOllamaStatus() {
  setHeaderStatus('warn', 'Connecting…');
  const result = await testConnection();
  if (result.ok) {
    setHeaderStatus('ok', 'Ollama ✓');
    populateModelSelectors(result.models);
    if (result.models.length > 0 && !result.models.includes(currentModel)) {
      currentModel = result.models[0];
    }
  } else if (result.error === 'cors') {
    setHeaderStatus('err', 'CORS Error');
  } else {
    setHeaderStatus('err', 'Offline');
  }
  return result;
}

function populateModelSelectors(models) {
  if (!models || !models.length) return;
  ['me-model', 'setup-model'].forEach(id => {
    const sel = $(id);
    if (!sel) return;
    const cur = sel.value || currentModel;
    sel.innerHTML = '';
    models.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m; opt.textContent = m;
      if (m === cur) opt.selected = true;
      sel.appendChild(opt);
    });
  });
  const lbl = $('gen-model-label');
  if (lbl) lbl.textContent = currentModel;
}

// ─── Job Tab ────────────────────────────────────────────────────────────────

function initJobTab() {
  // First try to restore from session
  if (currentJobData) {
    renderJobData(currentJobData);
    return;
  }
  requestJobData();
}

async function requestJobData() {
  showJobLoading('Scanning page…', 5);

  try {
    // First check if we have a saved session
    const saved = await loadSession();
    if (saved) {
      currentJobData = saved;
      renderJobData(saved);
      showToast('Restored previous session');
      return;
    }
  } catch { }

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) { showJobEmpty(); return; }

    const site = detectSite(tab.url || '');
    if (!site) { showJobEmpty(); return; }

    showJobLoading('Connecting to page…', 15);

    // Try to ping content script; if it fails, inject it
    let contentReady = false;
    try {
      await chrome.tabs.sendMessage(tab.id, { type: 'PING' });
      contentReady = true;
    } catch {
      try {
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content/content.js'] });
        await new Promise(r => setTimeout(r, 600));
        contentReady = true;
      } catch (e) {
        console.warn('[JobHunt] Could not inject content script:', e);
      }
    }

    if (!contentReady) { showJobEmpty(); return; }

    showJobLoading('Extracting job data…', 35);

    // Poll for job data with progress
    let attempts = 0;
    const maxAttempts = 12;
    const pollInterval = 600;

    const poll = async () => {
      attempts++;
      const pct = 35 + Math.round((attempts / maxAttempts) * 55);
      showJobLoading('Reading job details…', Math.min(pct, 90));

      try {
        const response = await chrome.tabs.sendMessage(tab.id, { type: 'REQUEST_JOB_DATA' });
        if (response && response.payload) {
          currentJobData = response.payload;
          await saveSession(currentJobData);
          renderJobData(currentJobData);
          return;
        }
      } catch { }

      if (attempts < maxAttempts) {
        setTimeout(poll, pollInterval);
      } else {
        showJobEmpty();
      }
    };

    setTimeout(poll, 300);

  } catch (e) {
    console.warn('[JobHunt] requestJobData error:', e);
    showJobEmpty();
  }
}

// ─── Job Tab States ─────────────────────────────────────────────────────────

function showJobLoading(msg, pct) {
  $('job-empty').classList.add('hidden');
  $('job-cors').classList.add('hidden');
  $('job-data').classList.add('hidden');
  $('job-manual').classList.add('hidden');
  $('job-loading').classList.remove('hidden');

  $('job-loading-msg').textContent = msg || 'Scanning…';
  const bar = $('job-loading-bar');
  if (bar) {
    bar.style.width = (pct || 0) + '%';
    bar.className = 'job-loading-bar-fill' + (pct >= 100 ? ' done' : '');
  }
  const pctEl = $('job-loading-pct');
  if (pctEl) pctEl.textContent = (pct || 0) + '%';
}

function showJobEmpty() {
  $('job-loading').classList.add('hidden');
  $('job-cors').classList.add('hidden');
  $('job-data').classList.add('hidden');
  $('job-manual').classList.add('hidden');
  $('job-empty').classList.remove('hidden');
}

function showJobCors() {
  $('job-loading').classList.add('hidden');
  $('job-empty').classList.add('hidden');
  $('job-data').classList.add('hidden');
  $('job-manual').classList.add('hidden');
  $('job-cors').classList.remove('hidden');
}

function showJobData() {
  $('job-loading').classList.add('hidden');
  $('job-empty').classList.add('hidden');
  $('job-cors').classList.add('hidden');
  $('job-manual').classList.add('hidden');
  $('job-data').classList.remove('hidden');
}

function showJobManual() {
  $('job-loading').classList.add('hidden');
  $('job-empty').classList.add('hidden');
  $('job-cors').classList.add('hidden');
  $('job-data').classList.add('hidden');
  $('job-manual').classList.remove('hidden');
}

// ─── Job Data Rendering ─────────────────────────────────────────────────────

function renderJobData(data) {
  showJobData();
  $('job-title').textContent = data.title || 'Unknown Role';
  $('job-company').textContent = [data.company, data.location].filter(Boolean).join(' · ') || '—';

  const chipsEl = $('job-chips');
  chipsEl.innerHTML = '';
  const siteLabels = { linkedin: 'LinkedIn', jobright: 'Jobright', indeed: 'Indeed', greenhouse: 'Greenhouse', lever: 'Lever', workday: 'Workday', manual: 'Manual' };
  if (data.site) chipsEl.appendChild(makeChip(siteLabels[data.site] || data.site, 'chip-site'));
  if (data.easyApply) chipsEl.appendChild(makeChip('⚡ Easy Apply', 'chip-easy'));
  if (data.salary) chipsEl.appendChild(makeChip(data.salary, 'chip-salary'));
  if (data.remote === 'remote') chipsEl.appendChild(makeChip('Remote', 'chip-remote'));
  else if (data.remote === 'hybrid') chipsEl.appendChild(makeChip('Hybrid', 'chip-hybrid'));
  else if (data.remote === 'onsite') chipsEl.appendChild(makeChip('Onsite', 'chip-onsite'));
  if (data.sponsorship) chipsEl.appendChild(makeChip('Visa Sponsor', 'chip-visa'));
  if (data._isSession) chipsEl.appendChild(makeChip('📌 Restored', 'chip-site'));

  // Reset ATS ring — SVG elements need setAttribute, .className is read-only on SVGElement
  const ring = $('ats-ring-circle');
  ring.style.strokeDashoffset = '188.5';
  ring.setAttribute('class', 'ats-ring-fill');
  $('ats-score-num').textContent = '—';
  $('ats-ring-title').textContent = 'Run Analysis';
  $('ats-ring-desc').textContent = 'Click Analyze to compute your ATS match score.';
  $('match-bars').style.display = 'none';
  $('skills-section').style.display = 'none';
}

function makeChip(text, cls) {
  const span = document.createElement('span');
  span.className = 'chip ' + cls;
  span.textContent = text;
  return span;
}

// ─── Manual JD Entry ────────────────────────────────────────────────────────

$('btn-enter-manually').addEventListener('click', showJobManual);
$('btn-cancel-manual').addEventListener('click', showJobEmpty);

$('btn-submit-manual').addEventListener('click', async () => {
  const title   = $('manual-title').value.trim();
  const company = $('manual-company').value.trim();
  const jd      = $('manual-jd').value.trim();

  if (!jd || jd.length < 50) {
    showToast('Please paste the full job description (at least 50 characters)');
    return;
  }

  const btn = $('btn-submit-manual');
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner"></div> Processing…';

  // Parse salary/remote/sponsorship from the pasted JD
  const parseSalaryLocal = text => {
    const m = text.match(/\$[\d,]+(?:\.\d+)?[kK]?(?:\s*[-–]\s*\$[\d,]+(?:\.\d+)?[kK]?)?/i);
    return m ? m[0] : null;
  };
  const detectRemoteLocal = text => {
    const t = text.toLowerCase();
    if (/fully\s+remote|100%\s+remote|work\s+from\s+home/.test(t)) return 'remote';
    if (/\bhybrid\b/.test(t)) return 'hybrid';
    if (/\bonsite\b|on-site/.test(t)) return 'onsite';
    if (/\bremote\b/.test(t)) return 'remote';
    return null;
  };
  const detectSponsorLocal = text => /visa\s*sponsor|h[1-9][ab]|work\s*authorization\s*sponsor/i.test(text);

  currentJobData = {
    title:       title || 'Manual Entry',
    company:     company || 'Unknown Company',
    location:    $('manual-location').value.trim() || null,
    description: jd,
    salary:      parseSalaryLocal(jd),
    remote:      detectRemoteLocal(jd),
    sponsorship: detectSponsorLocal(jd),
    easyApply:   false,
    site:        'manual',
    _isManual:   true
  };

  await saveSession(currentJobData);
  renderJobData(currentJobData);
  showToast('✓ Job loaded from manual entry');

  btn.disabled = false;
  btn.textContent = 'Load Job';
});

// ─── New Session ─────────────────────────────────────────────────────────────

$('btn-new-session').addEventListener('click', async () => {
  const confirmed = confirm('Start a new session? This will clear the current job and analysis.');
  if (!confirmed) return;

  currentJobData = null;
  matchResult = null;

  await clearSession();

  // Reset all job tab state
  $('ats-score-num').textContent = '—';
  $('match-bars').style.display = 'none';
  $('skills-section').style.display = 'none';

  // Clear manual fields
  ['manual-title','manual-company','manual-location','manual-jd'].forEach(id => {
    const el = $(id);
    if (el) el.value = '';
  });

  showJobEmpty();
  showToast('New session started');
});

// ─── Retry / Re-scan ────────────────────────────────────────────────────────

$('btn-rescan').addEventListener('click', async () => {
  currentJobData = null;
  await clearSession();
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.id) {
      await chrome.tabs.sendMessage(tab.id, { type: 'FORCE_RESCRAPE' }).catch(() => {});
    }
  } catch { }
  requestJobData();
});

// ─── ATS Analysis ────────────────────────────────────────────────────────────

$('btn-analyze').addEventListener('click', async () => {
  if (!currentJobData) { showToast('No job data to analyze'); return; }
  if (!currentProfile) currentProfile = await getProfile();

  const btn = $('btn-analyze');
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner dark"></div> Analyzing…';

  // Staged progress animation
  const stages = [
    { msg: 'Extracting keywords…', pct: 20 },
    { msg: 'Matching your skills…', pct: 55 },
    { msg: 'Computing ATS score…', pct: 80 },
    { msg: 'Done!', pct: 100 }
  ];
  let stage = 0;
  const stageInterval = setInterval(() => {
    if (stage < stages.length - 1) {
      stage++;
      setAnalysisProgress(stages[stage].msg, stages[stage].pct);
    } else {
      clearInterval(stageInterval);
    }
  }, 180);

  setAnalysisProgress(stages[0].msg, stages[0].pct);

  // Small yield to let UI update
  await new Promise(r => setTimeout(r, 50));

  const keywords = extractKeywords(currentJobData.description || '');
  const userSkills = currentProfile.skills || [];
  matchResult = computeMatchScore(userSkills, keywords);
  currentJobData.matchResult = matchResult;

  clearInterval(stageInterval);
  setAnalysisProgress('', 0);
  hideAnalysisProgress();

  // Animate ring — SVG elements require setAttribute; .className is read-only on SVGElement
  const overall = matchResult.overall;
  const circumference = 188.5;
  const offset = circumference - (overall / 100) * circumference;
  const ring = $('ats-ring-circle');
  ring.setAttribute('class', 'ats-ring-fill' + (overall >= 80 ? '' : overall >= 60 ? ' warn' : ' bad'));
  setTimeout(() => { ring.style.strokeDashoffset = offset; }, 50);

  $('ats-score-num').textContent = overall;
  $('ats-ring-title').textContent = overall >= 80 ? 'Strong match' : overall >= 60 ? 'Decent match' : 'Needs work';
  $('ats-ring-desc').textContent = matchResult.matched.length + ' matched · ' + matchResult.partial.length + ' partial · ' + matchResult.missing.length + ' missing';

  $('match-bars').style.display = 'block';
  animateBar('bar-overall', 'pct-overall', matchResult.overall);
  animateBar('bar-skills', 'pct-skills', matchResult.skills);
  animateBar('bar-exp', 'pct-exp', matchResult.experience);

  $('skills-section').style.display = 'block';
  const chipsEl = $('sk-chips');
  chipsEl.innerHTML = '';
  matchResult.matched.slice(0, 15).forEach(k => chipsEl.appendChild(makeSkChip(k, 'sk-y')));
  matchResult.partial.slice(0, 10).forEach(k => chipsEl.appendChild(makeSkChip(k, 'sk-m')));
  matchResult.missing.slice(0, 15).forEach(k => chipsEl.appendChild(makeSkChip(k, 'sk-n')));

  btn.disabled = false;
  btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg> Re-analyze';
});

function setAnalysisProgress(msg, pct) {
  const wrap = $('analysis-progress');
  if (!wrap) return;
  wrap.classList.remove('hidden');
  const bar = $('analysis-bar');
  const label = $('analysis-label');
  const pctEl = $('analysis-pct');
  if (bar) bar.style.width = pct + '%';
  if (label) label.textContent = msg;
  if (pctEl) pctEl.textContent = pct + '%';
}

function hideAnalysisProgress() {
  const wrap = $('analysis-progress');
  if (wrap) wrap.classList.add('hidden');
}

function animateBar(barId, pctId, value) {
  const bar = $(barId);
  const pct = $(pctId);
  bar.className = 'match-bar-fill' + (value >= 80 ? '' : value >= 60 ? ' warn' : ' bad');
  setTimeout(() => { bar.style.width = value + '%'; }, 50);
  pct.textContent = value + '%';
}

function makeSkChip(text, cls) {
  const span = document.createElement('span');
  span.className = 'sk ' + cls;
  span.textContent = text;
  return span;
}

// Log job application
$('btn-log-job').addEventListener('click', async () => {
  if (!currentJobData) { showToast('No job to log'); return; }
  await addLogEntry({ company: currentJobData.company || 'Unknown', role: currentJobData.title || 'Unknown', date: new Date().toISOString().split('T')[0], status: 'Applied', source: currentJobData.site || '' });
  await incrementStat('applied');
  showToast('✓ Application logged');
});

// Go to Generate tab
$('btn-go-generate').addEventListener('click', () => switchToTab('generate'));

// CORS test
$('job-cors-test-btn').addEventListener('click', async () => { await checkOllamaStatus(); });

// CORS OS tabs (job panel)
$$('#job-cors-os-tabs .os-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    $$('#job-cors-os-tabs .os-tab').forEach(t => t.classList.remove('on'));
    tab.classList.add('on');
    const os = tab.dataset.os;
    ['mac','win','linux'].forEach(o => {
      const el = $('job-cors-' + o);
      if (el) el.classList.toggle('on', o === os);
    });
  });
});

// ─── Generate Tab ────────────────────────────────────────────────────────────

async function initGenerateTab() {
  $('gen-no-job').classList.toggle('hidden', !!currentJobData);
  try {
    const { settings } = await chrome.storage.local.get('settings');
    if (settings && settings.model) {
      currentModel = settings.model;
      const lbl = $('gen-model-label');
      if (lbl) lbl.textContent = currentModel;
    }
  } catch { }
}

$$('.mode-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    $$('.mode-btn').forEach(b => b.classList.remove('on'));
    btn.classList.add('on');
    currentMode = btn.dataset.mode;
  });
});

$('btn-generate').addEventListener('click', () => runGenerate());
$('btn-send-custom').addEventListener('click', () => {
  const custom = $('custom-prompt').value.trim();
  if (custom) runGenerate(custom);
});

async function runGenerate(customInstruction) {
  if (isStreaming) return;
  if (!currentProfile) currentProfile = await getProfile();
  try {
    const { settings } = await chrome.storage.local.get('settings');
    if (settings && settings.model) currentModel = settings.model;
  } catch { }

  let prompt = buildPrompt(currentMode, currentProfile, currentJobData);
  if (customInstruction) prompt += '\n\nAdditional instruction: ' + customInstruction;

  const box = $('output-box');
  const btn = $('btn-generate');
  isStreaming = true;
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner"></div> Generating…';

  // Show generation progress bar
  showGenProgress(0, 'Starting…');

  box.innerHTML = '<span id="stream-cursor" class="cursor"></span>';
  let tokenCount = 0;

  await streamGenerate(
    prompt, currentModel,
    token => {
      tokenCount++;
      const cursor = $('stream-cursor');
      if (cursor) box.insertBefore(document.createTextNode(token), cursor);
      else box.textContent += token;
      box.scrollTop = box.scrollHeight;
      // Update progress based on token count (estimate ~300 tokens max)
      const estPct = Math.min(Math.round((tokenCount / 280) * 90), 90);
      showGenProgress(estPct, 'Generating with ' + currentModel + '… (' + tokenCount + ' tokens)');
    },
    async () => {
      const cursor = $('stream-cursor');
      if (cursor) cursor.remove();
      showGenProgress(100, 'Done!');
      setTimeout(hideGenProgress, 800);
      isStreaming = false;
      btn.disabled = false;
      btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M5 12h14M12 5l7 7-7 7"/></svg> Generate with <span id="gen-model-label">' + currentModel + '</span>';
      await incrementStat('generated');
    },
    err => {
      const cursor = $('stream-cursor');
      if (cursor) cursor.remove();
      hideGenProgress();
      isStreaming = false;
      btn.disabled = false;
      btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M5 12h14M12 5l7 7-7 7"/></svg> Generate with <span id="gen-model-label">' + currentModel + '</span>';
      const msgs = { cors: 'CORS error — restart Ollama with OLLAMA_ORIGINS=*', offline: 'Ollama is offline. Run: ollama serve' };
      box.textContent = '⚠ ' + (msgs[err] || 'Error: ' + err);
      setHeaderStatus('err', err === 'cors' ? 'CORS Error' : 'Offline');
    }
  );
}

function showGenProgress(pct, msg) {
  const wrap = $('gen-progress');
  if (!wrap) return;
  wrap.classList.remove('hidden');
  const bar = $('gen-progress-bar');
  const label = $('gen-progress-label');
  const pctEl = $('gen-progress-pct');
  if (bar) bar.style.width = pct + '%';
  if (label) label.textContent = msg || '';
  if (pctEl) pctEl.textContent = pct + '%';
}

function hideGenProgress() {
  const wrap = $('gen-progress');
  if (wrap) wrap.classList.add('hidden');
}

$('btn-copy-output').addEventListener('click', () => {
  copyToClipboard($('output-box').textContent, $('btn-copy-output'));
});

// ─── Fill Tab ────────────────────────────────────────────────────────────────

async function initFillTab() {
  if (!currentProfile) currentProfile = await getProfile();
  const p = currentProfile;
  const set = (id, val) => {
    const el = $(id);
    if (!el) return;
    el.textContent = val || '—';
    el.classList.toggle('empty', !val);
  };
  set('af-name', p.name); set('af-email', p.email); set('af-phone', p.phone);
  set('af-linkedin', p.linkedin); set('af-github', p.github); set('af-summary', p.summary);
}

$$('.af-copy').forEach(btn => {
  btn.addEventListener('click', () => {
    const val = $(btn.dataset.field) && $(btn.dataset.field).textContent;
    if (val && val !== '—') copyToClipboard(val, btn);
    else showToast('Nothing to copy — fill out your profile first');
  });
});

$('btn-autofill').addEventListener('click', async () => {
  const btn = $('btn-autofill');
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner"></div> Filling…';
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) { showToast('No active tab'); return; }
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content/autofill.js'] });
    showToast('✓ Autofill injected');
  } catch (e) {
    showToast('Could not inject: ' + (e.message || 'check permissions'));
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M12 5v14M5 12h14"/></svg> Auto-fill Page';
  }
});

$('btn-clear-fields').addEventListener('click', async () => {
  if (!confirm('Clear autofill kit display? This does not delete your profile.')) return;
  ['af-name','af-email','af-phone','af-linkedin','af-github','af-summary'].forEach(id => {
    const el = $(id); if (el) { el.textContent = '—'; el.classList.add('empty'); }
  });
  showToast('Fields cleared');
});

// ─── Log Tab ─────────────────────────────────────────────────────────────────

async function renderLog() {
  const [log, stats] = await Promise.all([getLog(), getStats()]);
  $('stat-applied').textContent = stats.applied || 0;
  $('stat-generated').textContent = stats.generated || 0;
  $('stat-filled').textContent = stats.filled || 0;
  $('stat-saved').textContent = stats.saved || 0;

  const listEl = $('log-list');
  listEl.innerHTML = '';
  if (!log || !log.length) { $('log-empty').style.display = 'flex'; return; }
  $('log-empty').style.display = 'none';
  log.forEach(entry => listEl.appendChild(makeLogEntry(entry)));
}

function makeLogEntry(entry) {
  const div = document.createElement('div');
  div.className = 'log-entry';
  div.dataset.id = entry.id;
  const sc = (entry.status || 'applied').toLowerCase();
  div.innerHTML = '<div class="log-info"><div class="log-company">' + esc(entry.company) + '</div><div class="log-role">' + esc(entry.role) + '</div></div><span class="log-date">' + (entry.date || '') + '</span><span class="log-status ' + sc + '">' + (entry.status || 'Applied') + '</span><button class="log-delete" title="Delete"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M18 6 6 18M6 6l12 12"/></svg></button>';
  div.querySelector('.log-delete').addEventListener('click', async e => {
    e.stopPropagation();
    if (!confirm('Remove "' + entry.role + '" at "' + entry.company + '"?')) return;
    await deleteLogEntry(entry.id);
    div.remove();
    showToast('Entry removed');
    if (!$('log-list').querySelector('.log-entry')) $('log-empty').style.display = 'flex';
  });
  return div;
}

function esc(str) {
  return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ─── Me Tab ──────────────────────────────────────────────────────────────────

async function initMeTab() {
  currentProfile = await getProfile();
  const { settings } = await chrome.storage.local.get('settings').catch(() => ({ settings: null }));
  if (settings && settings.model) currentModel = settings.model;

  $('me-name').value = currentProfile.name || '';
  $('me-email').value = currentProfile.email || '';
  $('me-phone').value = currentProfile.phone || '';
  $('me-linkedin').value = currentProfile.linkedin || '';
  $('me-github').value = currentProfile.github || '';
  $('me-summary').value = currentProfile.summary || '';
  renderSkillTags(currentProfile.skills || []);

  if (settings && settings.model) {
    const sel = $('me-model');
    if (sel) Array.from(sel.options).forEach(o => { if (o.value === settings.model) o.selected = true; });
  }
}

function renderSkillTags(skills) {
  const c = $('skill-tags');
  c.innerHTML = '';
  skills.forEach(skill => {
    const tag = document.createElement('span');
    tag.className = 'skill-tag';
    tag.textContent = skill;
    const x = document.createElement('button');
    x.className = 'skill-tag-x'; x.textContent = '×';
    x.addEventListener('click', () => tag.remove());
    tag.appendChild(x);
    c.appendChild(tag);
  });
}

$('me-skills-input').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addSkillFromInput(); } });
$('btn-add-skill').addEventListener('click', addSkillFromInput);

function addSkillFromInput() {
  const input = $('me-skills-input');
  const skills = input.value.trim().split(',').map(s => s.trim()).filter(Boolean);
  skills.forEach(skill => {
    const tag = document.createElement('span');
    tag.className = 'skill-tag'; tag.textContent = skill;
    const x = document.createElement('button');
    x.className = 'skill-tag-x'; x.textContent = '×';
    x.addEventListener('click', () => tag.remove());
    tag.appendChild(x); $('skill-tags').appendChild(tag);
  });
  input.value = '';
}

['me-name','me-email','me-phone','me-linkedin','me-github','me-summary'].forEach(id => {
  const el = $(id); if (!el) return;
  el.addEventListener('blur', async () => {
    const keyMap = { 'me-name':'name','me-email':'email','me-phone':'phone','me-linkedin':'linkedin','me-github':'github','me-summary':'summary' };
    const key = keyMap[id];
    if (key) { await saveProfile({ [key]: el.value }); if (currentProfile) currentProfile[key] = el.value; }
  });
});

$('btn-save-profile').addEventListener('click', async () => {
  const btn = $('btn-save-profile');
  btn.disabled = true;
  const skills = Array.from($$('#skill-tags .skill-tag')).map(t => (t.childNodes[0] && t.childNodes[0].textContent || '').trim()).filter(Boolean);
  const profileData = { name: $('me-name').value.trim(), email: $('me-email').value.trim(), phone: $('me-phone').value.trim(), linkedin: $('me-linkedin').value.trim(), github: $('me-github').value.trim(), summary: $('me-summary').value.trim(), skills };
  currentProfile = await saveProfile(profileData);
  const selectedModel = $('me-model').value;
  if (selectedModel) {
    currentModel = selectedModel;
    const { settings } = await chrome.storage.local.get('settings').catch(() => ({ settings: {} }));
    await chrome.storage.local.set({ settings: Object.assign({}, settings || {}, { model: selectedModel }) });
    const lbl = $('gen-model-label'); if (lbl) lbl.textContent = selectedModel;
    const setupSel = $('setup-model');
    if (setupSel) Array.from(setupSel.options).forEach(o => { if (o.value === selectedModel) o.selected = true; });
  }
  await incrementStat('saved');
  btn.disabled = false;
  btn.textContent = '✓ Saved';
  setTimeout(() => (btn.textContent = 'Save Profile'), 2000);
  showToast('✓ Profile saved');
});

// ─── Setup Tab ───────────────────────────────────────────────────────────────

async function initSetupTab() {
  updateSetupStatus('warn', 'Checking…', '');
  const result = await testConnection();
  if (result.ok) {
    updateSetupStatus('ok', 'Connected · ' + result.models.length + ' model(s)', 'http://localhost:11434');
    populateModelSelectors(result.models);
    setHeaderStatus('ok', 'Ollama ✓');
  } else if (result.error === 'cors') {
    updateSetupStatus('err', 'CORS Error', 'Restart Ollama with OLLAMA_ORIGINS=*');
    setHeaderStatus('err', 'CORS Error');
  } else {
    updateSetupStatus('err', 'Offline', 'Run: ollama serve');
    setHeaderStatus('err', 'Offline');
  }
  const { settings } = await chrome.storage.local.get('settings').catch(() => ({ settings: null }));
  if (settings && settings.model) {
    const sel = $('setup-model');
    if (sel) Array.from(sel.options).forEach(o => { if (o.value === settings.model) o.selected = true; });
  }
}

function updateSetupStatus(state, text, sub) {
  const dot = $('setup-dot');
  dot.className = 'status-dot ' + state;
  $('setup-status-text').textContent = text;
  if (sub !== undefined) $('setup-status-sub').textContent = sub;
}

$('btn-test-connection').addEventListener('click', async () => {
  const btn = $('btn-test-connection');
  btn.disabled = true; btn.textContent = '…';
  const result = await testConnection();
  if (result.ok) {
    updateSetupStatus('ok', 'Connected · ' + result.models.length + ' model(s)', 'http://localhost:11434');
    setHeaderStatus('ok', 'Ollama ✓');
    populateModelSelectors(result.models);
  } else if (result.error === 'cors') {
    updateSetupStatus('err', 'CORS Error', 'Restart with OLLAMA_ORIGINS=*');
    setHeaderStatus('err', 'CORS Error');
  } else {
    updateSetupStatus('err', 'Offline', 'Run: ollama serve');
    setHeaderStatus('err', 'Offline');
  }
  btn.disabled = false; btn.textContent = 'Test';
});

$('setup-model').addEventListener('change', async () => {
  const val = $('setup-model').value;
  currentModel = val;
  const { settings } = await chrome.storage.local.get('settings').catch(() => ({ settings: {} }));
  await chrome.storage.local.set({ settings: Object.assign({}, settings || {}, { model: val }) });
  const meSel = $('me-model');
  if (meSel) Array.from(meSel.options).forEach(o => { if (o.value === val) o.selected = true; });
  showToast('Model set to ' + val);
});

$$('#setup-os-tabs .os-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    $$('#setup-os-tabs .os-tab').forEach(t => t.classList.remove('on'));
    tab.classList.add('on');
    const os = tab.dataset.os;
    ['mac','win','linux'].forEach(o => {
      const el = $('setup-cors-' + o);
      if (el) el.classList.toggle('on', o === os);
    });
  });
});

// ─── Code copy buttons ───────────────────────────────────────────────────────

document.addEventListener('click', e => {
  if (e.target.classList.contains('code-copy-btn')) {
    const block = e.target.closest('.code-block');
    if (block) copyToClipboard(block.childNodes[0] && block.childNodes[0].textContent.trim(), e.target);
  }
});

// ─── Listen for pushed job data from content script ──────────────────────────

chrome.runtime.onMessage.addListener(msg => {
  if (msg.type === 'JOB_DATA' && msg.payload) {
    currentJobData = msg.payload;
    saveSession(currentJobData);
    const jobPanel = $('panel-job');
    if (jobPanel && jobPanel.classList.contains('active')) renderJobData(currentJobData);
  }
  if (msg.type === 'SCRAPE_PROGRESS') {
    const pct = Math.round((msg.progress / msg.total) * 80);
    showJobLoading('Reading page… retry ' + msg.progress + '/' + msg.total, pct);
  }
  if (msg.type === 'SCRAPE_FAILED') {
    showJobEmpty();
  }
});

// ─── Init ────────────────────────────────────────────────────────────────────

async function init() {
  currentProfile = await getProfile().catch(() => null);
  try {
    const { settings } = await chrome.storage.local.get('settings');
    if (settings && settings.model) currentModel = settings.model;
  } catch { }
  checkOllamaStatus();
  initJobTab();
}

init();
