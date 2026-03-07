// popup.js — JobHunt AI Copilot v3
// 100% designed for Prasanna Kumar Nagaboyina

"use strict";

// ── STATE ─────────────────────────────────────────────────────────────────────
let state = {
  currentTab:     "job",
  ollamaOnline:   false,
  currentJD:      "",
  currentJob:     null,   // { title, company, location, site, url, visaSponsor }
  lastReport:     "",
  lastResumeHTML: "",
  lastCoverLetter:"",
  lastBullets:    "",
  lastPitch:      "",
  lastAtsScore:   0,
  isGenerating:   false,
  generateMode:   "both",
  genAbortToken:  null,   // set on generate, used to cancel
};

// ── INIT ──────────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", async () => {
  await seedIfEmpty();
  setupTabs();
  setupListeners();
  await loadProfileUI();
  await checkOllamaStatus();
  await restoreSession();
  await detectCurrentPage();
  refreshLogUI();
  refreshFillUI();
});

// ── TAB SWITCHING ─────────────────────────────────────────────────────────────
function setupTabs() {
  document.querySelectorAll(".p-tab").forEach(t => {
    t.addEventListener("click", () => switchTab(t.dataset.tab));
  });
}
function switchTab(id) {
  state.currentTab = id;
  document.querySelectorAll(".p-tab").forEach(t =>
    t.classList.toggle("on", t.dataset.tab === id)
  );
  document.querySelectorAll(".panel").forEach(p =>
    p.classList.toggle("on", p.id === `panel-${id}`)
  );
  if (id === "log")  refreshLogUI();
  if (id === "fill") refreshFillUI();
  if (id === "me")   loadProfileUI();
  if (id === "setup") refreshSetupUI();
}
function goToFill() { switchTab("fill"); }

// ── OLLAMA STATUS ─────────────────────────────────────────────────────────────
async function checkOllamaStatus(silent = false) {
  const chip = document.getElementById("statusChip");
  const dot  = document.getElementById("statusDot");
  const lbl  = document.getElementById("statusLbl");
  if (!silent) {
    chip.className = "status-chip";
    dot.className  = "s-dot";
    lbl.textContent = "checking…";
  }
  try {
    const r = await bg({ action: "checkOllama" });
    if (r?.online) {
      state.ollamaOnline = true;
      chip.className = "status-chip ok";
      dot.className  = "s-dot ok";
      lbl.textContent = r.model || "Ollama ✓";
      hideCors();
      document.getElementById("offlineNotice").style.display = "none";
      document.getElementById("setupOnlineNote").style.display = "flex";
      document.getElementById("setupOfflineNote").style.display = "none";
      if (r.models?.length) populateModelSelect(r.models);
    } else {
      setOffline(r?.error);
    }
  } catch (e) {
    setOffline(e?.message);
  }
}
function setOffline(reason) {
  state.ollamaOnline = false;
  const chip = document.getElementById("statusChip");
  const dot  = document.getElementById("statusDot");
  const lbl  = document.getElementById("statusLbl");
  chip.className = "status-chip err";
  dot.className  = "s-dot off";
  const isCors = reason?.includes("403") || reason?.includes("cors") || reason?.includes("CORS");
  lbl.textContent = isCors ? "CORS Error" : "Offline";
  if (isCors) showCors();
  else {
    hideCors();
    document.getElementById("offlineNotice").style.display = "";
  }
  document.getElementById("setupOnlineNote").style.display = "none";
  document.getElementById("setupOfflineNote").style.display = "flex";
}

// ── CORS WIZARD ───────────────────────────────────────────────────────────────
const CORS_CMDS = {
  mac: {
    cmd: `launchctl setenv OLLAMA_ORIGINS "*"\npkill Ollama\nopen /Applications/Ollama.app`,
    note: "Paste into Terminal. Sets env var permanently. If Ollama isn't in Applications: OLLAMA_ORIGINS=\"*\" ollama serve"
  },
  win: {
    cmd: `setx OLLAMA_ORIGINS "*"\ntaskkill /IM "ollama app.exe" /F\nstart "" "%LOCALAPPDATA%\\Programs\\Ollama\\ollama app.exe"`,
    note: "Paste into Command Prompt (run as Admin). setx makes it permanent across restarts."
  },
  lin: {
    cmd: `echo 'export OLLAMA_ORIGINS="*"' >> ~/.bashrc\nsource ~/.bashrc\npkill -f "ollama serve"\nOLLAMA_ORIGINS="*" ollama serve &`,
    note: "Using systemd? sudo systemctl edit ollama → add Environment=OLLAMA_ORIGINS=* → sudo systemctl restart ollama"
  }
};
function showCors() {
  document.getElementById("corsBox").style.display = "";
}
function hideCors() {
  document.getElementById("corsBox").style.display = "none";
}
function showOsCmd(os, el) {
  document.querySelectorAll(".os-tab").forEach(t => t.classList.remove("on"));
  el.classList.add("on");
  const { cmd, note } = CORS_CMDS[os];
  document.getElementById("cmdText").textContent = cmd;
  document.getElementById("cmdNote").textContent = note;
  document.getElementById("cmdArea").style.display = "";
}
function copyCmd(el) {
  navigator.clipboard.writeText(el.textContent).then(() => {
    el.classList.add("copied");
    setTimeout(() => el.classList.remove("copied"), 2000);
  });
}
async function recheckCors() {
  await checkOllamaStatus();
  if (state.ollamaOnline) showToast("ok", "Connected! CORS is fixed.");
  else showToast("err", "Still offline. Make sure Ollama restarted.");
}

