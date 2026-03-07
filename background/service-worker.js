// background/service-worker.js

const DEFAULT_BASE  = "http://localhost:11434";
const DEFAULT_MODEL = "llama3";

let currentAnalysis = null;

// ── CHECK OLLAMA ──────────────────────────────────────────────────────────────

async function checkOllama() {
  try {
    const { ollamaUrl } = await cfg();
    const res = await fetch((ollamaUrl || DEFAULT_BASE) + "/api/tags");
    if (!res.ok) return { online: false, status: res.status };
    const data = await res.json();
    return { online: true, models: data.models?.map(m => m.name) || [] };
  } catch (e) {
    return { online: false, error: e.message };
  }
}

// ── CONFIG HELPER ─────────────────────────────────────────────────────────────

async function cfg() {
  return chrome.storage.local.get([
    "ollamaUrl","ollamaModel",
    "firstName","lastName","email","phone","location","linkedin","website","github","portfolio","resumeData"
  ]);
}

// ── STREAMING OLLAMA CALL ─────────────────────────────────────────────────────

async function ollamaStream(systemPrompt, userPrompt, onToken, signal) {
  const settings = await cfg();
  const base  = settings.ollamaUrl  || DEFAULT_BASE;
  const model = settings.ollamaModel || DEFAULT_MODEL;

  const res = await fetch(base + "/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify({
      model,
      stream: true,
      options: { temperature: 0.25, num_ctx: 12000 },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user",   content: userPrompt   }
      ]
    })
  });

  if (!res.ok) {
    const txt = await res.text();
    if (res.status === 403) throw new Error("403_CORS");
    if (res.status === 404) throw new Error(`Model "${model}" not found. Run: ollama pull ${model}`);
    throw new Error(`Ollama ${res.status}: ${txt.substring(0,200)}`);
  }

  const reader  = res.body.getReader();
  const decoder = new TextDecoder();
  let full = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const lines = decoder.decode(value, { stream: true }).split("\n");
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const obj = JSON.parse(line);
        const token = obj?.message?.content || "";
        if (token) { full += token; onToken(token); }
        if (obj.done) break;
      } catch { /* partial JSON line */ }
    }
  }
  return full;
}

// ── EXACT RESUME HTML BUILDER ─────────────────────────────────────────────────
// Matches the uploaded template exactly:
// • Centered ALL-CAPS name, large bold
// • Tagline (specialties) centered below name
// • Pipe-separated contact line with hyperlinks
// • Section headings: bold, ALL-CAPS, full-width bottom border
// • Experience: "Company | Role — Location    Dates" on one line
// • Bullets with [Bold Tag] inline skill labels
// • Skills: "Category: values" on separate lines
// • Project: name — tech stack on one line, then bullets
// • Education: "School — Degree    Dates" right-aligned

