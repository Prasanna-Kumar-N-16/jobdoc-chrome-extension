// popup/popup.js — Main popup controller for JobHunt AI Copilot v4
// All event wiring, state management, and UI updates

import { testConnection, fetchModels, streamGenerate, buildPrompt } from '../utils/ollama.js';
import { getProfile, saveProfile, getLog, addLogEntry, deleteLogEntry, getStats, incrementStat } from '../utils/storage.js';
import { extractKeywords, computeMatchScore, detectSite } from '../utils/parser.js';

// ─── State ───────────────────────────────────────────────────────────────────
let currentJobData = null;
let currentProfile = null;
let currentMode = 'resume';
let currentModel = 'llama3';
let isStreaming = false;
let matchResult = null;

// ─── DOM Helpers ─────────────────────────────────────────────────────────────

function $(id) { return document.getElementById(id); }
function $$(sel) { return document.querySelectorAll(sel); }

function showToast(msg, duration = 2000) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), duration);
}

function setCopyBtn(btn, label = 'Copy') {
  btn.textContent = label;
}

function flashCopy(btn) {
  const orig = btn.textContent;
  btn.textContent = '✓ Copied';
  setTimeout(() => (btn.textContent = orig), 1500);
}

function copyToClipboard(text, btn) {
  navigator.clipboard.writeText(text || '').then(() => {
    if (btn) flashCopy(btn);
  });
}

// ─── Tab Switching ────────────────────────────────────────────────────────────

const TAB_IDS = ['job', 'generate', 'fill', 'log', 'me', 'setup'];

$$('.p-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    $$('.p-tab').forEach(t => t.classList.remove('on'));
    $$('.tab-panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('on');
    const panel = $(`panel-${tab.dataset.tab}`);
    if (panel) panel.classList.add('active');
    onTabActivated(tab.dataset.tab);
  });
});

function onTabActivated(tabName) {
  switch (tabName) {
    case 'job':      initJobTab(); break;
    case 'generate': initGenerateTab(); break;
    case 'fill':     initFillTab(); break;
    case 'log':      renderLog(); break;
    case 'me':       initMeTab(); break;
    case 'setup':    initSetupTab(); break;
  }
}

// ─── Header Status ────────────────────────────────────────────────────────────

function setHeaderStatus(state, text) {
  const chip = $('hdr-status');
  const txt = $('hdr-status-text');
  chip.className = `p-status ${state}`;
  txt.textContent = text;
}

async function checkOllamaStatus() {
  setHeaderStatus('warn', 'Connecting…');
  const result = await testConnection();
  if (result.ok) {
    setHeaderStatus('ok', `Ollama ✓`);
    populateModelSelectors(result.models);
    if (result.models.length > 0 && !result.models.includes(currentModel)) {
      currentModel = result.models[0];
    }
  } else if (result.error === 'cors') {
    setHeaderStatus('err', 'CORS Error');
    showJobCorsState();
  } else {
    setHeaderStatus('err', 'Offline');
  }
  return result;
}

function populateModelSelectors(models) {
  if (!models || models.length === 0) return;
  const selectors = ['me-model', 'setup-model'];
  selectors.forEach(id => {
    const sel = $(id);
    if (!sel) return;
    const current = sel.value || currentModel;
    sel.innerHTML = '';
    models.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m;
      opt.textContent = m;
      if (m === current) opt.selected = true;
      sel.appendChild(opt);
    });
  });
  // Update gen button label
  const genLabel = $('gen-model-label');
  if (genLabel) genLabel.textContent = currentModel;
}

// ─── Job Tab ──────────────────────────────────────────────────────────────────

function initJobTab() {
  requestJobData();
}

