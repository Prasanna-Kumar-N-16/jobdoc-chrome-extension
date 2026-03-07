// background/service-worker.js

const DEFAULT_BASE  = "http://localhost:11434";
const DEFAULT_MODEL = "llama3";

// Tracks the currently running analysis so we can cancel it
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

// ── STREAMING OLLAMA CALL ────────────────────────────────────────────────────
// Uses streaming so we can forward tokens to popup in real time.
// Returns the full accumulated text — never parses JSON.

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

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let full = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    // Each chunk may contain multiple newline-delimited JSON objects
    const lines = decoder.decode(value, { stream: true }).split("\n");
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const obj = JSON.parse(line);
        const token = obj?.message?.content || "";
        if (token) {
          full += token;
          onToken(token);
        }
        if (obj.done) break;
      } catch { /* partial JSON line, skip */ }
    }
  }

  return full;
}

// ── BUILD RESUME HTML FROM TEXT ───────────────────────────────────────────────
// Finds the "Rewrite my resume" section in the raw report and formats it
// into a clean, print-ready HTML resume.

function extractResumeSection(rawReport) {
  // Try to grab everything after section 7 heading
  const patterns = [
    /(?:7\.?\s*Rewrite|Rewritten Resume|Tailored Resume|Updated Resume)[^\n]*\n([\s\S]+)/i,
    /(?:Here(?:'s| is) (?:the |your )?(?:rewritten|tailored|updated|revised) resume)[^\n]*\n([\s\S]+)/i,
  ];
  for (const p of patterns) {
    const m = rawReport.match(p);
    if (m?.[1]?.trim().length > 100) return m[1].trim();
  }
  return null; // couldn't find it
}

function buildResumeHTML(profile, resumeSection) {
  const today = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  let workAuth = "H1B Visa";
  try {
    const rd = typeof profile.resumeData === "string" ? JSON.parse(profile.resumeData) : (profile.resumeData || {});
    if (rd.workAuthorization) workAuth = rd.workAuthorization;
  } catch (_) {}

  // Contact line: Phone | Email | LinkedIn | GitHub | Portfolio | Work Auth (with hyperlinks)
  const contactParts = [];
  if (profile.phone) contactParts.push(escapeHtml(profile.phone));
  if (profile.email) contactParts.push(`<a href="mailto:${escapeHtml(profile.email)}">${escapeHtml(profile.email)}</a>`);
  if (profile.linkedin) contactParts.push(`<a href="${escapeHtml(profile.linkedin)}">LinkedIn</a>`);
  if (profile.github) contactParts.push(`<a href="${escapeHtml(profile.github)}">GitHub</a>`);
  if (profile.portfolio || profile.website) contactParts.push(`<a href="${escapeHtml(profile.portfolio || profile.website)}">Portfolio</a>`);
  contactParts.push(`Work Auth: ${escapeHtml(workAuth)}`);
  const contactLine = contactParts.join(" | ");

  const body = resumeSection
    ? formatResumeBody(resumeSection)
    : buildResumeBodyFromProfile(profile);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="description" content="Resume — ${escapeHtml(profile.firstName)} ${escapeHtml(profile.lastName)}">
<title>${escapeHtml(profile.firstName)} ${escapeHtml(profile.lastName)} — Resume</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box;}
  body{font-family:'Segoe UI',system-ui,-apple-system,sans-serif;font-size:10.5pt;color:#1a1a1a;max-width:8.5in;margin:0 auto;padding:.6in;line-height:1.45;}
  .resume-header{text-align:center;margin-bottom:14px;}
  .resume-name{font-size:18pt;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:#0f172a;}
  .resume-contact{font-size:9.5pt;color:#475569;margin-top:4px;}
  .resume-contact a{color:#2563eb;text-decoration:none;}
  .resume-contact a:hover{text-decoration:underline;}
  .resume-section{margin-top:14px;}
  .resume-section h2{font-size:10pt;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:#0f172a;border-bottom:1.5px solid #0f172a;padding-bottom:2px;margin-bottom:6px;}
  .resume-section p{margin-bottom:6px;}
  .resume-section ul{margin:4px 0 10px 18px;}
  .resume-section li{margin-bottom:3px;}
  .job-title{font-weight:700;}
  .job-meta{font-size:9.5pt;color:#475569;}
  .generated{margin-top:18px;font-size:8pt;color:#94a3b8;text-align:right;}
  @media print{body{padding:.5in;}}
</style>
</head>
<body>
  <header class="resume-header">
    <h1 class="resume-name">${escapeHtml(profile.firstName)} ${escapeHtml(profile.lastName)}</h1>
    <div class="resume-contact">${contactLine}</div>
  </header>
  <main>${body}</main>
  <p class="generated">Generated ${today}</p>
</body>
</html>`;
}

function formatResumeBody(raw) {
  const lines = raw.split(/\r?\n/);
  const sections = [];
  let i = 0;
  const sectionHeadings = /^(PROFESSIONAL SUMMARY|SUMMARY|EXPERIENCE|PROFESSIONAL EXPERIENCE|TECHNICAL SKILLS|SKILLS|EDUCATION|CERTIFICATIONS|PROJECTS|ADDITIONAL)/i;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) { i++; continue; }
    if (sectionHeadings.test(trimmed)) {
      const heading = trimmed;
      const block = [];
      i++;
      while (i < lines.length) {
        const t = lines[i].trim();
        if (t === "" || sectionHeadings.test(t)) break;
        block.push(lines[i]);
        i++;
      }
      const content = formatSectionContent(block.join("\n"));
      sections.push(`<div class="resume-section"><h2>${escapeHtml(heading)}</h2>${content}</div>`);
      continue;
    }
    const block = [];
    while (i < lines.length) {
      const t = lines[i].trim();
      if (t === "" || sectionHeadings.test(t)) break;
      block.push(lines[i]);
      i++;
    }
    if (block.length) {
      const content = formatSectionContent(block.join("\n"));
      sections.push(`<div class="resume-section">${content}</div>`);
    }
  }
  if (sections.length === 0) {
    return `<div class="resume-section" style="white-space:pre-wrap">${escapeHtml(raw)}</div>`;
  }
  return sections.join("\n");
}

function formatSectionContent(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  const items = [];
  let inList = false;
  let listItems = [];
  const flushList = () => {
    if (listItems.length) {
      items.push("<ul>" + listItems.map(li => "<li>" + escapeHtml(li.replace(/^[\s•\-*]+\s*/, "").trim()) + "</li>").join("") + "</ul>");
      listItems = [];
    }
    inList = false;
  };
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^[•\-*]\s+/.test(trimmed) || (trimmed.startsWith("•") || trimmed.startsWith("-"))) {
      if (!inList) flushList();
      inList = true;
      listItems.push(trimmed);
    } else {
      flushList();
      if (trimmed) items.push("<p>" + escapeHtml(trimmed) + "</p>");
    }
  }
  flushList();
  return items.join("");
}

function buildResumeBodyFromProfile(profile) {
  let html = "";
  try {
    const rd = typeof profile.resumeData === "string" ? JSON.parse(profile.resumeData) : (profile.resumeData || {});
    if (rd.experience?.length) {
      html += '<div class="resume-section"><h2>Professional Experience</h2>';
      for (const job of rd.experience) {
        html += `<p class="job-title">${escapeHtml(job.company)} | ${escapeHtml(job.title)}</p>`;
        html += `<p class="job-meta">${escapeHtml(job.location || "")} | ${escapeHtml(job.dates || "")}</p><ul>`;
        (job.bullets || []).forEach(b => { html += `<li>${escapeHtml(b)}</li>`; });
        html += "</ul>";
      }
      html += "</div>";
    }
    if (rd.skills?.length) {
      html += `<div class="resume-section"><h2>Technical Skills</h2><p>${escapeHtml(rd.skills.join(", "))}</p></div>`;
    }
    if (rd.education?.length) {
      html += '<div class="resume-section"><h2>Education</h2>';
      for (const e of rd.education) {
        html += `<p><strong>${escapeHtml(e.school)}</strong> — ${escapeHtml(e.degree)} ${escapeHtml(e.field || "")} (${escapeHtml(e.year || "")})</p>`;
      }
      html += "</div>";
    }
    if (rd.certifications?.length) {
      html += `<div class="resume-section"><h2>Certifications</h2><ul>`;
      rd.certifications.forEach(c => { html += `<li>${escapeHtml(c)}</li>`; });
      html += "</ul></div>";
    }
  } catch (_) {}
  return html || "<p>Resume content generated — see the full report for section-by-section rewrites.</p>";
}

function escapeHtml(t) {
  return t.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

// ── YOUR EXACT PROMPT ─────────────────────────────────────────────────────────

function buildPrompt(jd, profile) {
  const resumeText = buildResumeText(profile);

  const system = `You are an expert ATS analyzer and resume consultant with deep knowledge of applicant tracking systems, 
recruiting practices, and technical hiring. Be thorough, specific, and actionable. 
Format your response with clear numbered sections and use tables where requested.`;

  const user = `I need you to act as an expert ATS (Applicant Tracking System) analyzer and resume consultant. 
Please review my resume thoroughly in comparison with my target job description and provide:

1. ATS Score Analysis:
   • Give me an overall ATS compatibility score out of 100
   • Explain the scoring methodology you used
   • Identify any formatting or structural issues that might cause ATS rejection
   • Check for proper use of keywords, standard section headings, and machine-readable format

2. Job Description Match Analysis:
   • Calculate a match percentage between my resume and the job description
   • List the key requirements from the job description and indicate which ones my resume addresses
   • Identify critical keywords from the job description that are missing in my resume
   • Highlight skills and qualifications mentioned in the job description that I should emphasize more
   • Point out any gaps between what the job requires and what my resume shows

3. Detailed Section-by-Section Breakdown:
   For each section of my resume (Summary/Objective, Work Experience, Education, Skills, Certifications), provide:
   - Good Points: What's working well (strong action verbs, quantifiable achievements, relevant keywords, proper formatting)
   - Points to Improve: What needs enhancement (weak descriptions, missing metrics, vague statements, poor keyword usage)
   - Points to Add: What's missing (specific achievements relevant to the role, required skills from JD, important details)

4. Keyword Optimization:
   • List the top 10-15 keywords from the job description
   • Show how many times each keyword appears in my resume
   • Suggest where and how to naturally incorporate missing keywords
   (Present this as a table: Keyword | Times in Resume | Priority | Suggested Placement)

5. Content Alignment Recommendations:
   • Which experiences should I emphasize more based on the job description?
   • What achievements should I add or modify to better match the role?
   • Are there any irrelevant sections I should minimize or remove?

6. Overall Strategy:
   • Summary of top 3-5 changes I should make to improve my chances
   • Formatting improvements for better ATS parsing
   • Final recommendations for tailoring this resume to the specific role

7. Rewrite my resume:
   • Give the full content I should put in every section
   • Incorporate every modification you suggested to improve the ATS score and job description match
   • Include a tailored Professional Summary, reordered/rewritten Experience bullets, optimized Skills section
   • Make it ready to copy-paste

Please be specific with examples and provide actionable feedback. Use tables for the keyword analysis section.

Here is my resume:
${resumeText}

Here is the job description I'm targeting:
${jd}`;

  return { system, user };
}

function buildResumeText(profile) {
  let text = `Name: ${profile.firstName} ${profile.lastName}
Email: ${profile.email || ""} | Phone: ${profile.phone || ""} | Location: ${profile.location || ""}
LinkedIn: ${profile.linkedin || ""} | GitHub: ${profile.github || ""} | Portfolio: ${profile.portfolio || profile.website || ""}
Work Authorization: H1B Visa\n\n`;

  try {
    const rd = typeof profile.resumeData === "string"
      ? JSON.parse(profile.resumeData)
      : (profile.resumeData || {});

    if (rd.experience?.length) {
      text += "PROFESSIONAL EXPERIENCE\n";
      for (const job of rd.experience) {
        text += `\n${job.title} | ${job.company} | ${job.dates} | ${job.location || ""}\n`;
        (job.bullets || []).forEach(b => { text += `• ${b}\n`; });
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
      text += `\nCERTIFICATIONS\n${rd.certifications.join("\n")}\n`;
    }

    if (rd.projects?.length) {
      text += "\nPROJECTS\n";
      for (const p of rd.projects) {
        text += `${p.name}: ${p.description} | Tech: ${(p.tech||[]).join(", ")}\n`;
      }
    }
  } catch {
    text += "(Resume data parsing error — using raw data)\n";
    text += JSON.stringify(profile.resumeData || {}, null, 2);
  }

  return text;
}

// ── FULL ANALYSIS HANDLER ─────────────────────────────────────────────────────

async function handleFullAnalysis(jd, profile, senderTabId) {
  const { system, user } = buildPrompt(jd, profile);

  // Set up cancellable analysis
  const controller = new AbortController();
  currentAnalysis = {
    controller,
    startedAt: Date.now(),
    jd,
  };

  // Forward streaming tokens to any open popup
  const onToken = (token) => {
    chrome.runtime.sendMessage({ action: "streamToken", token }, () => {
      if (chrome.runtime.lastError) { /* Popup closed or not open — ignore */ }
    });
  };

  try {
    const rawReport = await ollamaStream(system, user, onToken, controller.signal);

    // Extract ATS score
    let atsScore = 0;
    const m = rawReport.match(/(?:ATS|overall)[^\d]*(\d{2,3})\s*(?:\/\s*100|%|out of)/i)
            || rawReport.match(/score[^\d]*(\d{2,3})\s*\/\s*100/i)
            || rawReport.match(/\b(\d{2,3})\s*\/\s*100\b/);
    if (m) atsScore = Math.min(100, Math.max(0, parseInt(m[1])));

    // Extract rewritten resume section and build HTML
    const resumeSection = extractResumeSection(rawReport);
    const resumeHTML = buildResumeHTML(profile, resumeSection);

    // Persist session so results are available even if popup was closed
    await chrome.storage.local.set({
      lastSession: {
        report: rawReport,
        resumeHTML,
        coverLetter: "",
        atsScore,
        jd,
        savedAt: Date.now(),
      },
    });

    return { success: true, report: rawReport, atsScore, resumeHTML };
  } finally {
    // Clear current analysis marker when finished or cancelled
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
    return true; // async
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
    if (currentAnalysis) {
      sendResponse({
        running: true,
        startedAt: currentAnalysis.startedAt,
      });
    } else {
      sendResponse({ running: false });
    }
    return true;
  }

  if (req.action === "download") {
    const mime = req.mime || "text/plain";
    const url = `data:${mime};charset=utf-8,` + encodeURIComponent(req.content || "");
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
    return true; // keep channel open for async callback
  }

  return true;
});
