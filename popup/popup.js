// popup.js

let lastRawReport = "";
let lastResumeHTML = "";
let lastCoverLetter = "";

// ── SESSION PERSISTENCE ───────────────────────────────────────────────────────
// Saves the last analysis to chrome.storage.local so it survives popup close/reopen.
// Cleared only when user clicks "↺ New" or generates a fresh analysis.

async function saveSession(data) {
  await chrome.storage.local.set({ lastSession: data });
}

async function loadSession() {
  const { lastSession } = await chrome.storage.local.get("lastSession");
  return lastSession || null;
}

async function clearSession() {
  await chrome.storage.local.remove("lastSession");
}

// ── INIT ─────────────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", async () => {
  await seedIfEmpty();
  await loadSettings();
  setupTabs();
  setupListeners();
  checkOllama();
  await restoreLastSession(); // Restore previous results if they exist
  await checkActiveAnalysis(); // Re-attach loader if something is running in background
});

async function restoreLastSession() {
  const session = await loadSession();
  if (!session) return;

  lastRawReport   = session.report     || "";
  lastResumeHTML  = session.resumeHTML || "";
  lastCoverLetter = session.coverLetter || "";

  // Restore JD text
  if (session.jd) {
    document.getElementById("jdInput").value = session.jd;
    document.getElementById("charCount").textContent = session.jd.length.toLocaleString();
  }

  // Show the Report tab and render results
  if (lastRawReport) {
    renderReport(lastRawReport, session.atsScore);
    document.getElementById("tabResults").style.display = "";

    // Show session banner
    const banner = document.getElementById("sessionBanner");
    if (banner) {
      banner.style.display = "flex";
      document.getElementById("sessionInfo").textContent =
        "📂 Restored — saved " + new Date(session.savedAt).toLocaleString();
    }
    document.getElementById("scoreSub").textContent =
      "Restored from last session";

    switchTab("results");
  }
}

// ── TAB ROUTING ───────────────────────────────────────────────────────────────

function setupTabs() {
  document.querySelectorAll(".tab").forEach(t => {
    t.addEventListener("click", () => switchTab(t.dataset.tab));
  });
  document.getElementById("btnSettings").addEventListener("click", () => switchTab("settings"));
}

function switchTab(id) {
  document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.dataset.tab === id));
  document.querySelectorAll(".panel").forEach(p => p.classList.toggle("active", p.id === `panel-${id}`));
}

// ── OLLAMA STATUS ─────────────────────────────────────────────────────────────

async function checkOllama() {
  const dot = document.getElementById("dot");
  const lbl = document.getElementById("statusLbl");
  dot.className = "dot";
  lbl.textContent = "checking…";

  try {
    const r = await bg({ action: "checkOllama" });
    if (r?.online) {
      dot.className = "dot on";
      lbl.textContent = "Ollama online";
      hideCors();
      if (r.models?.length) populateModels(r.models);
    } else {
      dot.className = "dot off";
      lbl.textContent = "Ollama offline";
    }
  } catch (e) {
    dot.className = "dot off";
    lbl.textContent = "Ollama offline";
  }
}

// ── CORS WIZARD ───────────────────────────────────────────────────────────────

const CORS_CMDS = {
  mac: {
    cmd: `launchctl setenv OLLAMA_ORIGINS "*"\npkill Ollama\nopen /Applications/Ollama.app`,
    note: "Paste into Terminal. This permanently sets the env var so it survives reboots. If Ollama is not in /Applications, run: OLLAMA_ORIGINS=\"*\" ollama serve"
  },
  win: {
    cmd: `setx OLLAMA_ORIGINS "*"\ntaskkill /IM "ollama app.exe" /F\nstart "" "%LOCALAPPDATA%\\Programs\\Ollama\\ollama app.exe"`,
    note: "Paste into Command Prompt (run as Admin). setx makes it permanent. Then click the button below."
  },
  linux: {
    cmd: `echo 'export OLLAMA_ORIGINS="*"' >> ~/.bashrc\nsource ~/.bashrc\npkill -f "ollama serve"\nOLLAMA_ORIGINS="*" ollama serve &`,
    note: "Paste into Terminal. Using systemd? Run: sudo systemctl edit ollama — add Environment=OLLAMA_ORIGINS=* then sudo systemctl restart ollama"
  }
};