async function requestJobData() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      showJobEmpty();
      return;
    }

    const site = detectSite(tab.url || '');
    if (!site) {
      showJobEmpty();
      return;
    }

    try {
      const response = await chrome.tabs.sendMessage(tab.id, { type: 'REQUEST_JOB_DATA' });
      if (response && response.payload) {
        currentJobData = response.payload;
        renderJobData(currentJobData);
      } else {
        showJobEmpty();
      }
    } catch {
      // Content script may not be ready yet
      showJobEmpty();
    }
  } catch (e) {
    showJobEmpty();
  }
}

function showJobEmpty() {
  $('job-empty').classList.remove('hidden');
  $('job-cors').classList.add('hidden');
  $('job-data').classList.add('hidden');
}

function showJobCorsState() {
  $('job-empty').classList.add('hidden');
  $('job-cors').classList.remove('hidden');
  $('job-data').classList.add('hidden');
}

function showJobData() {
  $('job-empty').classList.add('hidden');
  $('job-cors').classList.add('hidden');
  $('job-data').classList.remove('hidden');
}

function renderJobData(data) {
  showJobData();

  $('job-title').textContent = data.title || 'Unknown Role';
  $('job-company').textContent = data.company ? `${data.company}${data.location ? ' · ' + data.location : ''}` : '—';

  // Chips
  const chipsEl = $('job-chips');
  chipsEl.innerHTML = '';

  if (data.site) {
    const siteNames = { linkedin: 'LinkedIn', jobright: 'Jobright', indeed: 'Indeed', greenhouse: 'Greenhouse', lever: 'Lever', workday: 'Workday' };
    chipsEl.appendChild(makeChip(siteNames[data.site] || data.site, 'chip-site'));
  }
  if (data.easyApply) chipsEl.appendChild(makeChip('⚡ Easy Apply', 'chip-easy'));
  if (data.salary) chipsEl.appendChild(makeChip(data.salary, 'chip-salary'));
  if (data.remote === 'remote') chipsEl.appendChild(makeChip('Remote', 'chip-remote'));
  if (data.remote === 'hybrid') chipsEl.appendChild(makeChip('Hybrid', 'chip-hybrid'));
  if (data.remote === 'onsite') chipsEl.appendChild(makeChip('Onsite', 'chip-onsite'));
  if (data.sponsorship) chipsEl.appendChild(makeChip('Visa Sponsor', 'chip-visa'));

  // Reset ATS ring
  const ring = $('ats-ring-circle');
  ring.style.strokeDashoffset = '188.5';
  ring.className = 'ats-ring-fill';
  $('ats-score-num').textContent = '—';
  $('ats-ring-title').textContent = 'Run Analysis';
  $('ats-ring-desc').textContent = 'Click Analyze to compute your ATS match score against this job description.';
  $('match-bars').style.display = 'none';
  $('skills-section').style.display = 'none';
}

function makeChip(text, cls) {
  const span = document.createElement('span');
  span.className = `chip ${cls}`;
  span.textContent = text;
  return span;
}

// ─── ATS Analysis ─────────────────────────────────────────────────────────────