// ── PAGE DETECTION ────────────────────────────────────────────────────────────
async function detectCurrentPage() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !tab.url || tab.url.startsWith("chrome://") || tab.url.startsWith("chrome-extension://")) {
      showJobState("empty");
      return;
    }
    const result = await chrome.tabs.sendMessage(tab.id, { action: "scrapeJD" }).catch(() => null);
    if (!result?.success || !result.data) {
      showJobState("empty");
      return;
    }
    const { data } = result;
    if (!data.description || data.description.length < 50) {
      showJobState("empty");
      return;
    }
    state.currentJD  = data.description;
    state.currentJob = data;
    document.getElementById("jdInput").value = state.currentJD;
    document.getElementById("charCount").textContent = state.currentJD.length.toLocaleString();
    showJobCard(data);
  } catch {
    showJobState("empty");
  }
}

function showJobState(mode) {
  // mode: 'empty' | 'card' | 'progress'
  document.getElementById("noJobState").style.display    = mode === "empty"    ? "" : "none";
  document.getElementById("jobCardState").style.display  = mode === "card"     ? "" : "none";
  document.getElementById("progressZone").style.display  = mode === "progress" ? "" : "none";
}

function showJobCard(data) {
  showJobState("card");
  const src = data.site || "generic";
  const srcEl = document.getElementById("jcSource");
  srcEl.textContent = capitalize(src);
  srcEl.className   = "src-tag " + (src === "linkedin" ? "src-li" : src === "indeed" ? "src-ind" : src === "jobright" ? "src-jr" : "src-gen");

  if (data.easyApply) document.getElementById("jcEasyApply").style.display = "";
  else document.getElementById("jcEasyApply").style.display = "none";

  document.getElementById("jcTitle").textContent   = data.title || "Unknown Position";
  document.getElementById("jcCompany").textContent = data.company || "Unknown Company";

  if (data.location) {
    document.getElementById("jcLocSep").style.display = "";
    document.getElementById("jcLocation").textContent = data.location;
  }

  // Chips
  const chips = document.getElementById("jcChips");
  chips.innerHTML = "";
  if (data.visaSponsor) chips.innerHTML += `<span class="chip chip-visa">✓ Visa Sponsor</span>`;
  if (data.remote || (data.location || "").toLowerCase().includes("remote")) chips.innerHTML += `<span class="chip chip-remote">Remote</span>`;
  if (data.salary) chips.innerHTML += `<span class="chip chip-sal">${escHtml(data.salary)}</span>`;

  // Skill match (async)
  computeSkillMatch(data.description).then(({ pct, matched, missing, partial }) => {
    if (pct === null) return;
    const matchRow = document.getElementById("matchRow");
    matchRow.style.display = "";
    const fill = document.getElementById("matchFill");
    const pctEl = document.getElementById("matchPct");
    setTimeout(() => { fill.style.width = pct + "%"; }, 100);
    fill.className = "match-fill" + (pct >= 70 ? "" : pct >= 50 ? " mid" : " low");
    pctEl.textContent = pct + "%";
    pctEl.className   = "match-pct " + (pct >= 70 ? "pct-hi" : pct >= 50 ? "pct-mid" : "pct-low");

    const skRow = document.getElementById("skRow");
    skRow.innerHTML = "";
    matched.slice(0,6).forEach(s => skRow.innerHTML += `<span class="sk sk-y">✓ ${escHtml(s)}</span>`);
    partial.slice(0,3).forEach(s => skRow.innerHTML += `<span class="sk sk-m">~ ${escHtml(s)}</span>`);
    missing.slice(0,3).forEach(s => skRow.innerHTML += `<span class="sk sk-n">✗ ${escHtml(s)}</span>`);
  });
}