function showCors() {
  document.getElementById("corsBox").style.display = "block";
}
function hideCors() {
  document.getElementById("corsBox").style.display = "none";
}
function showCmd(os) {
  const { cmd, note } = CORS_CMDS[os];
  document.getElementById("cmdText").textContent = cmd;
  document.getElementById("cmdNote").textContent = note;
  document.getElementById("cmdArea").style.display = "block";
}
function copyCmd(el) {
  navigator.clipboard.writeText(el.textContent).then(() => {
    el.classList.add("copied");
    setTimeout(() => el.classList.remove("copied"), 2000);
  });
}
async function recheckCors() {
  try {
    const r = await bg({ action: "checkOllama" });
    if (r?.online) {
      hideCors();
      document.getElementById("dot").className = "dot on";
      document.getElementById("statusLbl").textContent = "Ollama online";
      if (r.models?.length) populateModels(r.models);
    } else {
      document.getElementById("cmdNote").textContent = "⚠ Still not reachable. Make sure Ollama restarted, then try again.";
    }
  } catch (e) {
    if (!isPortClosedError(e)) document.getElementById("cmdNote").textContent = "⚠ " + (e?.message || "Check failed");
  }
}

// ── MAIN ANALYZE FLOW ─────────────────────────────────────────────────────────

async function analyze() {
  const jd = document.getElementById("jdInput").value.trim();
  if (!jd || jd.length < 50) {
    alert("Please paste a job description first (at least 50 characters).");
    return;
  }

  const settings = await chrome.storage.local.get([
    "firstName","lastName","email","phone","location","linkedin","website","resumeData","ollamaUrl","ollamaModel"
  ]);

  if (!settings.firstName) {
    alert("Please fill in your profile first (Profile tab).");
    switchTab("settings");
    return;
  }

  // Show progress
  showProgress("Connecting to Ollama…");

  try {
    // Check Ollama first
    const status = await bg({ action: "checkOllama" });
    if (!status?.online) {
      hideProgress();
      showCors();
      return;
    }

    setProgressMsg("Sending to Ollama — this takes 30–90s…");
    document.getElementById("streamPreview").style.display = "block";

    const result = await bg({
      action: "fullAnalysis",
      jd,
      profile: settings
    });

    if (!result.success) {
      hideProgress();
      if (result.error?.includes("403") || result.error?.includes("CORS")) {
        showCors();
      } else {
        showErr(result.error);
      }
      return;
    }

    hideProgress();
    lastRawReport   = result.report;
    lastResumeHTML  = result.resumeHTML;
    lastCoverLetter = result.coverLetter || "";

    // Persist to storage so it survives popup close/reopen
    await saveSession({
      report:      result.report,
      resumeHTML:  result.resumeHTML,
      coverLetter: result.coverLetter || "",
      atsScore:    result.atsScore,
      jd:          jd,
      savedAt:     Date.now(),
    });

    renderReport(result.report, result.atsScore);
    document.getElementById("tabResults").style.display = "";
    // Hide "restored" banner — this is a fresh analysis
    const banner = document.getElementById("sessionBanner");
    if (banner) banner.style.display = "none";
    switchTab("results");

  } catch (e) {
    hideProgress();
    if (!isPortClosedError(e)) showErr(e.message);
  }
}

// ── PROGRESS ─────────────────────────────────────────────────────────────────

function showProgress(msg) {
  const btn = document.getElementById("btnAnalyze");
  const jdInput = document.getElementById("jdInput");
  const cancelBtn = document.getElementById("btnCancelAnalysis");

  // Remember original label once, then show a clear loading state
  if (!btn.dataset.originalLabel) {
    btn.dataset.originalLabel = btn.textContent;
  }

  btn.disabled = true;
  btn.setAttribute("aria-busy", "true");
  btn.textContent = "Analyzing job description…";

  if (jdInput) {
    jdInput.readOnly = true;
  }

  const box = document.getElementById("progressBox");
  const preview = document.getElementById("streamPreview");

  box.style.display = "block";
  document.getElementById("progressMsg").textContent = msg;
  preview.textContent = "";
  preview.style.display = "none";

  if (cancelBtn) {
    cancelBtn.disabled = false;
  }

  // Make sure the loader is visible even on smaller popup heights
  box.scrollIntoView({ behavior: "smooth", block: "nearest" });
}
function hideProgress() {
  const btn = document.getElementById("btnAnalyze");
  const jdInput = document.getElementById("jdInput");
  const cancelBtn = document.getElementById("btnCancelAnalysis");

  btn.disabled = false;
  btn.removeAttribute("aria-busy");
  if (btn.dataset.originalLabel) {
    btn.textContent = btn.dataset.originalLabel;
  }

  if (jdInput) {
    jdInput.readOnly = false;
  }

  document.getElementById("progressBox").style.display = "none";

  if (cancelBtn) {
    cancelBtn.disabled = false;
  }
}
function setProgressMsg(msg) {
  document.getElementById("progressMsg").textContent = msg;
}