$('btn-analyze').addEventListener('click', async () => {
  if (!currentJobData) { showToast('No job data to analyze'); return; }
  if (!currentProfile) currentProfile = await getProfile();

  const btn = $('btn-analyze');
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner dark"></div> Analyzing…';

  const keywords = extractKeywords(currentJobData.description || '');
  const userSkills = currentProfile.skills || [];
  matchResult = computeMatchScore(userSkills, keywords);
  currentJobData.matchResult = matchResult;

  // Animate ring
  const overall = matchResult.overall;
  const circumference = 188.5;
  const offset = circumference - (overall / 100) * circumference;
  const ring = $('ats-ring-circle');

  ring.className = 'ats-ring-fill' + (overall >= 80 ? '' : overall >= 60 ? ' warn' : ' bad');
  setTimeout(() => { ring.style.strokeDashoffset = offset; }, 50);

  $('ats-score-num').textContent = overall;

  const quality = overall >= 80 ? 'Strong match' : overall >= 60 ? 'Decent match' : 'Needs work';
  $('ats-ring-title').textContent = quality;
  $('ats-ring-desc').textContent = `${matchResult.matched.length} matched · ${matchResult.partial.length} partial · ${matchResult.missing.length} missing`;

  // Match bars
  $('match-bars').style.display = 'block';
  animateBar('bar-overall', 'pct-overall', matchResult.overall);
  animateBar('bar-skills', 'pct-skills', matchResult.skills);
  animateBar('bar-exp', 'pct-exp', matchResult.experience);

  // Skill chips
  $('skills-section').style.display = 'block';
  const chipsEl = $('sk-chips');
  chipsEl.innerHTML = '';

  matchResult.matched.slice(0, 15).forEach(k => chipsEl.appendChild(makeSkChip(k, 'sk-y')));
  matchResult.partial.slice(0, 10).forEach(k => chipsEl.appendChild(makeSkChip(k, 'sk-m')));
  matchResult.missing.slice(0, 15).forEach(k => chipsEl.appendChild(makeSkChip(k, 'sk-n')));

  btn.disabled = false;
  btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg> Re-analyze`;
});

function animateBar(barId, pctId, value) {
  const bar = $(barId);
  const pct = $(pctId);
  const cls = value >= 80 ? '' : value >= 60 ? ' warn' : ' bad';
  bar.className = `match-bar-fill${cls}`;
  setTimeout(() => { bar.style.width = value + '%'; }, 50);
  pct.textContent = value + '%';
}

function makeSkChip(text, cls) {
  const span = document.createElement('span');
  span.className = `sk ${cls}`;
  span.textContent = text;
  return span;
}

// Log current job application
$('btn-log-job').addEventListener('click', async () => {
  if (!currentJobData) { showToast('No job to log'); return; }
  await addLogEntry({
    company: currentJobData.company || 'Unknown',
    role: currentJobData.title || 'Unknown',
    date: new Date().toISOString().split('T')[0],
    status: 'Applied',
    source: currentJobData.site || ''
  });
  await incrementStat('applied');
  showToast('✓ Application logged');
  await chrome.runtime.sendMessage({ type: 'INCREMENT_STAT', key: 'applied' }).catch(() => {});
});

// Go to Generate tab
$('btn-go-generate').addEventListener('click', () => {
  $$('.p-tab').forEach(t => t.classList.remove('on'));
  $$('.tab-panel').forEach(p => p.classList.remove('active'));
  const genTab = document.querySelector('.p-tab[data-tab="generate"]');
  if (genTab) genTab.classList.add('on');
  $('panel-generate').classList.add('active');
  onTabActivated('generate');
});

// CORS test button on job tab
$('job-cors-test-btn').addEventListener('click', async () => {
  await checkOllamaStatus();
});

// CORS OS tab switching (job tab)
$$('#job-cors-os-tabs .os-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    $$('#job-cors-os-tabs .os-tab').forEach(t => t.classList.remove('on'));
    tab.classList.add('on');
    const os = tab.dataset.os;
    [$('job-cors-mac'), $('job-cors-win'), $('job-cors-linux')].forEach(p => p.classList.remove('on'));
    $(`job-cors-${os}`).classList.add('on');
  });
});

// ─── Generate Tab ─────────────────────────────────────────────────────────────

async function initGenerateTab() {
  // Show warning if no job
  if (currentJobData) {
    $('gen-no-job').classList.add('hidden');
  } else {
    $('gen-no-job').classList.remove('hidden');
  }
  // Update model label from stored settings
  try {
    const { settings } = await chrome.storage.local.get('settings');
    if (settings?.model) {
      currentModel = settings.model;
      const lbl = $('gen-model-label');
      if (lbl) lbl.textContent = currentModel;
    }
  } catch { /* settings not yet set */ }
}

// Mode selection
$$('.mode-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    $$('.mode-btn').forEach(b => b.classList.remove('on'));
    btn.classList.add('on');
    currentMode = btn.dataset.mode;
  });
});

// Main generate button
$('btn-generate').addEventListener('click', () => runGenerate());

// Custom prompt send button
$('btn-send-custom').addEventListener('click', () => {
  const custom = $('custom-prompt').value.trim();
  if (!custom) return;
  runGenerate(custom);
});

async function runGenerate(customInstruction = null) {
  if (isStreaming) return;
  if (!currentProfile) currentProfile = await getProfile();

  // Get model from settings
  const { settings } = await chrome.storage.local.get('settings').catch(() => ({ settings: null }));
  currentModel = settings?.model || currentModel;

  let prompt = buildPrompt(currentMode, currentProfile, currentJobData);
  if (customInstruction) {
    prompt = `${prompt}\n\nAdditional instruction: ${customInstruction}`;
  }

  const box = $('output-box');
  const btn = $('btn-generate');
  isStreaming = true;
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner"></div> Generating…';

  // Clear output and add cursor
  box.innerHTML = '<span id="stream-cursor" class="cursor"></span>';

  let fullText = '';

  await streamGenerate(
    prompt,
    currentModel,
    (token) => {
      fullText += token;
      // Insert before cursor
      const cursor = $('stream-cursor');
      if (cursor) {
        box.insertBefore(document.createTextNode(token), cursor);
      } else {
        box.textContent += token;
      }
      box.scrollTop = box.scrollHeight;
    },
    async () => {
      // Done
      const cursor = $('stream-cursor');
      if (cursor) cursor.remove();
      isStreaming = false;
      btn.disabled = false;
      btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M5 12h14M12 5l7 7-7 7"/></svg> Generate with <span id="gen-model-label">${currentModel}</span>`;
      await incrementStat('generated');
      chrome.runtime.sendMessage({ type: 'INCREMENT_STAT', key: 'generated' }).catch(() => {});
    },
    (err) => {
      const cursor = $('stream-cursor');
      if (cursor) cursor.remove();
      isStreaming = false;
      btn.disabled = false;
      btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M5 12h14M12 5l7 7-7 7"/></svg> Generate with <span id="gen-model-label">${currentModel}</span>`;

      let errMsg = 'Generation failed.';
      if (err === 'cors') errMsg = 'CORS error — restart Ollama with OLLAMA_ORIGINS=*';
      else if (err === 'offline') errMsg = 'Ollama is offline. Start it with: ollama serve';
      else if (err) errMsg = `Error: ${err}`;

      box.textContent = `⚠ ${errMsg}`;
      setHeaderStatus('err', err === 'cors' ? 'CORS Error' : 'Offline');
    }
  );
}