async function computeSkillMatch(jd) {
  if (!jd) return { pct: null, matched: [], missing: [], partial: [] };
  try {
    const settings = await chrome.storage.local.get(["resumeData"]);
    const rd = JSON.parse(settings.resumeData || "{}");
    const skills = rd.skills || [];
    if (!skills.length) return { pct: null, matched: [], missing: [], partial: [] };

    const jdL = jd.toLowerCase();
    const matched = [], partial = [], missing = [];
    for (const sk of skills) {
      const skL = sk.toLowerCase();
      if (jdL.includes(skL)) matched.push(sk);
      else if (skL.length > 3 && jdL.includes(skL.substring(0, Math.floor(skL.length * 0.7)))) partial.push(sk);
    }
    // Extract top JD keywords not in skills
    const jdWords = jd.match(/\b[A-Z][a-zA-Z0-9+#.]+\b/g) || [];
    const jdKeywords = [...new Set(jdWords)].filter(w => w.length > 2 && !skills.some(s => s.toLowerCase() === w.toLowerCase()));
    jdKeywords.slice(0, 5).forEach(w => {
      if (!matched.includes(w) && !partial.includes(w)) missing.push(w);
    });

    const pct = skills.length > 0
      ? Math.min(99, Math.round(((matched.length + partial.length * 0.5) / Math.min(skills.length, 15)) * 100))
      : null;
    return { pct, matched, partial, missing: missing.slice(0, 3) };
  } catch {
    return { pct: null, matched: [], missing: [], partial: [] };
  }
}

// ── GENERATE FLOW ─────────────────────────────────────────────────────────────
function setupListeners() {
  document.getElementById("btnRefresh").addEventListener("click", () => checkOllamaStatus());
  document.getElementById("btnCancelAnalysis").addEventListener("click", cancelGeneration);
  document.getElementById("btnCancelGen").addEventListener("click", cancelGeneration);
  document.getElementById("btnGenerateApply").addEventListener("click", () => {
    if (state.currentJD) startGeneration();
    else {
      showToast("err", "No JD detected. Paste one in Generate tab.");
      switchTab("generate");
    }
  });
  document.getElementById("btnGenerateMain").addEventListener("click", () => {
    const jd = document.getElementById("jdInput").value.trim();
    if (!jd || jd.length < 30) { showToast("err", "Please paste a job description first."); return; }
    state.currentJD = jd;
    startGeneration();
  });
  document.getElementById("btnOpenJob").addEventListener("click", () => {
    if (state.currentJob?.url) chrome.tabs.create({ url: state.currentJob.url });
  });
  document.getElementById("jdInput").addEventListener("input", function() {
    document.getElementById("charCount").textContent = this.value.length.toLocaleString();
    state.currentJD = this.value;
  });
  document.querySelectorAll(".mode-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".mode-btn").forEach(b => b.classList.remove("on"));
      btn.classList.add("on");
      state.generateMode = btn.dataset.mode;
    });
  });
  document.getElementById("btnSaveProfile").addEventListener("click", saveProfile);
  document.getElementById("btnResetProfile").addEventListener("click", resetToDefaults);
  document.getElementById("btnAutofill").addEventListener("click", doAutofill);
  document.getElementById("btnTestConnection").addEventListener("click", async () => {
    await checkOllamaStatus();
    refreshSetupUI();
  });
}

async function startGeneration() {
  if (state.isGenerating) return;
  if (!state.ollamaOnline) {
    const r = await bg({ action: "checkOllama" }).catch(() => null);
    if (!r?.online) { showToast("err", "Ollama is offline. Check Setup tab."); showCors(); return; }
    state.ollamaOnline = true;
  }

  state.isGenerating = true;
  const jd = state.currentJD || document.getElementById("jdInput").value.trim();
  if (!jd || jd.length < 30) { state.isGenerating = false; showToast("err", "Paste a job description first."); return; }

  // Switch to generate tab and show progress
  switchTab("generate");
  document.getElementById("genProgressZone").style.display = "";
  document.getElementById("genMainBtn").style.display = "none";
  document.getElementById("genResults").style.display = "none";
  document.getElementById("jdInputArea").style.display = "none";
  document.getElementById("genStreamBox").textContent = "";
  document.getElementById("genProgressMsg").textContent = "Sending to Ollama…";

  // Also show progress on job tab
  if (state.currentTab === "job") showJobState("progress");

  // Get settings
  const settings = await chrome.storage.local.get([
    "firstName","lastName","email","phone","location","linkedin","github","website","portfolio",
    "resumeData","ollamaUrl","ollamaModel","visaStatus"
  ]);
  const mode = state.generateMode;
  const custom = document.getElementById("customInstructions").value.trim();

  try {
    const result = await bg({
      action: "generate",
      jd,
      profile: settings,
      mode,
      customInstructions: custom
    });

    state.isGenerating = false;
    document.getElementById("genProgressZone").style.display = "none";
    document.getElementById("jdInputArea").style.display = "";
    showJobState(state.currentJob ? "card" : "empty");

    if (!result.success) {
      document.getElementById("genMainBtn").style.display = "";
      if (result.error === "CANCELLED") { showToast("ok", "Generation cancelled."); return; }
      if (result.error?.includes("403") || result.error?.includes("CORS")) showCors();
      else if (result.error?.includes("not found") || result.error?.includes("404")) {
        showToast("err", `Model not found. Run: ollama pull ${await getModel()}`);
      } else {
        showToast("err", result.error || "Generation failed.");
      }
      document.getElementById("genMainBtn").style.display = "";
      return;
    }

    // Store results
    state.lastReport      = result.report     || "";
    state.lastResumeHTML  = result.resumeHTML  || "";
    state.lastCoverLetter = result.coverLetter || "";
    state.lastBullets     = result.bullets     || "";
    state.lastPitch       = result.pitch       || "";
    state.lastAtsScore    = result.atsScore    || 0;

    // Save session
    await chrome.storage.local.set({ lastSession: {
      report: state.lastReport, resumeHTML: state.lastResumeHTML,
      coverLetter: state.lastCoverLetter, bullets: state.lastBullets,
      pitch: state.lastPitch, atsScore: state.lastAtsScore,
      jd, savedAt: Date.now(), job: state.currentJob
    }});

    // Log the application
    await logApplication(state.currentJob, jd);

    renderGenerationResults();
    refreshFillUI();
    refreshLogUI();

    // Show "view report" button on job tab if there
    document.getElementById("genMainBtn").style.display = "";

  } catch (e) {
    state.isGenerating = false;
    document.getElementById("genProgressZone").style.display = "none";
    document.getElementById("jdInputArea").style.display = "";
    document.getElementById("genMainBtn").style.display = "";
    showJobState(state.currentJob ? "card" : "empty");
    if (!isPortClosed(e)) showToast("err", e?.message || "Unknown error");
  }
}

