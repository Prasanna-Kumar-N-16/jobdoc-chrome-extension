// background/service-worker.js — JobHunt AI Copilot v3

const DEFAULT_BASE  = "http://localhost:11434";
const DEFAULT_MODEL = "llama3";

let activeGeneration = null; // { controller, startedAt }

function fetchWithTimeout(url, init = {}, timeoutMs = 4000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  if (init.signal) {
    if (init.signal.aborted) controller.abort();
    else init.signal.addEventListener("abort", () => controller.abort(), { once: true });
  }
  return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(t));
}

// ── CONFIG ────────────────────────────────────────────────────────────────────
async function cfg() {
  return chrome.storage.local.get([
    "ollamaUrl","ollamaModel",
    "firstName","lastName","email","phone","location","linkedin",
    "website","github","portfolio","resumeData","visaStatus"
  ]);
}

// ── CHECK OLLAMA ──────────────────────────────────────────────────────────────
async function checkOllama() {
  try {
    const { ollamaUrl } = await cfg();
    const base = ollamaUrl || DEFAULT_BASE;
    const res = await fetchWithTimeout(base + "/api/tags", {}, 4000);
    if (!res.ok) return { online: false, status: res.status };
    const data = await res.json();
    const models = (data.models || []).map(m => m.name);
    const { ollamaModel } = await cfg();
    return { online: true, models, model: ollamaModel || DEFAULT_MODEL };
  } catch (e) {
    return { online: false, error: e.message };
  }
}

// ── OLLAMA STREAMING ──────────────────────────────────────────────────────────
async function ollamaStream(system, user, onToken, signal) {
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
      options: { temperature: 0.22, num_ctx: 14000 },
      messages: [
        { role: "system", content: system },
        { role: "user",   content: user   }
      ]
    })
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    if (res.status === 403) throw new Error("403_CORS");
    if (res.status === 404) throw new Error(`MODEL_NOT_FOUND:${model}`);
    throw new Error(`Ollama ${res.status}: ${txt.substring(0, 300)}`);
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
        if (obj.done) return full;
      } catch { /* partial JSON */ }
    }
  }
  return full;
}

// ── SYSTEM PROMPT ─────────────────────────────────────────────────────────────
function buildSystemPrompt() {
  return `You are a world-class job application coach specializing in US tech roles. You write laser-focused, authentic, compelling content for engineers. You are direct, specific, and always lead with impact. You follow all output format instructions exactly.`;
}