// Copy output button
$('btn-copy-output').addEventListener('click', () => {
  const text = $('output-box').textContent;
  copyToClipboard(text, $('btn-copy-output'));
});

// ─── Fill Tab ─────────────────────────────────────────────────────────────────

async function initFillTab() {
  if (!currentProfile) currentProfile = await getProfile();
  const p = currentProfile;

  function setField(id, val) {
    const el = $(id);
    if (el) {
      el.textContent = val || '—';
      el.classList.toggle('empty', !val);
    }
  }

  setField('af-name', p.name);
  setField('af-email', p.email);
  setField('af-phone', p.phone);
  setField('af-linkedin', p.linkedin);
  setField('af-github', p.github);
  setField('af-summary', p.summary);
}

// Autofill kit copy buttons
$$('.af-copy').forEach(btn => {
  btn.addEventListener('click', () => {
    const fieldId = btn.dataset.field;
    const val = $(fieldId)?.textContent;
    if (val && val !== '—') copyToClipboard(val, btn);
    else showToast('Nothing to copy — fill out your profile first');
  });
});

// Auto-fill page
$('btn-autofill').addEventListener('click', async () => {
  const btn = $('btn-autofill');
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner"></div> Filling…';

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) { showToast('No active tab found'); return; }

    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content/autofill.js']
    });
    showToast('✓ Autofill injected');
  } catch (e) {
    showToast('Could not inject autofill: ' + (e.message || 'Check permissions'));
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M12 5v14M5 12h14"/></svg> Auto-fill Page`;
  }
});

