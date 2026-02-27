// content/content.js — Universal Job Description Scraper + Form Auto-filler

(function () {
  "use strict";

  // ─── JD SCRAPERS PER SITE ─────────────────────────────────────────────────

  const SCRAPERS = {
    // LinkedIn
    "linkedin.com": () => {
      const title =
        document.querySelector(".job-details-jobs-unified-top-card__job-title, .jobs-unified-top-card__job-title, h1.t-24")?.innerText?.trim() ||
        document.querySelector("h1")?.innerText?.trim();
      const company =
        document.querySelector(".job-details-jobs-unified-top-card__company-name, .jobs-unified-top-card__company-name, .topcard__org-name-link")?.innerText?.trim();
      const location =
        document.querySelector(".job-details-jobs-unified-top-card__bullet, .jobs-unified-top-card__bullet, .topcard__flavor--bullet")?.innerText?.trim();
      const description =
        document.querySelector(".jobs-description__content, .jobs-box__html-content, #job-details, .description__text")?.innerText?.trim();
      return { title, company, location, description, site: "linkedin" };
    },

    // Indeed
    "indeed.com": () => {
      const title = document.querySelector('[data-testid="jobsearch-JobInfoHeader-title"], h1.jobsearch-JobInfoHeader-title, h1')?.innerText?.trim();
      const company = document.querySelector('[data-testid="inlineHeader-companyName"], .jobsearch-InlineCompanyRating-companyHeader, .icl-u-lg-mr--sm')?.innerText?.trim();
      const location = document.querySelector('[data-testid="job-location"], .jobsearch-JobInfoHeader-subtitle > div:last-child')?.innerText?.trim();
      const description = document.querySelector('#jobDescriptionText, .jobsearch-jobDescriptionText')?.innerText?.trim();
      return { title, company, location, description, site: "indeed" };
    },

    // Greenhouse
    "greenhouse.io": () => {
      const title = document.querySelector("h1.app-title, h1")?.innerText?.trim();
      const company = document.querySelector(".company-name, .company")?.innerText?.trim();
      const location = document.querySelector(".location")?.innerText?.trim();
      const description = document.querySelector("#content, .content")?.innerText?.trim();
      return { title, company, location, description, site: "greenhouse" };
    },

    // Lever
    "lever.co": () => {
      const title = document.querySelector("h2, .posting-headline h2")?.innerText?.trim();
      const company = document.querySelector(".main-header-logo img")?.alt?.trim();
      const location = document.querySelector(".posting-categories .location, .sort-by-location")?.innerText?.trim();
      const description = document.querySelector(".posting-description, .content")?.innerText?.trim();
      return { title, company, location, description, site: "lever" };
    },

    // Workday
    "myworkdayjobs.com": () => {
      const title = document.querySelector('[data-automation-id="jobPostingHeader"], h2')?.innerText?.trim();
      const company = document.querySelector('[data-automation-id="legalEntityDisplay"], .css-1q2dra3')?.innerText?.trim();
      const location = document.querySelector('[data-automation-id="locations"], [data-automation-id="bullet"]')?.innerText?.trim();
      const description = document.querySelector('[data-automation-id="jobPostingDescription"]')?.innerText?.trim();
      return { title, company, location, description, site: "workday" };
    },

    // Glassdoor
    "glassdoor.com": () => {
      const title = document.querySelector('[data-test="job-title"], .css-17x2pwl')?.innerText?.trim();
      const company = document.querySelector('[data-test="employer-name"], .css-87uc0g')?.innerText?.trim();
      const location = document.querySelector('[data-test="location"], .css-1buaf54')?.innerText?.trim();
      const description = document.querySelector('[data-test="description"], .jobDescriptionContent')?.innerText?.trim();
      return { title, company, location, description, site: "glassdoor" };
    },

    // AngelList / Wellfound
    "wellfound.com": () => {
      const title = document.querySelector("h1")?.innerText?.trim();
      const company = document.querySelector('[class*="company-name"], [class*="startupName"]')?.innerText?.trim();
      const location = document.querySelector('[class*="location"]')?.innerText?.trim();
      const description = document.querySelector('[class*="description"], [class*="jobContent"]')?.innerText?.trim();
      return { title, company, location, description, site: "wellfound" };
    },

    // Dice
    "dice.com": () => {
      const title = document.querySelector("h1.jobTitle, h1[data-cy='jobTitle']")?.innerText?.trim();
      const company = document.querySelector('[data-cy="companyNameLink"], .employer-name')?.innerText?.trim();
      const location = document.querySelector('[data-cy="location"], span.location')?.innerText?.trim();
      const description = document.querySelector('[data-cy="jobDescription"], #jobdescSec')?.innerText?.trim();
      return { title, company, location, description, site: "dice" };
    },

    // ZipRecruiter
    "ziprecruiter.com": () => {
      const title = document.querySelector("h1.job_title, h1")?.innerText?.trim();
      const company = document.querySelector(".hiring_company_text, [class*='company_name']")?.innerText?.trim();
      const location = document.querySelector(".location_text, [class*='location']")?.innerText?.trim();
      const description = document.querySelector(".job_description, #job_desc")?.innerText?.trim();
      return { title, company, location, description, site: "ziprecruiter" };
    },

    // Monster
    "monster.com": () => {
      const title = document.querySelector("h1.title, h1")?.innerText?.trim();
      const company = document.querySelector(".name a, [class*='company']")?.innerText?.trim();
      const location = document.querySelector("[class*='location']")?.innerText?.trim();
      const description = document.querySelector("#JobDescription, [class*='description']")?.innerText?.trim();
      return { title, company, location, description, site: "monster" };
    },

    // Ashby
    "ashbyhq.com": () => {
      const title = document.querySelector("h1")?.innerText?.trim();
      const company = document.querySelector(".ashby-job-posting-brief-company-name")?.innerText?.trim();
      const location = document.querySelector(".ashby-job-posting-brief-location")?.innerText?.trim();
      const description = document.querySelector(".ashby-job-posting-description")?.innerText?.trim();
      return { title, company, location, description, site: "ashby" };
    },
  };

  // ─── FORM AUTO-FILLERS ────────────────────────────────────────────────────

  const FORM_FILLERS = {
    "linkedin.com": async (profile) => {
      await fillLinkedInForm(profile);
    },
    "greenhouse.io": async (profile) => {
      await fillGenericForm(profile);
    },
    "lever.co": async (profile) => {
      await fillLeverForm(profile);
    },
    "workday": async (profile) => {
      await fillWorkdayForm(profile);
    },
    generic: async (profile) => {
      await fillGenericForm(profile);
    },
  };

  // ─── GENERIC FORM FILLER ──────────────────────────────────────────────────

  async function fillField(selector, value) {
    const el = document.querySelector(selector);
    if (el && value) {
      el.focus();
      el.value = value;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    }
    return false;
  }

  async function fillByLabel(labelText, value) {
    const labels = document.querySelectorAll("label");
    for (const label of labels) {
      if (label.innerText?.toLowerCase().includes(labelText.toLowerCase())) {
        const input = label.querySelector("input, textarea") ||
          document.getElementById(label.htmlFor) ||
          label.nextElementSibling?.querySelector("input, textarea") ||
          label.nextElementSibling;
        if (input && value) {
          input.focus();
          input.value = value;
          input.dispatchEvent(new Event("input", { bubbles: true }));
          input.dispatchEvent(new Event("change", { bubbles: true }));
          return true;
        }
      }
    }
    return false;
  }

  async function fillByPlaceholder(placeholder, value) {
    const inputs = document.querySelectorAll(`input[placeholder*="${placeholder}" i], textarea[placeholder*="${placeholder}" i]`);
    if (inputs.length > 0 && value) {
      inputs[0].focus();
      inputs[0].value = value;
      inputs[0].dispatchEvent(new Event("input", { bubbles: true }));
      inputs[0].dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    }
    return false;
  }

  async function fillByName(name, value) {
    const el = document.querySelector(`input[name*="${name}" i], textarea[name*="${name}" i]`);
    if (el && value) {
      el.focus();
      el.value = value;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    }
    return false;
  }

  async function fillByAriaLabel(aria, value) {
    const el = document.querySelector(`[aria-label*="${aria}" i]`);
    if (el && value) {
      el.focus();
      el.value = value;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    }
    return false;
  }

  async function fillGenericForm(profile) {
    const results = { filled: 0, failed: [] };

    const fieldMap = [
      { targets: ["first_name", "firstName", "first-name", "fname"], value: profile.firstName },
      { targets: ["last_name", "lastName", "last-name", "lname"], value: profile.lastName },
      { targets: ["email", "email_address", "emailAddress"], value: profile.email },
      { targets: ["phone", "phone_number", "phoneNumber", "mobile"], value: profile.phone },
      { targets: ["linkedin", "linkedin_url", "linkedinUrl"], value: profile.linkedin },
      { targets: ["website", "portfolio", "personal_website"], value: profile.website },
      { targets: ["address", "city", "location"], value: profile.location },
    ];

    for (const field of fieldMap) {
      let filled = false;
      for (const name of field.targets) {
        if (await fillByName(name, field.value)) { filled = true; break; }
        if (await fillByPlaceholder(name, field.value)) { filled = true; break; }
        if (await fillByLabel(name, field.value)) { filled = true; break; }
        if (await fillByAriaLabel(name, field.value)) { filled = true; break; }
      }
      if (filled) results.filled++;
      else results.failed.push(field.targets[0]);
    }

    // Cover letter text area
    const clSelectors = [
      'textarea[name*="cover" i]',
      'textarea[placeholder*="cover" i]',
      'textarea[aria-label*="cover" i]',
      '#cover_letter',
      '.cover-letter textarea',
    ];
    for (const sel of clSelectors) {
      const el = document.querySelector(sel);
      if (el && profile.coverLetter) {
        el.focus();
        el.value = profile.coverLetter;
        el.dispatchEvent(new Event("input", { bubbles: true }));
        results.filled++;
        break;
      }
    }

    return results;
  }

  async function fillLinkedInForm(profile) {
    await delay(500);
    const easyApplyFields = [
      { sel: 'input[id*="firstName" i]', val: profile.firstName },
      { sel: 'input[id*="lastName" i]', val: profile.lastName },
      { sel: 'input[id*="email" i]', val: profile.email },
      { sel: 'input[id*="phone" i]', val: profile.phone },
      { sel: 'input[id*="city" i], input[id*="location" i]', val: profile.location },
    ];
    let filled = 0;
    for (const f of easyApplyFields) {
      const el = document.querySelector(f.sel);
      if (el && f.val) {
        el.focus();
        el.value = f.val;
        el.dispatchEvent(new Event("input", { bubbles: true }));
        filled++;
        await delay(100);
      }
    }
    return { filled };
  }

  async function fillLeverForm(profile) {
    const fields = {
      "#name, input[name='name']": `${profile.firstName} ${profile.lastName}`,
      "#email, input[name='email']": profile.email,
      "#phone, input[name='phone']": profile.phone,
      "input[name='urls[LinkedIn]']": profile.linkedin,
      "input[name='urls[Portfolio]'], input[name='urls[Website]']": profile.website,
      "textarea[name='comments']": profile.coverLetter,
    };
    let filled = 0;
    for (const [sel, val] of Object.entries(fields)) {
      const el = document.querySelector(sel);
      if (el && val) {
        el.value = val;
        el.dispatchEvent(new Event("input", { bubbles: true }));
        filled++;
      }
    }
    return { filled };
  }

  async function fillWorkdayForm(profile) {
    await delay(1000);
    const reactSetValue = (el, value) => {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
      nativeInputValueSetter?.call(el, value);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    };

    const fields = [
      { labels: ["First Name", "Legal First Name"], val: profile.firstName },
      { labels: ["Last Name", "Legal Last Name"], val: profile.lastName },
      { labels: ["Email", "Email Address"], val: profile.email },
      { labels: ["Phone", "Phone Number"], val: profile.phone },
      { labels: ["City", "Location"], val: profile.location },
    ];

    let filled = 0;
    for (const f of fields) {
      for (const label of f.labels) {
        if (await fillByLabel(label, f.val)) { filled++; break; }
      }
    }
    return { filled };
  }

  // ─── HELPERS ──────────────────────────────────────────────────────────────

  function delay(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function getSiteName() {
    const hostname = window.location.hostname.replace("www.", "");
    for (const site of Object.keys(SCRAPERS)) {
      if (hostname.includes(site)) return site;
    }
    return null;
  }

  function scrapeCurrentPage() {
    const site = getSiteName();
    let data;
    if (site && SCRAPERS[site]) {
      data = SCRAPERS[site]();
    } else {
      // Generic fallback scraper
      data = genericScrape();
    }
    // Clean up & validate
    if (!data.description) {
      data.description = genericScrape().description;
    }
    data.url = window.location.href;
    data.pageTitle = document.title;
    return data;
  }

  function genericScrape() {
    // Try to find longest text block that looks like a JD
    const candidates = [
      '[class*="description" i]',
      '[class*="job-desc" i]',
      '[class*="jobdesc" i]',
      '[id*="description" i]',
      '[id*="job-desc" i]',
      'article',
      'main',
      '[role="main"]',
    ];

    let best = { el: null, len: 0 };
    for (const sel of candidates) {
      const els = document.querySelectorAll(sel);
      for (const el of els) {
        const len = el.innerText?.trim().length || 0;
        if (len > best.len) best = { el, len };
      }
    }

    const title = document.querySelector("h1")?.innerText?.trim() ||
      document.title?.split("|")[0]?.trim() ||
      document.title?.split("-")[0]?.trim();

    return {
      title,
      company: null,
      location: null,
      description: best.el?.innerText?.trim() || document.body.innerText.substring(0, 5000),
      site: "generic",
    };
  }

  // ─── MESSAGE LISTENER ─────────────────────────────────────────────────────

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "scrapeJD") {
      try {
        const data = scrapeCurrentPage();
        sendResponse({ success: true, data });
      } catch (e) {
        sendResponse({ success: false, error: e.message });
      }
    }

    if (request.action === "autofill") {
      const profile = request.profile;
      const site = getSiteName() || "generic";
      const filler = FORM_FILLERS[site] || FORM_FILLERS.generic;
      filler(profile)
        .then((result) => sendResponse({ success: true, result }))
        .catch((e) => sendResponse({ success: false, error: e.message }));
      return true; // async
    }

    if (request.action === "ping") {
      sendResponse({ alive: true, url: window.location.href });
    }

    return true;
  });

  // Mark as ready
  window._jobAiReady = true;
})();