// ── FULL ANALYZE + GENERATE PROMPT ────────────────────────────────────────────
function buildAnalyzePrompt(jd, profile, mode, customInstructions) {
  const resume = buildResumeText(profile);
  const custom = customInstructions
    ? `\n\nCUSTOM INSTRUCTIONS FROM CANDIDATE: ${customInstructions}`
    : "";

  const modeInstructions = {
    both:    "Generate BOTH resume bullets AND a cover letter.",
    bullets: "Generate ONLY resume bullets.",
    cover:   "Generate ONLY a cover letter.",
    pitch:   "Generate ONLY an elevator pitch."
  }[mode] || "Generate BOTH resume bullets AND a cover letter.";

  let rd = {};
  try { rd = JSON.parse(profile.resumeData || "{}"); } catch {}

  return `I need a comprehensive ATS analysis and tailored application content for the job below.

MY PROFILE:
${resume}

WRITING RULES (follow exactly):
- Write like a senior engineer who ships real things, not a student or template
- Lead with IMPACT first → what → how
- Strong action verbs only: Built, Designed, Shipped, Reduced, Improved, Refactored, Implemented, Architected
- Quantify everything using my actual numbers
- NEVER use: "responsible for", "worked on", "passionate about", "team player", "detail-oriented"
- Resume bullets: 1-2 lines max, start with •, every bullet must have a metric
- Cover letter: 3 paragraphs, under 220 words, direct and confident
- NEVER start cover letter with "I am writing to apply" or "I am excited to apply"
- Mention Kafka, Go, distributed systems when relevant

VISA NOTE: ${profile.visaStatus || rd.visaStatus || "H1B Visa — Transfer Eligible"}. Frame positively in cover letter Para 3.

${modeInstructions}${custom}

---

Please respond with exactly these sections in this order:

### ATS SCORE
[Single number 0-100 with explanation in 1 sentence]

### ATS ANALYSIS
[3-5 bullet points on keyword gaps and structural issues]

### KEYWORD TABLE
| Keyword | In Resume | Priority | Placement |
[10-12 rows]

### KEY GAPS
[3-4 specific gaps as bullet points]

${mode !== "pitch" ? `### RESUME BULLETS
[5-6 bullets starting with •, using [Bold Tag] format like: • [Toyota North America] Built Go microservices...]
` : ""}
${(mode === "both" || mode === "cover") ? `### COVER LETTER
[3 paragraphs, under 220 words total, starts with a specific hook about the company]
` : ""}
${mode === "pitch" ? `### ELEVATOR PITCH
[60-80 words, conversational, ends with why this company specifically]
` : ""}
### TAILORED RESUME
PROFESSIONAL SUMMARY
[3-4 sentence summary tailored to this role]

PROFESSIONAL EXPERIENCE
[For each job, EXACTLY this format:
Company | Role — Location     Dates
• [Bold Tag] Bullet with metric
• [Bold Tag] Bullet with metric]

TECHNICAL SKILLS
[Category: value1, value2, value3
One category per line. Use these categories: Languages, APIs & Protocols, Cloud & Infrastructure, Databases, DevOps & CI/CD, Observability, Architecture Patterns]

KEY PROJECT
Authentication & Token Custody Microservice — Go, PostgreSQL, Kafka, JWT, Docker, Kubernetes, CI/CD
• [Bullet 1]
• [Bullet 2]

EDUCATION
Southern Arkansas University — M.S. Computer Science     Aug 2023 – Dec 2024
University Visvesvaraya College of Engineering — B.E. Electronics & Communication Engineering     2017 – 2021

CERTIFICATIONS
AWS Cloud Essentials (Mar 2025) | GitHub Foundations (Jan 2025) | Postman API Fundamentals Expert (Dec 2024)

---

JOB DESCRIPTION:
${jd}`;
}

// ── PARSE AI RESPONSE ─────────────────────────────────────────────────────────
function parseAIResponse(raw, mode) {
  const section = (name) => {
    const patterns = [
      new RegExp(`###\\s*${name}\\s*\\n([\\s\\S]*?)(?=###|$)`, "i"),
      new RegExp(`\\*\\*${name}\\*\\*\\s*\\n([\\s\\S]*?)(?=###|\\*\\*[A-Z]|$)`, "i"),
    ];
    for (const p of patterns) {
      const m = raw.match(p);
      if (m?.[1]?.trim()) return m[1].trim();
    }
    return "";
  };

  // ATS score
  let atsScore = 0;
  const scoreSection = section("ATS SCORE");
  const scoreMatch = scoreSection.match(/\b(\d{2,3})\b/)
    || raw.match(/(?:ATS|overall|score)[^\d]*(\d{2,3})\s*(?:\/\s*100|%|out of)/i)
    || raw.match(/\b(\d{2,3})\s*\/\s*100\b/);
  if (scoreMatch) atsScore = Math.min(100, Math.max(0, parseInt(scoreMatch[1])));

  // Bullets
  let bullets = "";
  const bulletsRaw = section("RESUME BULLETS");
  if (bulletsRaw) {
    bullets = bulletsRaw.split("\n")
      .filter(l => l.trim().startsWith("•") || l.trim().startsWith("-"))
      .map(l => l.replace(/^[-•]\s*/, "• ").trim())
      .join("\n");
  }

  // Cover letter
  let coverLetter = "";
  const coverRaw = section("COVER LETTER");
  if (coverRaw) {
    coverLetter = coverRaw.trim();
  }

  // Elevator pitch
  let pitch = "";
  const pitchRaw = section("ELEVATOR PITCH");
  if (pitchRaw) pitch = pitchRaw.trim();

  // Full resume section
  const resumeSection = section("TAILORED RESUME") || extractTailoredResume(raw);

  return { atsScore, bullets, coverLetter, pitch, resumeSection, rawReport: raw };
}

function extractTailoredResume(raw) {
  const patterns = [
    /(?:TAILORED RESUME|REWRITTEN RESUME|TAILORED RESUME CONTENT)[^\n]*\n([\s\S]+)/i,
    /(?:PROFESSIONAL SUMMARY)\s*\n([\s\S]+)/i,
  ];
  for (const p of patterns) {
    const m = raw.match(p);
    if (m?.[1]?.trim().length > 80) return m[1].trim();
  }
  return "";
}