function buildResumeHTML(profile, resumeSection) {
  const today = new Date().toLocaleDateString("en-US", { month:"long", day:"numeric", year:"numeric" });

  let workAuth = "H1B Visa";
  try {
    const rd = typeof profile.resumeData === "string" ? JSON.parse(profile.resumeData) : (profile.resumeData || {});
    if (rd.workAuthorization) workAuth = rd.workAuthorization;
  } catch (_) {}

  // ── Contact line
  const parts = [];
  if (profile.phone)    parts.push(esc(profile.phone));
  if (profile.email)    parts.push(`<a href="mailto:${esc(profile.email)}">${esc(profile.email)}</a>`);
  if (profile.linkedin) parts.push(`<a href="${esc(profile.linkedin)}">LinkedIn</a>`);
  if (profile.github)   parts.push(`<a href="${esc(profile.github)}">GitHub</a>`);
  if (profile.portfolio || profile.website)
    parts.push(`<a href="${esc(profile.portfolio||profile.website)}">Portfolio</a>`);
  parts.push(`Work Auth: ${esc(workAuth)}`);
  const contactLine = parts.join(" &nbsp;|&nbsp; ");

  // ── Tagline (pull from resumeData or use default)
  let tagline = "Distributed Systems | Go | REST APIs | Cloud Infrastructure";
  try {
    const rd = typeof profile.resumeData === "string" ? JSON.parse(profile.resumeData) : (profile.resumeData || {});
    if (rd.tagline) tagline = rd.tagline;
    else if (rd.skills && rd.skills.length >= 4) {
      // Build a tagline from top skills
      tagline = rd.skills.slice(0,4).join(" | ");
    }
  } catch (_) {}

  // ── Body: parse the AI-generated resume section or fall back to profile data
  const body = resumeSection
    ? parseResumeSection(resumeSection, profile)
    : buildBodyFromProfile(profile);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${esc(profile.firstName)} ${esc(profile.lastName)} — Resume</title>
<style>
  /* ── Base ── */
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Calibri', 'Segoe UI', Arial, sans-serif;
    font-size: 10.5pt;
    color: #1a1a1a;
    max-width: 8.5in;
    margin: 0 auto;
    padding: 0.55in 0.65in;
    line-height: 1.4;
    background: #fff;
  }

  /* ── Header ── */
  .r-header { text-align: center; margin-bottom: 6px; }
  .r-name {
    font-size: 20pt;
    font-weight: 700;
    letter-spacing: 1.5px;
    text-transform: uppercase;
    color: #0a0a0a;
    display: block;
  }
  .r-tagline {
    font-size: 10pt;
    color: #333;
    margin: 3px 0 5px;
    letter-spacing: 0.3px;
  }
  .r-contact {
    font-size: 9.5pt;
    color: #2a2a2a;
    margin-top: 2px;
  }
  .r-contact a { color: #1a0dab; text-decoration: none; }
  .r-contact a:hover { text-decoration: underline; }

  /* ── Section headings ── */
  .r-section { margin-top: 13px; }
  .r-section-title {
    font-size: 10.5pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.6px;
    color: #0a0a0a;
    border-bottom: 1.4px solid #0a0a0a;
    padding-bottom: 1px;
    margin-bottom: 7px;
  }

  /* ── Experience entries ── */
  .r-job { margin-bottom: 9px; }
  .r-job-header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 4px;
    margin-bottom: 3px;
  }
  .r-job-left {
    font-size: 10.5pt;
    font-weight: 700;
    color: #0a0a0a;
  }
  .r-job-left .r-role { font-weight: 700; }
  .r-job-left .r-sep  { font-weight: 400; color: #555; margin: 0 3px; }
  .r-job-right {
    font-size: 9.5pt;
    color: #444;
    white-space: nowrap;
    text-align: right;
  }
  .r-bullets { padding-left: 18px; margin: 0; }
  .r-bullets li {
    margin-bottom: 3px;
    line-height: 1.45;
    font-size: 10.5pt;
  }
  /* [Bold Tag] style — matches image */
  .r-bullets li .tag { font-weight: 700; }
  /* Bold inline phrases */
  .r-bullets li strong, .r-summary strong { font-weight: 700; }

  /* ── Summary ── */
  .r-summary {
    font-size: 10.5pt;
    line-height: 1.5;
    color: #1a1a1a;
  }

  /* ── Skills ── */
  .r-skills-table { width: 100%; border-collapse: collapse; }
  .r-skills-table td {
    font-size: 10.5pt;
    padding: 1.5px 0;
    vertical-align: top;
  }
  .r-skills-table td.sk-label {
    font-weight: 700;
    white-space: nowrap;
    padding-right: 6px;
    width: 1%;
  }

  /* ── Project ── */
  .r-project { margin-bottom: 8px; }
  .r-project-header {
    font-size: 10.5pt;
    font-weight: 700;
    margin-bottom: 3px;
  }
  .r-project-header .proj-tech {
    font-weight: 400;
    color: #444;
    font-style: italic;
  }

  /* ── Education ── */
  .r-edu-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 3px;
  }
  .r-edu-school { font-weight: 700; font-size: 10.5pt; }
  .r-edu-deg    { font-weight: 400; font-size: 10.5pt; }
  .r-edu-dates  { font-size: 9.5pt; color: #444; white-space: nowrap; }

  /* ── Certifications ── */
  .r-certs { font-size: 10pt; color: #1a1a1a; line-height: 1.55; }

  /* ── Generated note ── */
  .r-generated { margin-top: 20px; font-size: 8pt; color: #aaa; text-align: right; }

  /* ── Print ── */
  @media print {
    body { padding: 0.5in; }
    .r-generated { display: none; }
  }
</style>
</head>
<body>

<header class="r-header">
  <span class="r-name">${esc(profile.firstName)} ${esc(profile.lastName)}</span>
  <div class="r-tagline">${tagline}</div>
  <div class="r-contact">${contactLine}</div>
</header>

<main>${body}</main>

<p class="r-generated">Generated ${today}</p>
</body>
</html>`;
}

// ── PARSE AI RESUME SECTION ───────────────────────────────────────────────────
// Takes the raw AI-generated resume text and converts it to our exact HTML format.

function parseResumeSection(raw, profile) {
  const lines = raw.split(/\r?\n/);
  let html = "";
  let i = 0;

  const SECTION_RE = /^(PROFESSIONAL SUMMARY|SUMMARY|PROFESSIONAL EXPERIENCE|EXPERIENCE|TECHNICAL SKILLS|SKILLS|KEY PROJECT|PROJECTS?|EDUCATION|CERTIFICATIONS?|ADDITIONAL)\s*$/i;

  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line) { i++; continue; }

    if (SECTION_RE.test(line)) {
      const sectionName = line.toUpperCase();
      html += `<div class="r-section"><div class="r-section-title">${esc(line.toUpperCase())}</div>`;

      i++;
      // Collect section body lines
      const sectionLines = [];
      while (i < lines.length) {
        if (SECTION_RE.test(lines[i].trim()) && lines[i].trim() !== "") break;
        sectionLines.push(lines[i]);
        i++;
      }

      if (/SUMMARY/i.test(sectionName)) {
        html += buildSummaryHTML(sectionLines);
      } else if (/EXPERIENCE/i.test(sectionName)) {
        html += buildExperienceHTML(sectionLines);
      } else if (/SKILL/i.test(sectionName)) {
        html += buildSkillsHTML(sectionLines);
      } else if (/PROJECT/i.test(sectionName)) {
        html += buildProjectsHTML(sectionLines);
      } else if (/EDUCATION/i.test(sectionName)) {
        html += buildEducationHTML(sectionLines);
      } else if (/CERT/i.test(sectionName)) {
        html += buildCertsHTML(sectionLines);
      } else {
        html += buildGenericHTML(sectionLines);
      }

      html += `</div>`;
      continue;
    }
    i++;
  }

  // If parsing found nothing, fall back to profile data
  if (!html.trim()) return buildBodyFromProfile(profile);
  return html;
}

// ── SECTION BUILDERS ─────────────────────────────────────────────────────────

function buildSummaryHTML(lines) {
  const text = lines.join(" ").trim();
  if (!text) return "";
  return `<p class="r-summary">${formatInline(text)}</p>`;
}

function buildExperienceHTML(lines) {
  // Group into individual job blocks separated by blank lines or company lines
  let html = "";
  let jobLines = [];

  const flushJob = () => {
    if (!jobLines.length) return;
    html += buildSingleJobHTML(jobLines);
    jobLines = [];
  };

  for (const line of lines) {
    // A blank line between jobs
    if (!line.trim()) {
      // Only flush if we have content and the last jobLine wasn't also blank
      if (jobLines.length && jobLines[jobLines.length-1].trim()) {
        // Peek ahead — don't flush prematurely if more bullets follow
      }
      jobLines.push(line);
      continue;
    }
    jobLines.push(line);
  }
  flushJob();
  return html;
}

function buildSingleJobHTML(lines) {
  // Find the header line — it's the first non-blank, non-bullet line
  let headerIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (t && !t.startsWith("•") && !t.startsWith("-") && !t.startsWith("*")) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) return buildBulletList(lines);

  const header = lines[headerIdx].trim();
  const bullets = lines.slice(headerIdx + 1).filter(l => l.trim());

  // Parse header: various formats
  // "Company | Role — Location    Dates"
  // "Company | Role | Location | Dates"
  // "Company — Role   Dates"
  let company = "", role = "", location = "", dates = "";

  // Try to extract dates from end (e.g. "Jan 2025 – Present" or "2021 – 2022")
  const datesMatch = header.match(/(\w+\s+\d{4}\s*[–\-—]\s*(?:Present|\w+\s+\d{4})|\d{4}\s*[–\-—]\s*(?:Present|\d{4}))$/);
  if (datesMatch) {
    dates = datesMatch[1].trim();
  }

  // Extract location (after last | or ,  before dates)
  const withoutDates = header.replace(datesMatch ? datesMatch[0] : "", "").trim().replace(/[,|]\s*$/, "");

  // Split on | first
  const pipeParts = withoutDates.split("|").map(p => p.trim()).filter(Boolean);
  if (pipeParts.length >= 3) {
    company  = pipeParts[0];
    role     = pipeParts[1];
    location = pipeParts[2];
  } else if (pipeParts.length === 2) {
    // Check if second part contains "—" for role — location
    const dashIdx = pipeParts[1].indexOf("—");
    if (dashIdx > -1) {
      role     = pipeParts[1].substring(0, dashIdx).trim();
      location = pipeParts[1].substring(dashIdx+1).trim();
    } else {
      role     = pipeParts[1];
    }
    company = pipeParts[0];
  } else {
    // Single value — use as-is
    const dashIdx = withoutDates.indexOf("—");
    if (dashIdx > -1) {
      company = withoutDates.substring(0, dashIdx).trim();
      role    = withoutDates.substring(dashIdx+1).trim();
    } else {
      company = withoutDates;
    }
  }

  let jobLeftHTML = `<span class="r-job-left">${esc(company)}`;
  if (role)     jobLeftHTML += `<span class="r-sep"> | </span><span class="r-role">${esc(role)}</span>`;
  if (location) jobLeftHTML += `<span class="r-sep"> — </span>${esc(location)}`;
  jobLeftHTML += `</span>`;

  let html = `<div class="r-job">
  <div class="r-job-header">
    ${jobLeftHTML}
    <span class="r-job-right">${esc(dates)}</span>
  </div>`;

  if (bullets.length) {
    html += `<ul class="r-bullets">`;
    for (const b of bullets) {
      const clean = b.replace(/^[\s•\-*]+/, "").trim();
      if (clean) html += `<li>${formatBullet(clean)}</li>`;
    }
    html += `</ul>`;
  }
  html += `</div>`;
  return html;
}

function buildSkillsHTML(lines) {
  // Format: "Category: value1, value2" or plain list
  let html = `<table class="r-skills-table">`;
  let hasCategories = false;

  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    const colonIdx = t.indexOf(":");
    if (colonIdx > 0 && colonIdx < 35) {
      hasCategories = true;
      const label  = t.substring(0, colonIdx).trim();
      const values = t.substring(colonIdx+1).trim();
      html += `<tr><td class="sk-label">${esc(label)}:</td><td>${esc(values)}</td></tr>`;
    } else if (t.startsWith("•") || t.startsWith("-")) {
      html += `<tr><td colspan="2">${esc(t.replace(/^[•\-]\s*/,""))}</td></tr>`;
    } else if (t) {
      html += `<tr><td colspan="2">${esc(t)}</td></tr>`;
    }
  }
  html += `</table>`;
  return html;
}

function buildProjectsHTML(lines) {
  let html = "";
  let projLines = [];

  const flushProj = () => {
    if (!projLines.length) return;
    // First non-blank line is project header
    const headerLine = projLines.find(l => l.trim() && !l.trim().startsWith("•") && !l.trim().startsWith("-"));
    if (!headerLine) { html += buildBulletList(projLines); projLines = []; return; }

    const bullets = projLines.filter(l => l.trim() && (l.trim().startsWith("•") || l.trim().startsWith("-")));

    // Parse "ProjectName — Go, PostgreSQL, Kafka" or "ProjectName | tech"
    let name = headerLine.trim(), tech = "";
    const emDash = headerLine.indexOf(" — ");
    const pipe   = headerLine.indexOf(" | ");
    const sep    = emDash > -1 ? emDash : pipe > -1 ? pipe : -1;
    if (sep > -1) {
      name = headerLine.substring(0, sep).trim();
      tech = headerLine.substring(sep+3).trim();
    }

    html += `<div class="r-project">
  <div class="r-project-header">${esc(name)}${tech ? ` <span class="r-sep"> — </span><span class="proj-tech">${esc(tech)}</span>` : ""}</div>`;
    if (bullets.length) {
      html += `<ul class="r-bullets">`;
      for (const b of bullets) {
        const clean = b.replace(/^[\s•\-*]+/, "").trim();
        if (clean) html += `<li>${formatBullet(clean)}</li>`;
      }
      html += `</ul>`;
    }
    html += `</div>`;
    projLines = [];
  };

  for (const line of lines) {
    if (!line.trim() && projLines.some(l => l.trim())) { flushProj(); continue; }
    projLines.push(line);
  }
  flushProj();
  return html;
}

function buildEducationHTML(lines) {
  let html = "";
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;

    // Format: "School Name — Degree Field    Dates"
    // or "School | Degree | Dates"
    const datesMatch = t.match(/(\w+\s+\d{4}\s*[–\-—]\s*(?:Present|\w+\s+\d{4})|(?:Aug|Sep|Jan|Dec|May|Jun|Jul|Feb|Mar|Apr|Oct|Nov)\s+\d{4}|\d{4}\s*[–\-—]\s*(?:Present|\d{4})|\d{4})$/);
    const dates = datesMatch ? datesMatch[1].trim() : "";
    const withoutDates = t.replace(datesMatch ? datesMatch[0] : "", "").trim().replace(/\s*[|,]\s*$/, "");

    let school = "", degree = "";
    const emDash = withoutDates.indexOf(" — ");
    const pipe   = withoutDates.indexOf(" | ");
    const sep    = emDash > -1 ? emDash : pipe > -1 ? pipe : -1;
    if (sep > -1) {
      school = withoutDates.substring(0, sep).trim();
      degree = withoutDates.substring(sep + 3).trim();
    } else {
      school = withoutDates;
    }

    html += `<div class="r-edu-row">
  <span><span class="r-edu-school">${esc(school)}</span>${degree ? `<span class="r-edu-deg"> &mdash; ${esc(degree)}</span>` : ""}</span>
  <span class="r-edu-dates">${esc(dates)}</span>
</div>`;
  }
  return html;
}

function buildCertsHTML(lines) {
  const certs = lines.map(l => l.trim()).filter(Boolean).map(l => l.replace(/^[•\-*]\s*/, ""));
  if (!certs.length) return "";
  return `<p class="r-certs">${certs.map(c => esc(c)).join(" &nbsp;|&nbsp; ")}</p>`;
}

function buildGenericHTML(lines) {
  return buildBulletList(lines);
}

function buildBulletList(lines) {
  const items = lines.filter(l => l.trim());
  if (!items.length) return "";
  return `<ul class="r-bullets">${items.map(l => {
    const clean = l.trim().replace(/^[•\-*]\s*/, "");
    return clean ? `<li>${formatBullet(clean)}</li>` : "";
  }).join("")}</ul>`;
}

// ── PROFILE FALLBACK ──────────────────────────────────────────────────────────
// Used when AI doesn't return a parseable resume section.

function buildBodyFromProfile(profile) {
  let html = "";
  try {
    const rd = typeof profile.resumeData === "string"
      ? JSON.parse(profile.resumeData)
      : (profile.resumeData || {});

    // Summary
    if (rd.summary) {
      html += `<div class="r-section">
  <div class="r-section-title">PROFESSIONAL SUMMARY</div>
  <p class="r-summary">${formatInline(esc(rd.summary))}</p>
</div>`;
    }

    // Experience
    if (rd.experience?.length) {
      html += `<div class="r-section"><div class="r-section-title">PROFESSIONAL EXPERIENCE</div>`;
      for (const job of rd.experience) {
        html += `<div class="r-job">
  <div class="r-job-header">
    <span class="r-job-left">${esc(job.company)}<span class="r-sep"> | </span><span class="r-role">${esc(job.title)}</span></span>
    <span class="r-job-right">${esc(job.location||"")}${job.location&&job.dates?" &nbsp;|&nbsp; ":""}${esc(job.dates||"")}</span>
  </div>
  <ul class="r-bullets">${(job.bullets||[]).map(b => `<li>${formatBullet(esc(b))}</li>`).join("")}</ul>
</div>`;
      }
      html += `</div>`;
    }

    // Skills
    if (rd.skills?.length) {
      html += `<div class="r-section">
  <div class="r-section-title">TECHNICAL SKILLS</div>
  <p style="font-size:10.5pt">${esc(rd.skills.join(", "))}</p>
</div>`;
    }

    // Projects
    if (rd.projects?.length) {
      html += `<div class="r-section"><div class="r-section-title">KEY PROJECT</div>`;
      for (const p of rd.projects) {
        html += `<div class="r-project">
  <div class="r-project-header">${esc(p.name)}${p.tech?.length ? ` <span class="r-sep"> — </span><span class="proj-tech">${esc(p.tech.join(", "))}</span>` : ""}</div>
  <p style="font-size:10.5pt;margin-top:2px">${esc(p.description||"")}</p>
</div>`;
      }
      html += `</div>`;
    }

    // Education
    if (rd.education?.length) {
      html += `<div class="r-section"><div class="r-section-title">EDUCATION</div>`;
      for (const e of rd.education) {
        html += `<div class="r-edu-row">
  <span><span class="r-edu-school">${esc(e.school)}</span><span class="r-edu-deg"> &mdash; ${esc(e.degree)} ${esc(e.field||"")}</span></span>
  <span class="r-edu-dates">${esc(e.year||"")}</span>
</div>`;
      }
      html += `</div>`;
    }

    // Certifications
    if (rd.certifications?.length) {
      html += `<div class="r-section">
  <div class="r-section-title">CERTIFICATIONS</div>
  <p class="r-certs">${rd.certifications.map(c => esc(c)).join(" &nbsp;|&nbsp; ")}</p>
</div>`;
    }
  } catch (e) {
    html += `<p>(Could not parse resume data: ${esc(e.message)})</p>`;
  }
  return html;
}

// ── INLINE FORMATTERS ─────────────────────────────────────────────────────────

function formatBullet(text) {
  // [Bold Tag] → <span class="tag">Bold Tag</span>  (matches image style)
  text = text.replace(/\[([^\]]+)\]/g, (_, t) => `<span class="tag">[${esc(t)}]</span>`);
  // **bold** or __bold__
  text = text.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  text = text.replace(/__([^_]+)__/g, "<strong>$1</strong>");
  return text;
}

function formatInline(text) {
  text = text.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  text = text.replace(/__([^_]+)__/g, "<strong>$1</strong>");
  return text;
}

function esc(t) {
  if (!t) return "";
  return String(t)
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;");
}

// ── EXTRACT RESUME SECTION ────────────────────────────────────────────────────

function extractResumeSection(rawReport) {
  const patterns = [
    /(?:7\.?\s*Rewrite|Rewritten Resume|Tailored Resume|Updated Resume|Here(?:'s| is)[^:]*resume)[^\n]*\n([\s\S]+)/i,
    /(?:PROFESSIONAL SUMMARY|SUMMARY)\s*\n([\s\S]+)/i,
  ];
  for (const p of patterns) {
    const m = rawReport.match(p);
    if (m?.[1]?.trim().length > 100) return m[1].trim();
  }
  return null;
}

// ── PROMPT ────────────────────────────────────────────────────────────────────

function buildPrompt(jd, profile) {
  const resumeText = buildResumeText(profile);

  const system = `You are an expert ATS analyzer and resume consultant. Be thorough, specific, and actionable. 
Format your response with clear numbered sections and use tables for keyword analysis.
When you write the rewritten resume in section 7, use EXACTLY this structure with these exact section headings on their own lines:
PROFESSIONAL SUMMARY
PROFESSIONAL EXPERIENCE
TECHNICAL SKILLS
KEY PROJECT
EDUCATION
CERTIFICATIONS`;

  const user = `I need you to act as an expert ATS (Applicant Tracking System) analyzer and resume consultant. 
Please review my resume in comparison with the target job description and provide:

1. ATS Score Analysis:
   • Overall ATS compatibility score out of 100
   • Explain scoring methodology
   • Identify formatting or structural issues
   • Check keywords, standard headings, machine-readable format

2. Job Description Match Analysis:
   • Match percentage between resume and job description
   • Key requirements from JD and which ones my resume addresses
   • Critical keywords from JD missing in my resume
   • Skills/qualifications to emphasize more
   • Gaps between job requirements and my resume

3. Detailed Section-by-Section Breakdown:
   For each section (Summary, Experience, Skills, Education):
   - Good Points: what's working well
   - Points to Improve: what needs enhancement
   - Points to Add: what's missing

4. Keyword Optimization Table:
   (Table format: Keyword | Times in Resume | Priority | Suggested Placement)
   Top 10-15 keywords from the job description.

5. Content Alignment Recommendations:
   • Which experiences to emphasize more
   • Achievements to add or modify
   • Irrelevant sections to minimize

6. Overall Strategy:
   • Top 3-5 changes to improve chances
   • Formatting improvements
   • Final recommendations

7. Rewrite my resume:
   Write the COMPLETE rewritten resume content below. Use EXACTLY these section headings on their own lines (no numbers, no dashes):

PROFESSIONAL SUMMARY
[Write a 3-4 sentence tailored summary]

PROFESSIONAL EXPERIENCE
[For each job, write on ONE line: Company | Role — Location    Dates
Then bullets starting with • using [Bold Tag] format like: • [Achievement Category] Description with **bold metrics**]

TECHNICAL SKILLS
[Write as: Category: value1, value2, value3
One category per line]

KEY PROJECT
[Project Name — Tech Stack, Tech Stack
• [Bold Tag] Description bullet
• [Bold Tag] Description bullet]

EDUCATION
[School Name — Degree Field    Dates
One school per line]

CERTIFICATIONS
[Cert1 | Cert2 | Cert3 on one line]

Here is my resume:
${resumeText}

Here is the target job description:
${jd}`;

  return { system, user };
}

function buildResumeText(profile) {
  let text = `Name: ${profile.firstName} ${profile.lastName}
Email: ${profile.email||""} | Phone: ${profile.phone||""} | Location: ${profile.location||""}
LinkedIn: ${profile.linkedin||""} | GitHub: ${profile.github||""} | Portfolio: ${profile.portfolio||profile.website||""}
Work Authorization: H1B Visa\n\n`;

  try {
    const rd = typeof profile.resumeData === "string"
      ? JSON.parse(profile.resumeData)
      : (profile.resumeData || {});

    if (rd.experience?.length) {
      text += "PROFESSIONAL EXPERIENCE\n";
      for (const job of rd.experience) {
        text += `\n${job.title} | ${job.company} | ${job.dates} | ${job.location||""}\n`;
        (job.bullets||[]).forEach(b => { text += `• ${b}\n`; });
      }
    }
    if (rd.skills?.length) {
      text += `\nTECHNICAL SKILLS\n${rd.skills.join(", ")}\n`;
    }
    if (rd.education?.length) {
      text += "\nEDUCATION\n";
      for (const e of rd.education) {
        text += `${e.degree} in ${e.field} | ${e.school} | ${e.year}\n`;
      }
    }
    if (rd.certifications?.length) {
      text += `\nCERTIFICATIONS\n${rd.certifications.join(" | ")}\n`;
    }
    if (rd.projects?.length) {
      text += "\nPROJECTS\n";
      for (const p of rd.projects) {
        text += `${p.name}: ${p.description} | Tech: ${(p.tech||[]).join(", ")}\n`;
      }
    }
  } catch {
    text += "(Resume data parsing error)\n";
  }
  return text;
}

// ── FULL ANALYSIS HANDLER ─────────────────────────────────────────────────────

async function handleFullAnalysis(jd, profile, senderTabId) {
  const { system, user } = buildPrompt(jd, profile);

  const controller = new AbortController();
  currentAnalysis = { controller, startedAt: Date.now(), jd };

  const onToken = (token) => {
    chrome.runtime.sendMessage({ action: "streamToken", token }, () => {
      if (chrome.runtime.lastError) { /* popup closed */ }
    });
  };

  try {
    const rawReport = await ollamaStream(system, user, onToken, controller.signal);

    let atsScore = 0;
    const m = rawReport.match(/(?:ATS|overall)[^\d]*(\d{2,3})\s*(?:\/\s*100|%|out of)/i)
            || rawReport.match(/score[^\d]*(\d{2,3})\s*\/\s*100/i)
            || rawReport.match(/\b(\d{2,3})\s*\/\s*100\b/);
    if (m) atsScore = Math.min(100, Math.max(0, parseInt(m[1])));

    const resumeSection = extractResumeSection(rawReport);
    const resumeHTML    = buildResumeHTML(profile, resumeSection);

    await chrome.storage.local.set({
      lastSession: {
        report:      rawReport,
        resumeHTML,
        coverLetter: "",
        atsScore,
        jd,
        savedAt: Date.now(),
      },
    });

    return { success: true, report: rawReport, atsScore, resumeHTML };
  } finally {
    if (currentAnalysis && currentAnalysis.controller === controller) {
      currentAnalysis = null;
    }
  }
}

// ── MESSAGE ROUTER ────────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {

  if (req.action === "checkOllama") {
    checkOllama().then(sendResponse);
    return true;
  }

  if (req.action === "fullAnalysis") {
    handleFullAnalysis(req.jd, req.profile, sender?.tab?.id)
      .then(sendResponse)
      .catch(e => {
        const msg = e.message || String(e);
        if (e.name === "AbortError" || msg === "CANCELLED") {
          sendResponse({ success: false, error: "CANCELLED" });
        } else if (msg === "403_CORS") {
          sendResponse({ success: false, error: "403_CORS" });
        } else {
          sendResponse({ success: false, error: msg });
        }
      });
    return true;
  }

  if (req.action === "cancelAnalysis") {
    if (currentAnalysis?.controller) {
      currentAnalysis.controller.abort();
      currentAnalysis = null;
      sendResponse({ cancelled: true });
    } else {
      sendResponse({ cancelled: false });
    }
    return true;
  }

  if (req.action === "getAnalysisStatus") {
    sendResponse(currentAnalysis
      ? { running: true, startedAt: currentAnalysis.startedAt }
      : { running: false });
    return true;
  }

  if (req.action === "download") {
    const mime = req.mime || "text/plain";
    const url  = `data:${mime};charset=utf-8,` + encodeURIComponent(req.content || "");
    chrome.downloads.download({ url, filename: req.filename, saveAs: true }, () => {
      sendResponse({ success: true });
    });
    return true;
  }

  if (req.action === "autofillTab") {
    chrome.tabs.sendMessage(req.tabId, { action: "autofill", profile: req.profile }, (r) => {
      if (chrome.runtime.lastError) {
        const msg = chrome.runtime.lastError.message || "";
        const friendly = msg.includes("Receiving end") || msg.includes("receiving end")
          ? "Open a job application page (e.g. LinkedIn, Greenhouse), then click Autofill again."
          : msg;
        sendResponse({ success: false, error: friendly });
        return;
      }
      sendResponse(r || { success: false, error: "No response from page" });
    });
    return true;
  }

  return true;
});