// Clear fields
$('btn-clear-fields').addEventListener('click', async () => {
  if (!confirm('Clear all autofill kit values? This does not delete your profile.')) return;
  ['af-name', 'af-email', 'af-phone', 'af-linkedin', 'af-github', 'af-summary'].forEach(id => {
    const el = $(id);
    if (el) { el.textContent = '—'; el.classList.add('empty'); }
  });
  showToast('Fields cleared');
});

// ─── Log Tab ──────────────────────────────────────────────────────────────────

async function renderLog() {
  const [log, stats] = await Promise.all([getLog(), getStats()]);

  // Stats
  $('stat-applied').textContent = stats.applied || 0;
  $('stat-generated').textContent = stats.generated || 0;
  $('stat-filled').textContent = stats.filled || 0;
  $('stat-saved').textContent = stats.saved || 0;

  // Log list
  const listEl = $('log-list');
  const emptyEl = $('log-empty');
  listEl.innerHTML = '';

  if (!log || log.length === 0) {
    emptyEl.style.display = 'flex';
    return;
  }

  emptyEl.style.display = 'none';
  log.forEach(entry => listEl.appendChild(makeLogEntry(entry)));
}

function makeLogEntry(entry) {
  const div = document.createElement('div');
  div.className = 'log-entry';
  div.dataset.id = entry.id;

  const statusClass = (entry.status || 'applied').toLowerCase();

  div.innerHTML = `
    <div class="log-info">
      <div class="log-company">${escape(entry.company)}</div>
      <div class="log-role">${escape(entry.role)}</div>
    </div>
    <span class="log-date">${entry.date || ''}</span>
    <span class="log-status ${statusClass}">${entry.status || 'Applied'}</span>
    <button class="log-delete" title="Delete entry">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M18 6 6 18M6 6l12 12"/></svg>
    </button>
  `;

  div.querySelector('.log-delete').addEventListener('click', async (e) => {
    e.stopPropagation();
    const confirmed = confirm(`Remove "${entry.role}" at "${entry.company}"?`);
    if (!confirmed) return;
    await deleteLogEntry(entry.id);
    div.remove();
    showToast('Entry removed');
    // Check if list is now empty
    const listEl = $('log-list');
    if (!listEl.querySelector('.log-entry')) {
      $('log-empty').style.display = 'flex';
    }
  });

  return div;
}

function escape(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ─── Me Tab (Profile) ─────────────────────────────────────────────────────────

async function initMeTab() {
  currentProfile = await getProfile();
  const { settings } = await chrome.storage.local.get('settings').catch(() => ({ settings: null }));
  if (settings?.model) currentModel = settings.model;

  // Populate form fields
  $('me-name').value = currentProfile.name || '';
  $('me-email').value = currentProfile.email || '';
  $('me-phone').value = currentProfile.phone || '';
  $('me-linkedin').value = currentProfile.linkedin || '';
  $('me-github').value = currentProfile.github || '';
  $('me-summary').value = currentProfile.summary || '';

  // Render skill tags
  renderSkillTags(currentProfile.skills || []);

  // Model selector
  const modelSel = $('me-model');
  if (modelSel && settings?.model) {
    // Try to select matching option
    for (const opt of modelSel.options) {
      if (opt.value === settings.model) { opt.selected = true; break; }
    }
  }
}

function renderSkillTags(skills) {
  const container = $('skill-tags');
  container.innerHTML = '';
  (skills || []).forEach(skill => {
    const tag = document.createElement('span');
    tag.className = 'skill-tag';
    tag.textContent = skill;

    const xBtn = document.createElement('button');
    xBtn.className = 'skill-tag-x';
    xBtn.textContent = '×';
    xBtn.addEventListener('click', () => {
      tag.remove();
    });

    tag.appendChild(xBtn);
    container.appendChild(tag);
  });
}

// Add skill on Enter or button click
$('me-skills-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); addSkillFromInput(); }
});
$('btn-add-skill').addEventListener('click', addSkillFromInput);