// ── RESUME HTML BUILDER ───────────────────────────────────────────────────────
function buildResumeHTML(profile, resumeSection) {
  let rd = {};
  try { rd = JSON.parse(profile.resumeData || "{}"); } catch {}

  const tagline = rd.tagline || "Distributed Systems · Go · Kafka · Cloud Infrastructure · AWS";
  const workAuth = profile.visaStatus || rd.visaStatus || "H1B Visa — Transfer Eligible";
  const name = `${profile.firstName || ""} ${profile.lastName || ""}`.trim();

  // Contact line
  const parts = [];
  if (profile.phone)    parts.push(e(profile.phone));
  if (profile.email)    parts.push(`<a href="mailto:${e(profile.email)}">${e(profile.email)}</a>`);
  if (profile.linkedin) parts.push(`<a href="${e(profile.linkedin)}">LinkedIn</a>`);
  if (profile.github)   parts.push(`<a href="${e(profile.github)}">GitHub</a>`);
  parts.push(`Work Auth: ${e(workAuth)}`);

  const body = resumeSection
    ? parseResumeToHTML(resumeSection, profile, rd)
    : buildBodyFromProfile(rd, profile);

  const today = new Date().toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"});

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${e(name)} — Resume</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
body{font-family:'Calibri','Segoe UI',Arial,sans-serif;font-size:10.5pt;color:#1a1a1a;
  max-width:8.5in;margin:0 auto;padding:0.55in 0.65in;line-height:1.4;background:#fff;}
.r-header{text-align:center;margin-bottom:7px;}
.r-name{font-size:21pt;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#0a0a0a;display:block;}
.r-tagline{font-size:10pt;color:#333;margin:3px 0 5px;letter-spacing:0.3px;}
.r-contact{font-size:9.5pt;color:#2a2a2a;}
.r-contact a{color:#1a0dab;text-decoration:none;}
.r-section{margin-top:13px;}
.r-section-title{font-size:10.5pt;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:#0a0a0a;
  border-bottom:1.4px solid #0a0a0a;padding-bottom:1px;margin-bottom:7px;}
.r-job{margin-bottom:9px;}
.r-job-header{display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:4px;margin-bottom:3px;}
.r-job-left{font-size:10.5pt;font-weight:700;color:#0a0a0a;}
.r-sep{font-weight:400;color:#555;margin:0 3px;}
.r-role{font-weight:700;}
.r-job-right{font-size:9.5pt;color:#444;white-space:nowrap;text-align:right;}
.r-bullets{padding-left:18px;margin:0;}
.r-bullets li{margin-bottom:3px;line-height:1.45;font-size:10.5pt;}
.r-bullets li .tag{font-weight:700;}
.r-bullets li strong,.r-summary strong{font-weight:700;}
.r-summary{font-size:10.5pt;line-height:1.5;color:#1a1a1a;}
.r-skills-table{width:100%;border-collapse:collapse;}
.r-skills-table td{font-size:10.5pt;padding:1.5px 0;vertical-align:top;}
.r-skills-table td.sk-l{font-weight:700;white-space:nowrap;padding-right:6px;width:1%;}
.r-project{margin-bottom:8px;}
.r-project-header{font-size:10.5pt;font-weight:700;margin-bottom:3px;}
.r-project-header .proj-tech{font-weight:400;color:#444;font-style:italic;}
.r-edu-row{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:3px;}
.r-edu-school{font-weight:700;font-size:10.5pt;}
.r-edu-deg{font-weight:400;font-size:10.5pt;}
.r-edu-dates{font-size:9.5pt;color:#444;white-space:nowrap;}
.r-certs{font-size:10pt;color:#1a1a1a;line-height:1.55;}
.r-footer{margin-top:18px;font-size:8pt;color:#aaa;text-align:right;}
@media print{body{padding:0.5in;}.r-footer{display:none;}}
</style>
</head>
<body>
<header class="r-header">
  <span class="r-name">${e(name)}</span>
  <div class="r-tagline">${e(tagline)}</div>
  <div class="r-contact">${parts.join(" &nbsp;|&nbsp; ")}</div>
</header>
<main>${body}</main>
<p class="r-footer">Generated ${today} · JobHunt AI Copilot v3</p>
</body>
</html>`;
}

// ── RESUME SECTION PARSER ─────────────────────────────────────────────────────
function parseResumeToHTML(raw, profile, rd) {
  const SECTION_RE = /^(PROFESSIONAL SUMMARY|SUMMARY|PROFESSIONAL EXPERIENCE|EXPERIENCE|TECHNICAL SKILLS|SKILLS|KEY PROJECTS?|EDUCATION|CERTIFICATIONS?)\s*$/i;
  const lines = raw.split(/\r?\n/);
  let html = "", i = 0;

  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line) { i++; continue; }
    if (SECTION_RE.test(line)) {
      const sectionName = line.toUpperCase();
      html += `<div class="r-section"><div class="r-section-title">${e(sectionName)}</div>`;
      i++;
      const sectionLines = [];
      while (i < lines.length) {
        if (SECTION_RE.test(lines[i].trim()) && lines[i].trim()) break;
        sectionLines.push(lines[i]);
        i++;
      }
      if (/SUMMARY/i.test(sectionName))    html += buildSummaryHTML(sectionLines);
      else if (/EXPERIENCE/i.test(sectionName)) html += buildExpHTML(sectionLines);
      else if (/SKILL/i.test(sectionName)) html += buildSkillsHTML(sectionLines);
      else if (/PROJECT/i.test(sectionName)) html += buildProjectsHTML(sectionLines);
      else if (/EDUCATION/i.test(sectionName)) html += buildEduHTML(sectionLines);
      else if (/CERT/i.test(sectionName)) html += buildCertsHTML(sectionLines);
      else html += buildBulletListHTML(sectionLines);
      html += "</div>";
      continue;
    }
    i++;
  }
  return html.trim() ? html : buildBodyFromProfile(rd, profile);
}

function buildSummaryHTML(lines) {
  const text = lines.join(" ").trim();
  return text ? `<p class="r-summary">${fmtInline(text)}</p>` : "";
}

function buildExpHTML(lines) {
  let html = "", jobLines = [];
  const flush = () => { if (jobLines.length) { html += buildSingleJobHTML(jobLines); jobLines = []; } };
  for (const line of lines) {
    if (!line.trim() && jobLines.length) { jobLines.push(line); continue; }
    jobLines.push(line);
  }
  flush();
  return html;
}

function buildSingleJobHTML(lines) {
  let hi = -1;
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (t && !t.startsWith("•") && !t.startsWith("-") && !t.startsWith("*")) { hi = i; break; }
  }
  if (hi === -1) return buildBulletListHTML(lines);

  const header  = lines[hi].trim();
  const bullets = lines.slice(hi + 1).filter(l => l.trim() && (l.trim().startsWith("•") || l.trim().startsWith("-")));

  // Dates
  const datesM = header.match(/(\w+\s+\d{4}\s*[–\-—]\s*(?:Present|\w+\s+\d{4})|\d{4}\s*[–\-—]\s*(?:Present|\d{4}))$/);
  const dates = datesM ? datesM[1].trim() : "";
  const withoutDates = header.replace(datesM ? datesM[0] : "", "").trim().replace(/[,|]\s*$/, "");

  let company = "", role = "", location = "";
  const pipes = withoutDates.split("|").map(p => p.trim()).filter(Boolean);
  if (pipes.length >= 3) { [company, role, location] = pipes; }
  else if (pipes.length === 2) {
    company = pipes[0];
    const di = pipes[1].indexOf("—");
    if (di > -1) { role = pipes[1].substring(0, di).trim(); location = pipes[1].substring(di + 1).trim(); }
    else role = pipes[1];
  } else {
    const di = withoutDates.indexOf("—");
    if (di > -1) { company = withoutDates.substring(0, di).trim(); role = withoutDates.substring(di + 1).trim(); }
    else company = withoutDates;
  }

  let left = `<span class="r-job-left">${e(company)}`;
  if (role)     left += `<span class="r-sep"> | </span><span class="r-role">${e(role)}</span>`;
  if (location) left += `<span class="r-sep"> — </span>${e(location)}`;
  left += "</span>";

  let html = `<div class="r-job"><div class="r-job-header">${left}<span class="r-job-right">${e(dates)}</span></div>`;
  if (bullets.length) {
    html += `<ul class="r-bullets">`;
    for (const b of bullets) {
      const clean = b.replace(/^[\s•\-*]+/, "").trim();
      if (clean) html += `<li>${fmtBullet(clean)}</li>`;
    }
    html += `</ul>`;
  }
  return html + "</div>";
}

function buildSkillsHTML(lines) {
  let html = `<table class="r-skills-table">`;
  for (const line of lines) {
    const t = line.trim(); if (!t) continue;
    const ci = t.indexOf(":");
    if (ci > 0 && ci < 35) {
      html += `<tr><td class="sk-l">${e(t.substring(0, ci))}:</td><td>${e(t.substring(ci + 1).trim())}</td></tr>`;
    } else {
      html += `<tr><td colspan="2">${e(t.replace(/^[•\-]\s*/,""))}</td></tr>`;
    }
  }
  return html + "</table>";
}

function buildProjectsHTML(lines) {
  let html = "", projLines = [];
  const flush = () => {
    if (!projLines.length) return;
    const hl = projLines.find(l => l.trim() && !l.trim().startsWith("•") && !l.trim().startsWith("-"));
    if (!hl) { html += buildBulletListHTML(projLines); projLines = []; return; }
    const bl = projLines.filter(l => l.trim() && (l.trim().startsWith("•") || l.trim().startsWith("-")));
    let name = hl.trim(), tech = "";
    const si = hl.indexOf(" — "), pi = hl.indexOf(" | ");
    const sep = si > -1 ? si : pi > -1 ? pi : -1;
    if (sep > -1) { name = hl.substring(0, sep).trim(); tech = hl.substring(sep + 3).trim(); }
    html += `<div class="r-project"><div class="r-project-header">${e(name)}${tech ? `<span class="r-sep"> — </span><span class="proj-tech">${e(tech)}</span>` : ""}</div>`;
    if (bl.length) {
      html += `<ul class="r-bullets">`;
      for (const b of bl) { const c = b.replace(/^[\s•\-*]+/,"").trim(); if (c) html += `<li>${fmtBullet(c)}</li>`; }
      html += `</ul>`;
    }
    html += "</div>";
    projLines = [];
  };
  for (const line of lines) {
    if (!line.trim() && projLines.some(l => l.trim())) { flush(); continue; }
    projLines.push(line);
  }
  flush();
  return html;
}

function buildEduHTML(lines) {
  let html = "";
  for (const line of lines) {
    const t = line.trim(); if (!t) continue;
    const dm = t.match(/(\w+\s+\d{4}\s*[–\-—]\s*(?:Present|\w+\s+\d{4})|(?:Aug|Sep|Jan|Dec|May|Jun|Jul|Feb|Mar|Apr|Oct|Nov)\s+\d{4}|\d{4}\s*[–\-—]\s*(?:Present|\d{4})|\d{4})$/);
    const dates = dm ? dm[1].trim() : "";
    const wo = t.replace(dm ? dm[0] : "", "").trim().replace(/\s*[|,]\s*$/, "");
    let school = wo, deg = "";
    const si = wo.indexOf(" — "), pi = wo.indexOf(" | ");
    const sep = si > -1 ? si : pi > -1 ? pi : -1;
    if (sep > -1) { school = wo.substring(0, sep).trim(); deg = wo.substring(sep + 3).trim(); }
    html += `<div class="r-edu-row">
  <span><span class="r-edu-school">${e(school)}</span>${deg ? `<span class="r-edu-deg"> &mdash; ${e(deg)}</span>` : ""}</span>
  <span class="r-edu-dates">${e(dates)}</span>
</div>`;
  }
  return html;
}

function buildCertsHTML(lines) {
  const certs = lines.map(l => l.trim()).filter(Boolean).map(l => l.replace(/^[•\-*]\s*/, ""));
  return certs.length ? `<p class="r-certs">${certs.map(c => e(c)).join(" &nbsp;|&nbsp; ")}</p>` : "";
}

function buildBulletListHTML(lines) {
  const items = lines.filter(l => l.trim());
  if (!items.length) return "";
  return `<ul class="r-bullets">${items.map(l => {
    const c = l.trim().replace(/^[•\-*]\s*/, "");
    return c ? `<li>${fmtBullet(c)}</li>` : "";
  }).join("")}</ul>`;
}

// ── PROFILE FALLBACK (when AI resume parse fails) ─────────────────────────────
function buildBodyFromProfile(rd, profile) {
  let html = "";
  if (rd.summary) {
    html += `<div class="r-section"><div class="r-section-title">PROFESSIONAL SUMMARY</div><p class="r-summary">${fmtInline(e(rd.summary))}</p></div>`;
  }
  if (rd.experience?.length) {
    html += `<div class="r-section"><div class="r-section-title">PROFESSIONAL EXPERIENCE</div>`;
    for (const job of rd.experience) {
      html += `<div class="r-job"><div class="r-job-header">
  <span class="r-job-left">${e(job.company)}<span class="r-sep"> | </span><span class="r-role">${e(job.title)}</span></span>
  <span class="r-job-right">${e(job.location || "")}${job.location && job.dates ? " &nbsp;|&nbsp; " : ""}${e(job.dates || "")}</span>
</div>
<ul class="r-bullets">${(job.bullets || []).map(b => `<li>${fmtBullet(e(b))}</li>`).join("")}</ul>
</div>`;
    }
    html += "</div>";
  }
  if (rd.skills?.length) {
    // Group by type
    const cats = {
      "Languages": ["Go","Golang","Python","Java","SQL"],
      "APIs & Protocols": ["REST","gRPC","GraphQL","JWT","OAuth2","TLS","RBAC"],
      "Cloud & Infrastructure": ["AWS","EKS","EC2","RDS","S3","Lambda","SQS","SNS","DynamoDB"],
      "Databases": ["PostgreSQL","MySQL","MongoDB","Redis","Elasticsearch"],
      "DevOps & CI/CD": ["Docker","Kubernetes","Terraform","GitHub Actions","Jenkins"],
      "Observability": ["Prometheus","Grafana","CloudWatch","DataDog"],
      "Architecture": ["Microservices","Kafka","Event-Driven","Distributed Systems"]
    };
    html += `<div class="r-section"><div class="r-section-title">TECHNICAL SKILLS</div><table class="r-skills-table">`;
    for (const [cat, keywords] of Object.entries(cats)) {
      const matches = rd.skills.filter(s => keywords.some(k => s.toLowerCase().includes(k.toLowerCase())));
      if (matches.length) html += `<tr><td class="sk-l">${e(cat)}:</td><td>${e(matches.join(", "))}</td></tr>`;
    }
    const uncatSkills = rd.skills.filter(s => !Object.values(cats).flat().some(k => s.toLowerCase().includes(k.toLowerCase())));
    if (uncatSkills.length) html += `<tr><td class="sk-l">Other:</td><td>${e(uncatSkills.join(", "))}</td></tr>`;
    html += "</table></div>";
  }
  if (rd.projects?.length) {
    html += `<div class="r-section"><div class="r-section-title">KEY PROJECT</div>`;
    for (const p of rd.projects) {
      html += `<div class="r-project"><div class="r-project-header">${e(p.name)}${p.tech?.length ? `<span class="r-sep"> — </span><span class="proj-tech">${e(p.tech.join(", "))}</span>` : ""}</div>
<ul class="r-bullets">${(p.bullets || []).map(b => `<li>${fmtBullet(e(b))}</li>`).join("")}</ul></div>`;
    }
    html += "</div>";
  }
  if (rd.education?.length) {
    html += `<div class="r-section"><div class="r-section-title">EDUCATION</div>`;
    for (const edu of rd.education) {
      html += `<div class="r-edu-row">
  <span><span class="r-edu-school">${e(edu.school)}</span><span class="r-edu-deg"> &mdash; ${e(edu.degree)} ${e(edu.field || "")}</span></span>
  <span class="r-edu-dates">${e(edu.year || "")}</span>
</div>`;
    }
    html += "</div>";
  }
  if (rd.certifications?.length) {
    html += `<div class="r-section"><div class="r-section-title">CERTIFICATIONS</div><p class="r-certs">${rd.certifications.map(c => e(c)).join(" &nbsp;|&nbsp; ")}</p></div>`;
  }
  return html;
}

// ── RESUME TEXT (sent to LLM) ─────────────────────────────────────────────────
function buildResumeText(profile) {
  let rd = {};
  try { rd = JSON.parse(profile.resumeData || "{}"); } catch {}

  let text = `CANDIDATE: ${profile.firstName} ${profile.lastName}
Email: ${profile.email || ""} | Phone: ${profile.phone || ""} | Location: ${profile.location || ""}
LinkedIn: ${profile.linkedin || ""} | GitHub: ${profile.github || ""}
Work Authorization: ${profile.visaStatus || rd.visaStatus || "H1B Visa — Transfer Eligible"}

`;
  if (rd.summary) text += `SUMMARY\n${rd.summary}\n\n`;

  if (rd.experience?.length) {
    text += "PROFESSIONAL EXPERIENCE\n";
    for (const job of rd.experience) {
      text += `\n${job.company} | ${job.title} | ${job.dates} | ${job.location || ""}\n`;
      (job.bullets || []).forEach(b => { text += `• ${b}\n`; });
    }
  }

  if (rd.skills?.length) text += `\nTECHNICAL SKILLS\n${rd.skills.join(", ")}\n`;

  if (rd.education?.length) {
    text += "\nEDUCATION\n";
    for (const edu of rd.education) text += `${edu.degree} in ${edu.field || ""} — ${edu.school} | ${edu.year || ""}\n`;
  }

  if (rd.certifications?.length) text += `\nCERTIFICATIONS\n${rd.certifications.join(" | ")}\n`;

  if (rd.projects?.length) {
    text += "\nPROJECTS\n";
    for (const p of rd.projects) text += `${p.name} | Tech: ${(p.tech || []).join(", ")}\n${p.description || ""}\n`;
  }

  return text;
}

// ── INLINE FORMATTERS ─────────────────────────────────────────────────────────
function fmtBullet(text) {
  text = text.replace(/\[([^\]]+)\]/g, (_, t) => `<span class="tag">[${e(t)}]</span>`);
  text = text.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  text = text.replace(/__([^_]+)__/g, "<strong>$1</strong>");
  return text;
}
function fmtInline(text) {
  text = text.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  text = text.replace(/__([^_]+)__/g, "<strong>$1</strong>");
  return text;
}
function e(t) {
  if (!t) return "";
  return String(t).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

// ── FULL GENERATE HANDLER ─────────────────────────────────────────────────────
async function handleGenerate(jd, profile, mode, customInstructions) {
  const system = buildSystemPrompt();
  const user   = buildAnalyzePrompt(jd, profile, mode, customInstructions);

  const controller = new AbortController();
  activeGeneration = { controller, startedAt: Date.now() };

  const onToken = (token) => {
    chrome.runtime.sendMessage({ action: "streamToken", token }, () => {
      if (chrome.runtime.lastError) { /* popup closed */ }
    });
  };

  try {
    const rawReport = await ollamaStream(system, user, onToken, controller.signal);
    const parsed    = parseAIResponse(rawReport, mode);
    const resumeHTML = buildResumeHTML(profile, parsed.resumeSection);

    return {
      success:     true,
      report:      rawReport,
      resumeHTML,
      bullets:     parsed.bullets,
      coverLetter: parsed.coverLetter,
      pitch:       parsed.pitch,
      atsScore:    parsed.atsScore
    };
  } finally {
    if (activeGeneration?.controller === controller) activeGeneration = null;
  }
}

// ── MESSAGE ROUTER ────────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {

  if (req.action === "checkOllama") {
    checkOllama().then(sendResponse);
    return true;
  }

  if (req.action === "generate") {
    handleGenerate(req.jd, req.profile, req.mode || "both", req.customInstructions || "")
      .then(sendResponse)
      .catch(e => {
        const msg = e.message || String(e);
        if (e.name === "AbortError" || msg === "CANCELLED") {
          sendResponse({ success: false, error: "CANCELLED" });
        } else if (msg === "403_CORS") {
          sendResponse({ success: false, error: "403_CORS" });
        } else if (msg.startsWith("MODEL_NOT_FOUND")) {
          sendResponse({ success: false, error: msg });
        } else {
          sendResponse({ success: false, error: msg });
        }
      });
    return true;
  }

  if (req.action === "cancelGeneration") {
    if (activeGeneration?.controller) {
      activeGeneration.controller.abort();
      activeGeneration = null;
      sendResponse({ cancelled: true });
    } else {
      sendResponse({ cancelled: false });
    }
    return true;
  }

  if (req.action === "getGenerationStatus") {
    sendResponse(activeGeneration
      ? { running: true, startedAt: activeGeneration.startedAt }
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
          ? "Open a job application page (LinkedIn, Greenhouse, etc.) first."
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