function renderGenerationResults() {
  document.getElementById("genResults").style.display = "";
  document.getElementById("genBanner").style.display = "none";

  // ATS Score
  if (state.lastAtsScore > 0) {
    const scoreBand = document.getElementById("scoreBand");
    scoreBand.style.display = "";
    const num = document.getElementById("scoreNum");
    num.textContent = state.lastAtsScore;
    const circle = document.getElementById("scoreCircle");
    const pct = state.lastAtsScore;
    const color = pct >= 75 ? "var(--teal)" : pct >= 50 ? "var(--amber)" : "var(--red)";
    circle.style.background = `conic-gradient(${color} 0% ${pct}%, var(--rule2) ${pct}% 100%)`;
    document.getElementById("scoreVerdict").textContent = pct >= 75 ? "Strong Match" : pct >= 50 ? "Moderate Match" : "Needs Work";
    document.getElementById("reportActions").style.display = "";
    setTimeout(() => document.getElementById("scoreBarFill").style.width = pct + "%", 100);
  }

  const mode = state.generateMode;
  // Bullets
  if (state.lastBullets && (mode === "both" || mode === "bullets")) {
    document.getElementById("bulletsWrap").style.display = "";
    document.getElementById("bulletsOut").textContent = state.lastBullets;
  }
  // Cover
  if (state.lastCoverLetter && (mode === "both" || mode === "cover")) {
    document.getElementById("coverWrap").style.display = "";
    document.getElementById("coverOut").textContent = state.lastCoverLetter;
  }
  // Pitch
  if (state.lastPitch && mode === "pitch") {
    document.getElementById("pitchWrap").style.display = "";
    document.getElementById("pitchOut").textContent = state.lastPitch;
  }

  // Full report
  if (state.lastReport) {
    document.getElementById("reportWrap").style.display = "";
    document.getElementById("reportContent").innerHTML = mdToHtml(state.lastReport);
  }
}

function retryGeneration() {
  if (!state.currentJD && !document.getElementById("jdInput").value.trim()) {
    showToast("err", "No JD found. Paste one in the Generate tab.");
    return;
  }
  // Reset outputs
  state.lastReport = ""; state.lastResumeHTML = ""; state.lastCoverLetter = "";
  state.lastBullets = ""; state.lastPitch = ""; state.lastAtsScore = 0;
  document.getElementById("genResults").style.display = "none";
  document.getElementById("scoreBand").style.display = "none";
  document.getElementById("reportActions").style.display = "none";
  document.getElementById("bulletsWrap").style.display = "none";
  document.getElementById("coverWrap").style.display = "none";
  document.getElementById("pitchWrap").style.display = "none";
  document.getElementById("reportWrap").style.display = "none";
  document.getElementById("gapsWrap").style.display = "none";
  document.getElementById("scoreBarFill").style.width = "0";
  startGeneration();
}

function clearGeneration() {
  chrome.storage.local.remove("lastSession");
  state.lastReport = ""; state.lastResumeHTML = ""; state.lastCoverLetter = "";
  state.lastBullets = ""; state.lastPitch = ""; state.lastAtsScore = 0;
  document.getElementById("genResults").style.display = "none";
  document.getElementById("genBanner").style.display = "none";
  document.getElementById("scoreBand").style.display = "none";
  document.getElementById("reportActions").style.display = "none";
  document.getElementById("bulletsWrap").style.display = "none";
  document.getElementById("coverWrap").style.display = "none";
  document.getElementById("pitchWrap").style.display = "none";
  document.getElementById("reportWrap").style.display = "none";
  document.getElementById("gapsWrap").style.display = "none";
  document.getElementById("jdInput").value = "";
  document.getElementById("charCount").textContent = "0";
  document.getElementById("genMainBtn").style.display = "";
  document.getElementById("jdInputArea").style.display = "";
  refreshFillUI();
}

async function cancelGeneration() {
  try { await bg({ action: "cancelGeneration" }); } catch {}
  state.isGenerating = false;
  document.getElementById("genProgressZone").style.display = "none";
  document.getElementById("progressZone").style.display = "none";
  document.getElementById("genMainBtn").style.display = "";
  document.getElementById("jdInputArea").style.display = "";
  showJobState(state.currentJob ? "card" : "empty");
  showToast("ok", "Generation cancelled.");
}

// ── SESSION RESTORE ───────────────────────────────────────────────────────────
async function restoreSession() {
  const { lastSession } = await chrome.storage.local.get("lastSession");
  if (!lastSession) return;

  state.lastReport      = lastSession.report      || "";
  state.lastResumeHTML  = lastSession.resumeHTML   || "";
  state.lastCoverLetter = lastSession.coverLetter  || "";
  state.lastBullets     = lastSession.bullets      || "";
  state.lastPitch       = lastSession.pitch        || "";
  state.lastAtsScore    = lastSession.atsScore     || 0;

  if (lastSession.jd) {
    state.currentJD = lastSession.jd;
    document.getElementById("jdInput").value = lastSession.jd;
    document.getElementById("charCount").textContent = lastSession.jd.length.toLocaleString();
  }

  if (state.lastReport || state.lastBullets || state.lastCoverLetter) {
    renderGenerationResults();
    const banner = document.getElementById("genBanner");
    banner.style.display = "";
    document.getElementById("genBannerText").textContent =
      "📂 Restored — " + new Date(lastSession.savedAt).toLocaleString();
  }
}