function addSkillFromInput() {
  const input = $('me-skills-input');
  const raw = input.value.trim();
  if (!raw) return;

  // Support comma-separated
  const skills = raw.split(',').map(s => s.trim()).filter(Boolean);
  skills.forEach(skill => {
    const tag = document.createElement('span');
    tag.className = 'skill-tag';
    tag.textContent = skill;

    const xBtn = document.createElement('button');
    xBtn.className = 'skill-tag-x';
    xBtn.textContent = '×';
    xBtn.addEventListener('click', () => tag.remove());

    tag.appendChild(xBtn);
    $('skill-tags').appendChild(tag);
  });

  input.value = '';
}

// Auto-save on blur (individual fields)
['me-name', 'me-email', 'me-phone', 'me-linkedin', 'me-github', 'me-summary'].forEach(id => {
  const el = $(id);
  if (el) {
    el.addEventListener('blur', async () => {
      await quickSaveField(id);
    });
  }
});

async function quickSaveField(id) {
  const fieldMap = {
    'me-name': 'name', 'me-email': 'email', 'me-phone': 'phone',
    'me-linkedin': 'linkedin', 'me-github': 'github', 'me-summary': 'summary'
  };
  const key = fieldMap[id];
  if (!key) return;
  const val = $(id).value;
  await saveProfile({ [key]: val });
  if (currentProfile) currentProfile[key] = val;
}

// Save profile button
$('btn-save-profile').addEventListener('click', async () => {
  const btn = $('btn-save-profile');
  btn.disabled = true;

  // Collect skills from rendered tags
  const skills = [...$$('#skill-tags .skill-tag')].map(t => {
    // tag text content includes the × character, strip it
    return t.childNodes[0]?.textContent?.trim() || '';
  }).filter(Boolean);

  const profileData = {
    name: $('me-name').value.trim(),
    email: $('me-email').value.trim(),
    phone: $('me-phone').value.trim(),
    linkedin: $('me-linkedin').value.trim(),
    github: $('me-github').value.trim(),
    summary: $('me-summary').value.trim(),
    skills
  };

  currentProfile = await saveProfile(profileData);

  // Save model setting
  const selectedModel = $('me-model').value;
  if (selectedModel) {
    currentModel = selectedModel;
    const { settings } = await chrome.storage.local.get('settings').catch(() => ({ settings: {} }));
    await chrome.storage.local.set({ settings: { ...(settings || {}), model: selectedModel } });
    const lbl = $('gen-model-label');
    if (lbl) lbl.textContent = selectedModel;

    // Sync setup model selector
    const setupSel = $('setup-model');
    if (setupSel) {
      for (const opt of setupSel.options) {
        if (opt.value === selectedModel) { opt.selected = true; break; }
      }
    }
  }

  await incrementStat('saved');

  btn.disabled = false;
  btn.textContent = '✓ Saved';
  setTimeout(() => (btn.textContent = 'Save Profile'), 2000);
  showToast('✓ Profile saved');
});

// ─── Setup Tab ────────────────────────────────────────────────────────────────