// Listen for streaming tokens from background
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === "streamToken") {
    const el = document.getElementById("streamPreview");
    el.textContent += msg.token;
    el.scrollTop = el.scrollHeight;
    setProgressMsg("Generating analysis… " + el.textContent.length + " chars");
  }
});

// ── RENDER REPORT ─────────────────────────────────────────────────────────────

function renderReport(raw, atsScore) {
  // Extract ATS score from text if not explicitly provided
  let score = atsScore || 0;
  if (!score) {
    const m = raw.match(/(?:ATS|overall)[^\d]*(\d{2,3})\s*(?:\/\s*100|%|out of)/i)
           || raw.match(/score[^\d]*(\d{2,3})\s*\/\s*100/i)
           || raw.match(/(\d{2,3})\s*\/\s*100/);
    if (m) score = parseInt(m[1]);
  }

  // Update score display
  if (score > 0) {
    const color = score >= 75 ? "var(--green)" : score >= 50 ? "var(--yellow)" : "var(--red)";
    document.getElementById("atsScore").textContent = score + "%";
    document.getElementById("atsScore").style.color = color;
    document.getElementById("scoreTitle").textContent =
      score >= 75 ? "Strong Match" : score >= 50 ? "Moderate Match" : "Needs Work";
    document.getElementById("scoreSub").textContent =
      "ATS compatibility score — review improvements below";
    setTimeout(() => {
      document.getElementById("scoreBar").style.width = score + "%";
    }, 100);
  }

  // Convert raw text → rich HTML
  const html = markdownToHTML(raw);
  document.getElementById("reportContent").innerHTML = html;
}