document.getElementById("btnClearGen")?.addEventListener("click", clearGeneration);

// ── STREAM TOKEN LISTENER ─────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === "streamToken") {
    const box = document.getElementById("genStreamBox");
    box.textContent += msg.token;
    box.scrollTop = box.scrollHeight;
    const len = box.textContent.length;
    document.getElementById("genProgressMsg").textContent = `Generating… ${len.toLocaleString()} chars`;
  }
});

// ── DOWNLOAD / PREVIEW ────────────────────────────────────────────────────────
async function downloadResume() {
  if (!state.lastResumeHTML) { showToast("err","Generate a report first."); return; }
  const s = await chrome.storage.local.get(["firstName","lastName"]);
  try {
    await bg({ action:"download", content:state.lastResumeHTML,
      filename:`Resume_${s.firstName}_${s.lastName}.html`, mime:"text/html" });
  } catch (e) { if (!isPortClosed(e)) showToast("err", e?.message); }
}

async function downloadReport() {
  if (!state.lastReport) { showToast("err","Generate a report first."); return; }
  const s = await chrome.storage.local.get(["firstName","lastName"]);
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>ATS Report</title><style>
body{font-family:Georgia,serif;max-width:820px;margin:40px auto;padding:20px;color:#1a1a1a;line-height:1.65;}
h2{font-size:14pt;color:#1e40af;margin-top:24px;border-bottom:1px solid #cbd5e1;padding-bottom:4px;}
h3{font-size:12pt;color:#374151;margin-top:16px;}
table{width:100%;border-collapse:collapse;margin:10px 0;}
th{background:#f1f5f9;font-weight:700;padding:8px 10px;border:1px solid #cbd5e1;text-align:left;}
td{padding:8px 10px;border:1px solid #cbd5e1;}tr:nth-child(even)td{background:#f8fafc;}
ul{padding-left:18px;}li{margin-bottom:3px;}@media print{body{margin:0;}}
</style></head><body>
<h1>ATS Analysis Report</h1>
<p><strong>Candidate:</strong> ${s.firstName} ${s.lastName} | <strong>Generated:</strong> ${new Date().toLocaleDateString()}</p><hr>
${mdToHtml(state.lastReport)}
</body></html>`;
  try {
    await bg({ action:"download", content:html,
      filename:`ATS_Report_${s.firstName}_${s.lastName}.html`, mime:"text/html" });
  } catch (e) { if (!isPortClosed(e)) showToast("err", e?.message); }
}

function previewResume() {
  if (!state.lastResumeHTML) { showToast("err","Generate a resume first."); return; }
  const blob = new Blob([state.lastResumeHTML], { type: "text/html" });
  chrome.tabs.create({ url: URL.createObjectURL(blob) });
}

// ── AUTOFILL ──────────────────────────────────────────────────────────────────
async function doAutofill() {
  const s = await chrome.storage.local.get([
    "firstName","lastName","email","phone","location","linkedin","github","website","portfolio"
  ]);
  s.coverLetter = state.lastCoverLetter || "";
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) { showToast("err","No active tab found."); return; }
  try {
    const r = await bg({ action:"autofillTab", tabId: tab.id, profile: s });
    const fillStatus = document.getElementById("fillStatus");
    if (r?.success) {
      showToast("ok", `✓ Filled ${r.result?.filled || 0} fields`);
      fillStatus.textContent = `✓ ${r.result?.filled || 0} fields filled on this page`;
      fillStatus.style.color = "var(--teal-b)";
    } else {
      showToast("err", r?.error || "Partial fill — review manually.");
      fillStatus.textContent = "⚠ " + (r?.error || "Some fields may need manual entry");
      fillStatus.style.color = "var(--amber)";
    }
  } catch (e) {
    if (!isPortClosed(e)) showToast("err", e?.message || "Autofill failed");
  }
}

function refreshFillUI() {
  const hasKit = !!(state.lastCoverLetter || state.lastBullets);
  document.getElementById("noKitState").style.display   = hasKit ? "none" : "";
  document.getElementById("kitReadyState").style.display = hasKit ? "" : "none";

  if (state.lastCoverLetter) {
    document.getElementById("fillCoverWrap").style.display = "";
    document.getElementById("fillCoverOut").textContent    = state.lastCoverLetter;
  }

  // Populate kit fields from profile
  chrome.storage.local.get(["firstName","lastName","email","phone","linkedin","github"]).then(s => {
    const el = (id, v) => { const e = document.getElementById(id); if (e && v) e.textContent = v; };
    el("fillName", `${s.firstName || ""} ${s.lastName || ""}`.trim());
    el("fillEmail",   s.email    || "");
    el("fillPhone",   s.phone    || "");
    el("fillLinkedin",s.linkedin || "");
    el("fillGithub",  s.github   || "");
  });
}

// ── APPLICATION LOG ───────────────────────────────────────────────────────────
async function logApplication(job, jd) {
  if (!job?.title && !job?.company) return;
  const { appLog = [] } = await chrome.storage.local.get("appLog");
  const entry = {
    id:       Date.now(),
    title:    job?.title    || "Unknown Position",
    company:  job?.company  || "Unknown Company",
    location: job?.location || "",
    url:      job?.url      || "",
    site:     job?.site     || "generic",
    status:   "applied",
    jd:       (jd || "").substring(0, 500),
    appliedAt: Date.now()
  };
  appLog.unshift(entry);
  await chrome.storage.local.set({ appLog: appLog.slice(0, 200) });
}

async function logCurrentJob() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const job = state.currentJob || { title: tab?.title || "Unknown", company: "", url: tab?.url || "", site: "generic" };
  await logApplication(job, state.currentJD);
  refreshLogUI();
  showToast("ok", "Application logged.");
}

function refreshLogUI() {
  chrome.storage.local.get("appLog").then(({ appLog = [] }) => {
    const total     = appLog.length;
    const interview = appLog.filter(a => a.status === "interview").length;
    const offer     = appLog.filter(a => a.status === "offer").length;
    const rejected  = appLog.filter(a => a.status === "rejected").length;

    document.getElementById("statTotal").textContent     = total;
    document.getElementById("statInterview").textContent = interview;
    document.getElementById("statOffer").textContent     = offer;
    document.getElementById("statRejected").textContent  = rejected;

    const list = document.getElementById("logList");
    const empty = document.getElementById("logEmpty");
    if (!total) { list.innerHTML = ""; empty.style.display = ""; return; }
    empty.style.display = "none";

    list.innerHTML = appLog.slice(0, 20).map(app => {
      const barClass = app.status === "interview" ? "lb-int" : app.status === "rejected" ? "lb-rej" : app.status === "offer" ? "lb-int" : "lb-app";
      const badgeClass = app.status === "interview" ? "sb-int" : app.status === "rejected" ? "sb-rej" : app.status === "offer" ? "sb-int" : "sb-app";
      const date = new Date(app.appliedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
      return `<div class="log-item" style="margin-bottom:6px" onclick="updateLogStatus(${app.id})">
        <div class="log-bar ${barClass}"></div>
        <div class="log-co">${escHtml(app.company)}</div>
        <div class="log-role">${escHtml(app.title)}</div>
        <div class="log-meta">
          <span class="status-badge ${badgeClass}">${capitalize(app.status)}</span>
          <span class="log-date">${date}</span>
          ${app.url ? `<span class="log-link" onclick="event.stopPropagation();chrome.tabs.create({url:'${escHtml(app.url)}'})">view →</span>` : ""}
        </div>
      </div>`;
    }).join("");
  });
}

async function updateLogStatus(id) {
  const STATUSES = ["applied","interview","offer","rejected","saved"];
  const { appLog = [] } = await chrome.storage.local.get("appLog");
  const idx = appLog.findIndex(a => a.id === id);
  if (idx === -1) return;
  const cur = appLog[idx].status;
  const next = STATUSES[(STATUSES.indexOf(cur) + 1) % STATUSES.length];
  appLog[idx].status = next;
  await chrome.storage.local.set({ appLog });
  refreshLogUI();
  showToast("ok", `Status → ${capitalize(next)}`);
}

async function exportCSV() {
  const { appLog = [] } = await chrome.storage.local.get("appLog");
  if (!appLog.length) { showToast("err","No applications to export."); return; }
  const headers = ["Company","Title","Status","Applied Date","Location","URL"];
  const rows = appLog.map(a => [
    a.company, a.title, a.status,
    new Date(a.appliedAt).toLocaleDateString(),
    a.location || "", a.url || ""
  ].map(v => `"${String(v).replace(/"/g,'""')}"`).join(","));
  const csv = [headers.join(","), ...rows].join("\n");
  try {
    await bg({ action:"download", content:csv, filename:"JobHunt_Applications.csv", mime:"text/csv" });
  } catch (e) { if (!isPortClosed(e)) showToast("err", e?.message); }
}

// ── PROFILE FORM ──────────────────────────────────────────────────────────────
async function loadProfileUI() {
  const d = await chrome.storage.local.get([
    "firstName","lastName","email","phone","location","linkedin","github",
    "visaStatus","ollamaUrl","ollamaModel","resumeData"
  ]);
  set("pFirst",   d.firstName || "");
  set("pLast",    d.lastName  || "");
  set("pEmail",   d.email     || "");
  set("pPhone",   d.phone     || "");
  set("pLinkedin",d.linkedin  || "");
  set("pGithub",  d.github    || "");
  set("ollamaUrl",d.ollamaUrl || "http://localhost:11434");
  if (d.visaStatus) {
    const sel = document.getElementById("pVisa");
    const opt = [...sel.options].find(o => o.value === d.visaStatus);
    if (opt) sel.value = d.visaStatus;
  }
  if (d.ollamaModel) {
    const sel = document.getElementById("pModel");
    const opt = [...sel.options].find(o => o.value === d.ollamaModel);
    if (opt) sel.value = d.ollamaModel;
    else { sel.appendChild(new Option(d.ollamaModel, d.ollamaModel, true, true)); sel.value = d.ollamaModel; }
  }
  // Skills pills
  try {
    const rd = JSON.parse(d.resumeData || "{}");
    set("pSummary", rd.summary || "");
    renderSkillPills(rd.skills || []);
  } catch {}
}

function renderSkillPills(skills) {
  const box = document.getElementById("skillsBox");
  const input = document.getElementById("skillInput");
  box.innerHTML = "";
  skills.forEach(sk => {
    const pill = document.createElement("div");
    pill.className = "skill-pill";
    pill.innerHTML = `${escHtml(sk)} <span class="sp-x" onclick="removeSkill('${escHtml(sk)}')">×</span>`;
    box.appendChild(pill);
  });
  box.appendChild(input);
}

async function removeSkill(skill) {
  const { resumeData } = await chrome.storage.local.get("resumeData");
  const rd = JSON.parse(resumeData || "{}");
  rd.skills = (rd.skills || []).filter(s => s !== skill);
  await chrome.storage.local.set({ resumeData: JSON.stringify(rd) });
  renderSkillPills(rd.skills);
}

function addSkillOnEnter(e) {
  if (e.key !== "Enter" && e.key !== ",") return;
  e.preventDefault();
  const val = document.getElementById("skillInput").value.trim().replace(/,$/,"");
  if (!val) return;
  chrome.storage.local.get("resumeData").then(({ resumeData }) => {
    const rd = JSON.parse(resumeData || "{}");
    rd.skills = rd.skills || [];
    if (!rd.skills.includes(val)) {
      rd.skills.push(val);
      chrome.storage.local.set({ resumeData: JSON.stringify(rd) });
      renderSkillPills(rd.skills);
    }
    document.getElementById("skillInput").value = "";
  });
}

async function saveProfile() {
  const { resumeData } = await chrome.storage.local.get("resumeData");
  const rd = JSON.parse(resumeData || "{}");
  const summary = document.getElementById("pSummary").value.trim();
  if (summary) rd.summary = summary;

  await chrome.storage.local.set({
    firstName:   document.getElementById("pFirst").value.trim(),
    lastName:    document.getElementById("pLast").value.trim(),
    email:       document.getElementById("pEmail").value.trim(),
    phone:       document.getElementById("pPhone").value.trim(),
    linkedin:    document.getElementById("pLinkedin").value.trim(),
    github:      document.getElementById("pGithub").value.trim(),
    website:     document.getElementById("pGithub").value.trim(),
    visaStatus:  document.getElementById("pVisa").value,
    ollamaUrl:   document.getElementById("ollamaUrl").value.trim() || "http://localhost:11434",
    ollamaModel: document.getElementById("pModel").value,
    resumeData:  JSON.stringify(rd)
  });
  showToast("ok", "Profile saved!");
}

async function resetToDefaults() {
  if (!confirm("Reset to Prasanna's default profile?")) return;
  await chrome.storage.local.set({
    firstName:   PRASANNA_PROFILE.firstName,
    lastName:    PRASANNA_PROFILE.lastName,
    email:       PRASANNA_PROFILE.email,
    phone:       PRASANNA_PROFILE.phone,
    location:    PRASANNA_PROFILE.location,
    linkedin:    PRASANNA_PROFILE.linkedin,
    github:      PRASANNA_PROFILE.github,
    website:     PRASANNA_PROFILE.website,
    portfolio:   PRASANNA_PROFILE.portfolio,
    visaStatus:  PRASANNA_PROFILE.visaStatus,
    resumeData:  PRASANNA_PROFILE.resumeData,
    ollamaUrl:   PRASANNA_PROFILE.ollamaUrl,
    ollamaModel: PRASANNA_PROFILE.ollamaModel,
  });
  await loadProfileUI();
  showToast("ok", "Reset to default profile!");
}

async function seedIfEmpty() {
  const { firstName } = await chrome.storage.local.get("firstName");
  if (firstName) return;
  await chrome.storage.local.set({
    firstName:   PRASANNA_PROFILE.firstName,
    lastName:    PRASANNA_PROFILE.lastName,
    email:       PRASANNA_PROFILE.email,
    phone:       PRASANNA_PROFILE.phone,
    location:    PRASANNA_PROFILE.location,
    linkedin:    PRASANNA_PROFILE.linkedin,
    github:      PRASANNA_PROFILE.github,
    website:     PRASANNA_PROFILE.website,
    portfolio:   PRASANNA_PROFILE.portfolio,
    visaStatus:  PRASANNA_PROFILE.visaStatus,
    resumeData:  PRASANNA_PROFILE.resumeData,
    ollamaUrl:   PRASANNA_PROFILE.ollamaUrl,
    ollamaModel: PRASANNA_PROFILE.ollamaModel,
  });
}

async function saveOllamaUrl() {
  const url = document.getElementById("ollamaUrl").value.trim() || "http://localhost:11434";
  await chrome.storage.local.set({ ollamaUrl: url });
  showToast("ok","URL saved. Testing…");
  await checkOllamaStatus();
}

// ── SETUP TAB ─────────────────────────────────────────────────────────────────
function refreshSetupUI() {
  document.getElementById("setupOnlineNote").style.display = state.ollamaOnline ? "flex" : "none";
  document.getElementById("setupOfflineNote").style.display = state.ollamaOnline ? "none" : "flex";
}

function selectModel(model, el) {
  document.querySelectorAll(".model-opt").forEach(m => m.classList.remove("selected"));
  el.classList.add("selected");
  const sel = document.getElementById("pModel");
  const opt = [...sel.options].find(o => o.value === model);
  if (opt) sel.value = model;
  chrome.storage.local.set({ ollamaModel: model });
  showToast("ok", `Model set to ${model}`);
}

function copyCodeLine(el, text) {
  navigator.clipboard.writeText(text || el.previousSibling?.textContent || "").then(() => {
    el.classList.add("copied");
    el.textContent = "✓ copied";
    setTimeout(() => { el.classList.remove("copied"); el.textContent = "copy"; }, 2000);
  });
}

async function loadAvailableModels() {
  try {
    const r = await bg({ action: "checkOllama" });
    if (r?.online && r.models?.length) populateModelSelect(r.models);
    else showToast("err","Ollama offline or no models found.");
  } catch (e) { if (!isPortClosed(e)) showToast("err", e?.message || "Failed"); }
}

function populateModelSelect(models) {
  const sel = document.getElementById("pModel");
  const cur = sel.value;
  sel.innerHTML = "";
  models.forEach(m => sel.appendChild(new Option(m, m)));
  if (models.includes(cur)) sel.value = cur;
  document.getElementById("modelHint").textContent = `${models.length} model(s) available locally`;
}

// ── COPY HELPERS ──────────────────────────────────────────────────────────────
function copyOutput(elId) {
  const el = document.getElementById(elId);
  if (!el) return;
  navigator.clipboard.writeText(el.textContent).then(() => {
    showToast("ok","Copied to clipboard!");
  });
}
function copyField(elId) {
  const el = document.getElementById(elId);
  if (!el) return;
  navigator.clipboard.writeText(el.textContent).then(() => {
    showToast("ok","Copied!");
  });
}

// ── MARKDOWN RENDERER ─────────────────────────────────────────────────────────
function mdToHtml(text) {
  let t = (text || "").replace(/\r\n/g,"\n").trim();
  // Tables
  t = t.replace(/((?:\|[^\n]+\|\n)+)/g, match => {
    const rows = match.trim().split("\n").filter(r => r.includes("|"));
    if (rows.length < 2) return match;
    let html = "<table>";
    rows.forEach((row, i) => {
      if (/^\|[-| :]+\|$/.test(row.trim())) return;
      const cells = row.split("|").filter((_,j,a) => j > 0 && j < a.length - 1);
      const tag = i === 0 ? "th" : "td";
      html += `<tr>${cells.map(c => `<${tag}>${inlineFormat(c.trim())}</${tag}>`).join("")}</tr>`;
    });
    return html + "</table>";
  });
  // Headings
  t = t.replace(/^#{1,2}\s+(.+)$/gm, (_,h) => `<h2>${inlineFormat(h)}</h2>`);
  t = t.replace(/^#{3,4}\s+(.+)$/gm, (_,h) => `<h3>${inlineFormat(h)}</h3>`);
  t = t.replace(/^(\d+)\.\s+([A-Z][^\n]{3,60})$/gm, (_,n,h) => `<h2>${n}. ${inlineFormat(h)}</h2>`);
  // Lists
  t = t.replace(/((?:^[•\-\*]\s+.+\n?)+)/gm, block => {
    const items = block.trim().split("\n").filter(l => l.trim())
      .map(l => `<li>${inlineFormat(l.replace(/^[•\-\*]\s+/,""))}</li>`).join("");
    return `<ul>${items}</ul>`;
  });
  // Paragraphs
  t = t.replace(/(?:^|\n\n)([^<\n][^\n]+(?:\n[^<\n][^\n]+)*)/g, (_, p) => {
    if (p.startsWith("<")) return _;
    return `\n<p>${inlineFormat(p.replace(/\n/g," "))}</p>`;
  });
  return t;
}

function inlineFormat(t) {
  t = t.replace(/\*\*([^*]+)\*\*/g,"<strong>$1</strong>");
  t = t.replace(/__([^_]+)__/g,"<strong>$1</strong>");
  t = t.replace(/\*([^*]+)\*/g,"<em>$1</em>");
  t = t.replace(/`([^`]+)`/g,`<code style="background:var(--off2);padding:1px 4px;border-radius:3px;font-family:'Geist Mono',monospace;font-size:10.5px">$1</code>`);
  t = t.replace(/✓\s*([^,\n<]+)/g,'<span class="badge-g">✓ $1</span> ');
  t = t.replace(/✗\s*([^,\n<]+)/g,'<span class="badge-r">✗ $1</span> ');
  return t;
}

// ── TOAST ─────────────────────────────────────────────────────────────────────
let toastTimer = null;
function showToast(type, msg) {
  const el = document.getElementById(type === "ok" ? "toastOk" : "toastErr");
  const msgEl = document.getElementById(type === "ok" ? "toastOkMsg" : "toastErrMsg");
  if (msg && msgEl) msgEl.textContent = msg;
  el.classList.add("on");
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("on"), 3000);
}

// ── HELPERS ───────────────────────────────────────────────────────────────────
function bg(msg) {
  return new Promise((res, rej) => {
    chrome.runtime.sendMessage(msg, r => {
      const err = chrome.runtime.lastError;
      if (err) { const e = new Error(err.message); if (err.message?.includes("message port")) e.code = "PORT_CLOSED"; rej(e); }
      else res(r);
    });
  });
}
function isPortClosed(e) { return e?.code === "PORT_CLOSED" || e?.message?.includes("message port"); }
function set(id, val) { const el = document.getElementById(id); if (el) el.value = val; }
function escHtml(t) {
  return String(t || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}
function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ""; }
async function getModel() {
  const { ollamaModel } = await chrome.storage.local.get("ollamaModel");
  return ollamaModel || "llama3";
}
