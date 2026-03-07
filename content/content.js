// content/content.js — Universal Job Scraper + Form Autofiller v3
(function () {
  "use strict";
  if (window._jobHuntAiReady) return; // prevent double-injection
  window._jobHuntAiReady = true;

  // ── SCRAPERS ─────────────────────────────────────────────────────────────────
  const SCRAPERS = {
    "linkedin.com": () => {
      const title     = qs([".job-details-jobs-unified-top-card__job-title",".jobs-unified-top-card__job-title","h1.t-24","h1"])?.innerText?.trim();
      const company   = qs([".job-details-jobs-unified-top-card__company-name",".jobs-unified-top-card__company-name"])?.innerText?.trim();
      const location  = qs([".job-details-jobs-unified-top-card__bullet",".jobs-unified-top-card__bullet"])?.innerText?.trim();
      const description = qs([".jobs-description__content","#job-details",".description__text"])?.innerText?.trim();
      const easyApply = !!document.querySelector(".jobs-apply-button--top-card, [data-control-name='easy_apply_global_tnf']");
      return { title, company, location, description, easyApply, site: "linkedin" };
    },
    "indeed.com": () => {
      const title       = qs(['[data-testid="jobsearch-JobInfoHeader-title"]','h1'])?.innerText?.trim();
      const company     = qs(['[data-testid="inlineHeader-companyName"]','.jobsearch-CompanyInfoContainer'])?.innerText?.trim();
      const location    = qs(['[data-testid="job-location"]'])?.innerText?.trim();
      const description = qs(['#jobDescriptionText','.jobsearch-jobDescriptionText'])?.innerText?.trim();
      return { title, company, location, description, site: "indeed" };
    },
    "greenhouse.io": () => {
      const title       = qs(["h1.app-title","h1"])?.innerText?.trim();
      const company     = qs([".company-name",".header--title"])?.innerText?.trim();
      const location    = qs([".location",".company--location"])?.innerText?.trim();
      const description = qs(["#content","#main_fields","div.content"])?.innerText?.trim();
      return { title, company, location, description, site: "greenhouse" };
    },
    "lever.co": () => {
      const title       = qs(["h2","div.posting-headline h2"])?.innerText?.trim();
      const company     = qs([".main-header-logo img"])?.alt?.trim() || document.title?.split("at ")?.[1]?.trim();
      const location    = qs([".posting-categories .location",".sort-by-time"])?.innerText?.trim();
      const description = qs([".posting-description",".posting-body"])?.innerText?.trim();
      return { title, company, location, description, site: "lever" };
    },
    "myworkdayjobs.com": () => {
      const title       = qs(['[data-automation-id="jobPostingHeader"]','h2'])?.innerText?.trim();
      const company     = qs(['[data-automation-id="legalEntityDisplay"]'])?.innerText?.trim();
      const location    = qs(['[data-automation-id="locations"]'])?.innerText?.trim();
      const description = qs(['[data-automation-id="jobPostingDescription"]'])?.innerText?.trim();
      return { title, company, location, description, site: "workday" };
    },
    "jobright.ai": () => {
      const title       = qs(["h1.job-title","h1"])?.innerText?.trim();
      const company     = qs([".company-name",".employer-name"])?.innerText?.trim();
      const location    = qs([".job-location",".location"])?.innerText?.trim();
      const description = qs([".job-description",".jd-content","[class*='description']"])?.innerText?.trim();
      return { title, company, location, description, site: "jobright" };
    },
    "glassdoor.com": () => {
      const title       = qs(['[data-test="job-title"]','h1'])?.innerText?.trim();
      const company     = qs(['[data-test="employer-name"]','.employer-name'])?.innerText?.trim();
      const location    = qs(['[data-test="location"]'])?.innerText?.trim();
      const description = qs(['[class*="JobDescription"]','#JobDescriptionContainer','.desc'])?.innerText?.trim();
      return { title, company, location, description, site: "glassdoor" };
    },
    "ziprecruiter.com": () => {
      const title       = qs(["h1.job_title","h1"])?.innerText?.trim();
      const company     = qs([".hiring_company_text"])?.innerText?.trim();
      const location    = qs([".location"])?.innerText?.trim();
      const description = qs(["[class*='jobDescriptionSection']",".job_description"])?.innerText?.trim();
      return { title, company, location, description, site: "ziprecruiter" };
    }
  };

  function qs(selectors) {
    if (typeof selectors === "string") return document.querySelector(selectors);
    for (const s of selectors) { const el = document.querySelector(s); if (el) return el; }
    return null;
  }

  function getScraper() {
    const host = window.location.hostname.replace("www.", "");
    for (const site of Object.keys(SCRAPERS)) { if (host.includes(site)) return SCRAPERS[site]; }
    return null;
  }

  function genericScrape() {
    const candidates = [
      '[class*="description" i]','[class*="job-desc" i]','[id*="description" i]',
      'article','main','[role="main"]','[class*="content" i]'
    ];
    let best = { el: null, len: 0 };
    for (const sel of candidates) {
      for (const el of document.querySelectorAll(sel)) {
        const len = el.innerText?.trim().length || 0;
        if (len > best.len && len < 50000) best = { el, len };
      }
    }
    const title   = qs(["h1"])?.innerText?.trim() || document.title?.split("|")[0]?.trim() || document.title;
    const desc    = best.el?.innerText?.trim() || document.body.innerText.substring(0, 8000);
    return { title, company: null, location: null, description: desc, site: "generic" };
  }

  // Detect visa sponsorship keywords in JD
  function detectVisaSponsor(text) {
    if (!text) return false;
    const patterns = [/H1B sponsor/i,/visa sponsor/i,/sponsorship/i,/work authorization/i,/work visa/i,/OPT/i];
    return patterns.some(p => p.test(text));
  }

  // Detect salary range
  function detectSalary(text) {
    if (!text) return null;
    const m = text.match(/\$(\d{2,3})[Kk]?\s*[–\-—]\s*\$?(\d{2,3})[Kk]?/);
    if (m) return `$${m[1]}K–$${m[2]}K`;
    return null;
  }

  // ── AUTOFILL ─────────────────────────────────────────────────────────────────
  async function fillField(el, value) {
    if (!el || value === undefined || value === null) return false;
    const v = String(value);
    el.focus();
    // React/Vue synthetic event support
    const nativeInputSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set
      || Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;
    if (nativeInputSetter && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) {
      nativeInputSetter.call(el, v);
    } else {
      el.value = v;
    }
    el.dispatchEvent(new Event("input",   { bubbles: true }));
    el.dispatchEvent(new Event("change",  { bubbles: true }));
    el.dispatchEvent(new Event("blur",    { bubbles: true }));
    return true;
  }

  async function fillByLabel(labelText, value) {
    for (const label of document.querySelectorAll("label")) {
      if (label.innerText?.toLowerCase().includes(labelText.toLowerCase())) {
        const input = label.querySelector("input,textarea")
          || (label.htmlFor && document.getElementById(label.htmlFor))
          || label.nextElementSibling?.querySelector?.("input,textarea")
          || label.nextElementSibling;
        if (input && (input.tagName === "INPUT" || input.tagName === "TEXTAREA")) {
          return fillField(input, value);
        }
      }
    }
    return false;
  }

  async function fillByAttr(attr, fragment, value) {
    const el = document.querySelector(`input[${attr}*="${fragment}" i], textarea[${attr}*="${fragment}" i]`);
    return el ? fillField(el, value) : false;
  }

  async function fillByPlaceholder(text, value) {
    const el = document.querySelector(`input[placeholder*="${text}" i], textarea[placeholder*="${text}" i]`);
    return el ? fillField(el, value) : false;
  }

  async function autofillPage(profile) {
    let filled = 0;
    const p = profile;

    const FIELDS = [
      // First name
      { value: p.firstName, tries: [
        () => fillByAttr("name","first_name",p.firstName),
        () => fillByAttr("name","firstName",p.firstName),
        () => fillByAttr("name","fname",p.firstName),
        () => fillByAttr("id","first_name",p.firstName),
        () => fillByAttr("id","firstName",p.firstName),
        () => fillByLabel("first name",p.firstName),
        () => fillByPlaceholder("first name",p.firstName),
      ]},
      // Last name
      { value: p.lastName, tries: [
        () => fillByAttr("name","last_name",p.lastName),
        () => fillByAttr("name","lastName",p.lastName),
        () => fillByAttr("name","lname",p.lastName),
        () => fillByAttr("id","last_name",p.lastName),
        () => fillByLabel("last name",p.lastName),
        () => fillByPlaceholder("last name",p.lastName),
      ]},
      // Full name (some forms)
      { value: `${p.firstName} ${p.lastName}`, tries: [
        () => fillByAttr("name","full_name",`${p.firstName} ${p.lastName}`),
        () => fillByAttr("name","fullName",`${p.firstName} ${p.lastName}`),
        () => fillByLabel("full name",`${p.firstName} ${p.lastName}`),
        () => fillByPlaceholder("full name",`${p.firstName} ${p.lastName}`),
      ]},
      // Email
      { value: p.email, tries: [
        () => fillByAttr("type","email",p.email),
        () => fillByAttr("name","email",p.email),
        () => fillByLabel("email",p.email),
        () => fillByPlaceholder("email",p.email),
      ]},
      // Phone
      { value: p.phone, tries: [
        () => fillByAttr("type","tel",p.phone),
        () => fillByAttr("name","phone",p.phone),
        () => fillByAttr("name","mobile",p.phone),
        () => fillByLabel("phone",p.phone),
        () => fillByPlaceholder("phone",p.phone),
      ]},
      // LinkedIn
      { value: p.linkedin, tries: [
        () => fillByAttr("name","linkedin",p.linkedin),
        () => fillByLabel("linkedin",p.linkedin),
        () => fillByPlaceholder("linkedin",p.linkedin),
      ]},
      // GitHub
      { value: p.github, tries: [
        () => fillByAttr("name","github",p.github),
        () => fillByLabel("github",p.github),
        () => fillByPlaceholder("github",p.github),
      ]},
      // Website / portfolio
      { value: p.website || p.portfolio || p.github, tries: [
        () => fillByAttr("name","website",p.website||p.portfolio||p.github),
        () => fillByAttr("name","portfolio",p.website||p.portfolio||p.github),
        () => fillByLabel("website",p.website||p.portfolio||p.github),
        () => fillByLabel("portfolio",p.website||p.portfolio||p.github),
      ]},
    ];

    for (const field of FIELDS) {
      if (!field.value) continue;
      for (const tryFn of field.tries) {
        if (await tryFn()) { filled++; break; }
      }
    }

    // Cover letter
    if (p.coverLetter) {
      const cl = document.querySelector('textarea[name*="cover" i], textarea[id*="cover" i], #cover_letter, [placeholder*="cover letter" i]');
      if (cl) { await fillField(cl, p.coverLetter); filled++; }
    }

    return { filled };
  }

  // ── MESSAGE HANDLER ───────────────────────────────────────────────────────────
  chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
    if (req.action === "ping") { sendResponse({ alive: true }); return; }

    if (req.action === "scrapeJD") {
      try {
        const scraper = getScraper();
        const data    = scraper ? scraper() : genericScrape();
        data.url = window.location.href;
        if (data.description) {
          data.visaSponsor = detectVisaSponsor(data.description);
          data.salary      = detectSalary(data.description);
          data.remote      = /remote/i.test(data.location || "") || /remote/i.test(data.description || "");
        }
        if (!data.description || data.description.length < 50) {
          sendResponse({ success: false, error: "No job description found on this page." });
        } else {
          sendResponse({ success: true, data });
        }
      } catch (e) {
        sendResponse({ success: false, error: e.message });
      }
      return true;
    }

    if (req.action === "autofill") {
      autofillPage(req.profile)
        .then(r  => sendResponse({ success: true, result: r }))
        .catch(e => sendResponse({ success: false, error: e.message }));
      return true;
    }
  });
})();