function markdownToHTML(text) {
  // Normalize line endings
  let t = text.replace(/\r\n/g, "\n").trim();

  // Protect code blocks
  const codeBlocks = [];
  t = t.replace(/```[\s\S]*?```/g, m => {
    codeBlocks.push(m);
    return `%%CODE${codeBlocks.length - 1}%%`;
  });

  // Tables: detect | col | col | rows
  t = t.replace(/((?:\|[^\n]+\|\n)+)/g, (match) => {
    const rows = match.trim().split("\n").filter(r => r.includes("|"));
    if (rows.length < 2) return match;
    let html = '<table>';
    rows.forEach((row, i) => {
      if (/^\|[-| :]+\|$/.test(row.trim())) return; // separator row
      const cells = row.split("|").filter((_,j,a) => j > 0 && j < a.length - 1);
      const tag = i === 0 ? "th" : "td";
      html += `<tr>${cells.map(c => `<${tag}>${renderInline(c.trim())}</${tag}>`).join("")}</tr>`;
    });
    html += "</table>";
    return html;
  });

  // Headings
  t = t.replace(/^#{1,2}\s+(.+)$/gm, (_, h) => `<h2>${renderInline(h)}</h2>`);
  t = t.replace(/^#{3,4}\s+(.+)$/gm, (_, h) => `<h3>${renderInline(h)}</h3>`);

  // Numbered sections like "1. ATS Score Analysis" → h2
  t = t.replace(/^(\d+)\.\s+([A-Z][^\n]{3,60})$/gm, (_, n, h) => `<h2>${n}. ${renderInline(h)}</h2>`);

  // Bullet lists
  t = t.replace(/((?:^[•\-\*]\s+.+\n?)+)/gm, (block) => {
    const items = block.trim().split("\n")
      .filter(l => l.trim())
      .map(l => `<li>${renderInline(l.replace(/^[•\-\*]\s+/, ""))}</li>`)
      .join("");
    return `<ul>${items}</ul>`;
  });

  // Paragraphs — wrap remaining plain lines
  t = t.replace(/(?:^|\n\n)([^<\n][^\n]+(?:\n[^<\n][^\n]+)*)/g, (_, p) => {
    if (p.startsWith("<")) return _;
    return `\n<p>${renderInline(p.replace(/\n/g, " "))}</p>`;
  });

  // Restore code blocks
  t = t.replace(/%%CODE(\d+)%%/g, (_, i) => {
    const code = codeBlocks[parseInt(i)].replace(/```\w*\n?/, "").replace(/```$/, "");
    return `<pre style="background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:10px;font-size:10.5px;overflow-x:auto;font-family:'DM Mono',monospace;color:#a5b4fc">${code}</pre>`;
  });

  return t;
}

function renderInline(t) {
  // Bold
  t = t.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  t = t.replace(/__([^_]+)__/g, "<strong>$1</strong>");
  // Italic / highlight
  t = t.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  // Inline code
  t = t.replace(/`([^`]+)`/g, `<code style="background:var(--s2);padding:1px 5px;border-radius:4px;font-family:'DM Mono',monospace;font-size:10.5px">$1</code>`);
  // ✓ / ✗ badges
  t = t.replace(/✓\s*([^,\n<]+)/g, '<span class="badge badge-g">✓ $1</span> ');
  t = t.replace(/✗\s*([^,\n<]+)/g, '<span class="badge badge-r">✗ $1</span> ');
  return t;
}

// ── DOWNLOADS & ACTIONS ───────────────────────────────────────────────────────

async function downloadReport() {
  if (!lastRawReport) return;
  const settings = await chrome.storage.local.get(["firstName","lastName"]);
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>ATS Report — ${settings.firstName} ${settings.lastName}</title>
<style>
  body{font-family:Georgia,serif;max-width:800px;margin:40px auto;padding:20px;color:#1a1a1a;line-height:1.6;}
  h1{font-size:22pt;border-bottom:2px solid #333;padding-bottom:8px;}
  h2{font-size:14pt;color:#1e40af;margin-top:28px;border-bottom:1px solid #cbd5e1;padding-bottom:4px;}
  h3{font-size:12pt;color:#374151;}
  table{width:100%;border-collapse:collapse;margin:12px 0;}
  th{background:#f1f5f9;font-weight:700;padding:8px 10px;border:1px solid #cbd5e1;text-align:left;}
  td{padding:8px 10px;border:1px solid #cbd5e1;vertical-align:top;}
  tr:nth-child(even) td{background:#f8fafc;}
  ul{padding-left:18px;} li{margin-bottom:4px;}
  .score{font-size:28pt;font-weight:700;color:#059669;}
  @media print{body{margin:0;}}
</style>
</head><body>
<h1>ATS Analysis Report</h1>
<p><strong>Candidate:</strong> ${settings.firstName} ${settings.lastName} &nbsp;|&nbsp; <strong>Generated:</strong> ${new Date().toLocaleDateString()}</p>
<hr>
${markdownToHTML(lastRawReport)}
</body></html>`;

  try {
    await bg({ action: "download", content: html, filename: `ATS_Report_${settings.firstName}_${settings.lastName}.html`, mime: "text/html" });
  } catch (e) {
    if (!isPortClosedError(e)) showErr(e.message);
  }
}

async function downloadResume() {
  if (!lastResumeHTML) return;
  const settings = await chrome.storage.local.get(["firstName","lastName"]);
  try {
    await bg({ action: "download", content: lastResumeHTML, filename: `Resume_${settings.firstName}_${settings.lastName}.html`, mime: "text/html" });
  } catch (e) {
    if (!isPortClosedError(e)) showErr(e.message);
  }
}

function previewResume() {
  if (!lastResumeHTML) return;
  const blob = new Blob([lastResumeHTML], { type: "text/html" });
  chrome.tabs.create({ url: URL.createObjectURL(blob) });
}

async function autofill() {
  const settings = await chrome.storage.local.get(["firstName","lastName","email","phone","location","linkedin","website"]);
  settings.coverLetter = lastCoverLetter;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  try {
    const r = await bg({ action: "autofillTab", tabId: tab.id, profile: settings });
    const msg = r?.success ? `✓ Filled ${r.result?.filled || 0} fields` : `⚠ ${r?.error || "Partial fill"}`;
    document.getElementById("scoreSub").textContent = msg;
  } catch (e) {
    if (!isPortClosedError(e)) document.getElementById("scoreSub").textContent = "⚠ " + (e?.message || "Autofill failed");
  }
}

// ── SETTINGS ─────────────────────────────────────────────────────────────────

async function loadSettings() {
  const d = await chrome.storage.local.get([
    "firstName","lastName","email","phone","location","linkedin","website","resumeData","ollamaUrl","ollamaModel"
  ]);
  setValue("sFirst",   d.firstName || "");
  setValue("sLast",    d.lastName  || "");
  setValue("sEmail",   d.email     || "");
  setValue("sPhone",   d.phone     || "");
  setValue("sLoc",     d.location  || "");
  setValue("sLinkedin",d.linkedin  || "");
  setValue("sWebsite", d.website   || "");
  setValue("sUrl",     d.ollamaUrl || "http://localhost:11434");
  try {
    setValue("sResume", d.resumeData ? JSON.stringify(JSON.parse(d.resumeData), null, 2) : "");
  } catch { setValue("sResume", d.resumeData || ""); }
  if (d.ollamaModel) {
    const sel = document.getElementById("sModel");
    const opt = [...sel.options].find(o => o.value === d.ollamaModel);
    if (opt) sel.value = d.ollamaModel;
    else {
      const o = new Option(d.ollamaModel, d.ollamaModel, true, true);
      sel.appendChild(o);
    }
  }
}

async function saveSettings() {
  const resumeRaw = document.getElementById("sResume").value.trim();
  if (resumeRaw) {
    try { JSON.parse(resumeRaw); } catch {
      showToast("toastErr", "Resume JSON is invalid — please fix it first.");
      return;
    }
  }
  await chrome.storage.local.set({
    firstName:  document.getElementById("sFirst").value.trim(),
    lastName:   document.getElementById("sLast").value.trim(),
    email:      document.getElementById("sEmail").value.trim(),
    phone:      document.getElementById("sPhone").value.trim(),
    location:   document.getElementById("sLoc").value.trim(),
    linkedin:   document.getElementById("sLinkedin").value.trim(),
    website:    document.getElementById("sWebsite").value.trim(),
    resumeData: resumeRaw,
    ollamaUrl:  document.getElementById("sUrl").value.trim() || "http://localhost:11434",
    ollamaModel:document.getElementById("sModel").value,
  });
  showToast("toastOk");
}

async function resetToDefaults() {
  await chrome.storage.local.set({
    firstName: DEFAULT_PROFILE.firstName, lastName: DEFAULT_PROFILE.lastName,
    email: DEFAULT_PROFILE.email, phone: DEFAULT_PROFILE.phone,
    location: DEFAULT_PROFILE.location, linkedin: DEFAULT_PROFILE.linkedin,
    website: DEFAULT_PROFILE.website, resumeData: DEFAULT_PROFILE.resumeData,
  });
  await loadSettings();
  showToast("toastOk", "✓ Reset to your resume defaults!");
}

function populateModels(models) {
  const sel = document.getElementById("sModel");
  const cur = sel.value;
  sel.innerHTML = "";
  models.forEach(m => {
    const o = new Option(m, m);
    sel.appendChild(o);
  });
  if (models.includes(cur)) sel.value = cur;
  document.getElementById("modelHint").textContent = `${models.length} model(s) available locally`;
}

async function seedIfEmpty() {
  const d = await chrome.storage.local.get("firstName");
  if (d.firstName) return;
  await chrome.storage.local.set({
    firstName: DEFAULT_PROFILE.firstName, lastName: DEFAULT_PROFILE.lastName,
    email: DEFAULT_PROFILE.email, phone: DEFAULT_PROFILE.phone,
    location: DEFAULT_PROFILE.location, linkedin: DEFAULT_PROFILE.linkedin,
    website: DEFAULT_PROFILE.website, resumeData: DEFAULT_PROFILE.resumeData,
    ollamaUrl: "http://localhost:11434", ollamaModel: "llama3",
  });
}

// ── RESET TO CLEAN STATE ─────────────────────────────────────────────────────
// Called by both "↺ New" and "✕ Clear" buttons.
// Wipes the persisted session and resets the UI to blank analyze tab.

async function resetToNewAnalysis() {
  await clearSession();
  lastRawReport  = "";
  lastResumeHTML = "";
  lastCoverLetter = "";

  document.getElementById("tabResults").style.display = "none";
  document.getElementById("sessionBanner").style.display = "none";
  document.getElementById("jdInput").value = "";
  document.getElementById("charCount").textContent = "0";
  document.getElementById("reportContent").innerHTML = "";
  document.getElementById("atsScore").textContent = "—";
  document.getElementById("scoreBar").style.width = "0";
  document.getElementById("scoreTitle").textContent = "Analysis Complete";
  document.getElementById("scoreSub").textContent = "Review your tailored report below";
  switchTab("jd");
}

// ── LISTENERS ─────────────────────────────────────────────────────────────────

function setupListeners() {
  document.getElementById("btnAnalyze").addEventListener("click", analyze);
  document.getElementById("btnSave").addEventListener("click", saveSettings);
  document.getElementById("btnReset").addEventListener("click", resetToDefaults);
  document.getElementById("btnDlReport").addEventListener("click", downloadReport);
  document.getElementById("btnDlResume").addEventListener("click", downloadResume);
  document.getElementById("btnPreview").addEventListener("click", previewResume);
  document.getElementById("btnAutofill").addEventListener("click", autofill);
  document.getElementById("btnNew").addEventListener("click", () => resetToNewAnalysis());
  document.getElementById("btnClearSession").addEventListener("click", () => resetToNewAnalysis());
  document.getElementById("btnCancelAnalysis").addEventListener("click", cancelAnalysis);
  document.getElementById("btnLoadModels").addEventListener("click", async () => {
    try {
      const r = await bg({ action: "checkOllama" });
      if (r?.online && r.models?.length) populateModels(r.models);
      else showToast("toastErr", "Ollama offline or no models found.");
    } catch (e) {
      if (!isPortClosedError(e)) showToast("toastErr", e?.message || "Failed to load models");
    }
  });

  // char counter
  document.getElementById("jdInput").addEventListener("input", function() {
    document.getElementById("charCount").textContent = this.value.length.toLocaleString();
  });
}

// ── HELPERS ───────────────────────────────────────────────────────────────────

/** True when the popup/context closed before the background responded (no need to show error). */
function isPortClosedError(e) {
  return e?.code === "PORT_CLOSED" || e?.message?.includes("message port closed");
}

function bg(msg) {
  return new Promise((res, rej) => {
    chrome.runtime.sendMessage(msg, r => {
      const err = chrome.runtime.lastError;
      if (err) {
        const e = new Error(err.message);
        if (err.message && err.message.includes("message port closed")) {
          e.code = "PORT_CLOSED";
        }
        rej(e);
      } else {
        res(r);
      }
    });
  });
}

function setValue(id, val) {
  const el = document.getElementById(id);
  if (el) el.value = val;
}

function showToast(id, msg) {
  const el = document.getElementById(id);
  if (msg) el.textContent = msg;
  el.style.display = "flex";
  setTimeout(() => { el.style.display = "none"; }, 3000);
}

function showErr(msg) {
  alert("Error: " + (msg || "Unknown error"));
}

// ── ACTIVE ANALYSIS STATUS ────────────────────────────────────────────────────

async function checkActiveAnalysis() {
  try {
    const status = await bg({ action: "getAnalysisStatus" });
    if (status?.running) {
      // There is an analysis running in the background; show loader again
      showProgress("Resuming analysis with Ollama…");
      const preview = document.getElementById("streamPreview");
      if (preview) {
        preview.style.display = "block";
      }
    }
  } catch {
    // Ignore status errors; not critical for UX
  }
}

// ── CANCEL CURRENT ANALYSIS ───────────────────────────────────────────────────

async function cancelAnalysis() {
  const cancelBtn = document.getElementById("btnCancelAnalysis");
  cancelBtn.disabled = true;
  setProgressMsg("Cancelling current analysis…");
  try {
    const r = await bg({ action: "cancelAnalysis" });
    hideProgress();
    const sub = document.getElementById("scoreSub");
    if (sub) {
      sub.textContent = r?.cancelled ? "Generation cancelled." : "No active generation to cancel.";
    }
  } catch (e) {
    hideProgress();
    if (!isPortClosedError(e)) showErr(e.message);
  } finally {
    cancelBtn.disabled = false;
  }
}
