// content/content.js — Universal Job Description Scraper + Form Auto-filler
(function () {
  "use strict";

  const SCRAPERS = {
    "linkedin.com": () => {
      const title = document.querySelector(".job-details-jobs-unified-top-card__job-title, .jobs-unified-top-card__job-title, h1.t-24")?.innerText?.trim() || document.querySelector("h1")?.innerText?.trim();
      const company = document.querySelector(".job-details-jobs-unified-top-card__company-name, .jobs-unified-top-card__company-name")?.innerText?.trim();
      const location = document.querySelector(".job-details-jobs-unified-top-card__bullet, .jobs-unified-top-card__bullet")?.innerText?.trim();
      const description = document.querySelector(".jobs-description__content, #job-details, .description__text")?.innerText?.trim();
      return { title, company, location, description, site: "linkedin" };
    },
    "indeed.com": () => {
      const title = document.querySelector('[data-testid="jobsearch-JobInfoHeader-title"], h1')?.innerText?.trim();
      const company = document.querySelector('[data-testid="inlineHeader-companyName"]')?.innerText?.trim();
      const location = document.querySelector('[data-testid="job-location"]')?.innerText?.trim();
      const description = document.querySelector('#jobDescriptionText, .jobsearch-jobDescriptionText')?.innerText?.trim();
      return { title, company, location, description, site: "indeed" };
    },
    "greenhouse.io": () => {
      const title = document.querySelector("h1.app-title, h1")?.innerText?.trim();
      const company = document.querySelector(".company-name")?.innerText?.trim();
      const location = document.querySelector(".location")?.innerText?.trim();
      const description = document.querySelector("#content, .content")?.innerText?.trim();
      return { title, company, location, description, site: "greenhouse" };
    },
    "lever.co": () => {
      const title = document.querySelector("h2, .posting-headline h2")?.innerText?.trim();
      const company = document.querySelector(".main-header-logo img")?.alt?.trim();
      const location = document.querySelector(".posting-categories .location")?.innerText?.trim();
      const description = document.querySelector(".posting-description")?.innerText?.trim();
      return { title, company, location, description, site: "lever" };
    },
    "myworkdayjobs.com": () => {
      const title = document.querySelector('[data-automation-id="jobPostingHeader"], h2')?.innerText?.trim();
      const company = document.querySelector('[data-automation-id="legalEntityDisplay"]')?.innerText?.trim();
      const location = document.querySelector('[data-automation-id="locations"]')?.innerText?.trim();
      const description = document.querySelector('[data-automation-id="jobPostingDescription"]')?.innerText?.trim();
      return { title, company, location, description, site: "workday" };
    },
  };

  function getSiteName() {
    const hostname = window.location.hostname.replace("www.","");
    for (const site of Object.keys(SCRAPERS)) { if (hostname.includes(site)) return site; }
    return null;
  }

  function genericScrape() {
    const candidates = ['[class*="description" i]','[class*="job-desc" i]','article','main','[role="main"]'];
    let best = { el:null, len:0 };
    for (const sel of candidates) {
      for (const el of document.querySelectorAll(sel)) {
        const len = el.innerText?.trim().length||0;
        if (len > best.len) best = { el, len };
      }
    }
    const title = document.querySelector("h1")?.innerText?.trim() || document.title?.split("|")[0]?.trim();
    return { title, company:null, location:null, description: best.el?.innerText?.trim()||document.body.innerText.substring(0,5000), site:"generic" };
  }

  async function fillField(el, value) {
    if (!el || !value) return false;
    el.focus(); el.value = value;
    el.dispatchEvent(new Event("input",{bubbles:true}));
    el.dispatchEvent(new Event("change",{bubbles:true}));
    return true;
  }

  async function fillByLabel(labelText, value) {
    for (const label of document.querySelectorAll("label")) {
      if (label.innerText?.toLowerCase().includes(labelText.toLowerCase())) {
        const input = label.querySelector("input,textarea") || document.getElementById(label.htmlFor) || label.nextElementSibling?.querySelector("input,textarea");
        if (input && value) { input.focus(); input.value = value; input.dispatchEvent(new Event("input",{bubbles:true})); return true; }
      }
    }
    return false;
  }

  async function fillByName(name, value) {
    const el = document.querySelector(`input[name*="${name}" i],textarea[name*="${name}" i]`);
    if (el && value) { el.focus(); el.value = value; el.dispatchEvent(new Event("input",{bubbles:true})); return true; }
    return false;
  }

  async function fillGenericForm(profile) {
    let filled = 0;
    const map = [
      {targets:["first_name","firstName","fname"],value:profile.firstName},
      {targets:["last_name","lastName","lname"],value:profile.lastName},
      {targets:["email","email_address"],value:profile.email},
      {targets:["phone","phoneNumber","mobile"],value:profile.phone},
      {targets:["linkedin","linkedin_url"],value:profile.linkedin},
      {targets:["github","github_url"],value:profile.github},
      {targets:["website","portfolio"],value:profile.website||profile.portfolio},
    ];
    for (const f of map) {
      for (const name of f.targets) {
        if (await fillByName(name,f.value)||await fillByLabel(name,f.value)) { filled++; break; }
      }
    }
    for (const sel of ['textarea[name*="cover" i]','#cover_letter']) {
      const el = document.querySelector(sel);
      if (el && profile.coverLetter) { el.value = profile.coverLetter; el.dispatchEvent(new Event("input",{bubbles:true})); filled++; break; }
    }
    return { filled };
  }

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "scrapeJD") {
      try {
        const site = getSiteName();
        const data = site&&SCRAPERS[site] ? SCRAPERS[site]() : genericScrape();
        data.url = window.location.href;
        sendResponse({ success:true, data });
      } catch(e) { sendResponse({ success:false, error:e.message }); }
    }
    if (request.action === "autofill") {
      fillGenericForm(request.profile)
        .then(r => sendResponse({success:true,result:r}))
        .catch(e => sendResponse({success:false,error:e.message}));
      return true;
    }
    if (request.action === "ping") sendResponse({alive:true});
    return true;
  });
  window._jobAiReady = true;
})();