async function initSetupTab() {
  updateSetupStatus('warn', 'Checking…', '');

  const result = await testConnection();
  if (result.ok) {
    updateSetupStatus('ok', `Connected · ${result.models.length} model${result.models.length !== 1 ? 's' : ''}`, 'http://localhost:11434');
    populateModelSelectors(result.models);
  } else if (result.error === 'cors') {
    updateSetupStatus('err', 'CORS Error', 'Ollama is running but blocked by browser');
  } else {
    updateSetupStatus('err', 'Offline', 'Ollama is not running');
  }

  // Sync model selector
  const { settings } = await chrome.storage.local.get('settings').catch(() => ({ settings: null }));
  if (settings?.model) {
    const sel = $('setup-model');
    if (sel) {
      for (const opt of sel.options) {
        if (opt.value === settings.model) { opt.selected = true; break; }
      }
    }
  }
}

function updateSetupStatus(state, text, sub) {
  const dot = $('setup-dot');
  const statusText = $('setup-status-text');
  const statusSub = $('setup-status-sub');

  dot.className = `status-dot ${state}`;
  statusText.textContent = text;
  if (sub !== undefined) statusSub.textContent = sub;
}

$('btn-test-connection').addEventListener('click', async () => {
  const btn = $('btn-test-connection');
  btn.disabled = true;
  btn.textContent = '…';

  const result = await testConnection();
  if (result.ok) {
    updateSetupStatus('ok', `Connected · ${result.models.length} model(s)`, 'http://localhost:11434');
    setHeaderStatus('ok', 'Ollama ✓');
    populateModelSelectors(result.models);
  } else if (result.error === 'cors') {
    updateSetupStatus('err', 'CORS Error', 'Restart Ollama with OLLAMA_ORIGINS=*');
    setHeaderStatus('err', 'CORS Error');
  } else {
    updateSetupStatus('err', 'Offline', 'Run: ollama serve');
    setHeaderStatus('err', 'Offline');
  }

  btn.disabled = false;
  btn.textContent = 'Test';
});

// Setup model selector sync
$('setup-model').addEventListener('change', async () => {
  const val = $('setup-model').value;
  currentModel = val;
  const { settings } = await chrome.storage.local.get('settings').catch(() => ({ settings: {} }));
  await chrome.storage.local.set({ settings: { ...(settings || {}), model: val } });

  // Sync me tab selector
  const meSel = $('me-model');
  if (meSel) {
    for (const opt of meSel.options) {
      if (opt.value === val) { opt.selected = true; break; }
    }
  }

  showToast(`Model set to ${val}`);
});

// OS tab switching (setup tab)
$$('#setup-os-tabs .os-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    $$('#setup-os-tabs .os-tab').forEach(t => t.classList.remove('on'));
    tab.classList.add('on');
    const os = tab.dataset.os;
    [$('setup-cors-mac'), $('setup-cors-win'), $('setup-cors-linux')].forEach(p => {
      if (p) p.classList.remove('on');
    });
    $(`setup-cors-${os}`)?.classList.add('on');
  });
});

// ─── Code block copy buttons ──────────────────────────────────────────────────

document.addEventListener('click', (e) => {
  if (e.target.classList.contains('code-copy-btn')) {
    const block = e.target.closest('.code-block');
    if (!block) return;
    const text = block.childNodes[0]?.textContent?.trim() || '';
    copyToClipboard(text, e.target);
  }
});

// ─── Listen for job data pushed from content script ───────────────────────────

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'JOB_DATA' && msg.payload) {
    currentJobData = msg.payload;
    // If job tab is visible, re-render
    const jobPanel = $('panel-job');
    if (jobPanel && jobPanel.classList.contains('active')) {
      renderJobData(currentJobData);
    }
  }
});

// ─── Init ─────────────────────────────────────────────────────────────────────

async function init() {
  // Load profile
  currentProfile = await getProfile().catch(() => null);

  // Load settings for model
  const { settings } = await chrome.storage.local.get('settings').catch(() => ({ settings: null }));
  if (settings?.model) currentModel = settings.model;

  // Check Ollama in background
  checkOllamaStatus();

  // Initialize first tab
  initJobTab();
}

init();
