// content/content.js — Job data scraper for JobHunt AI Copilot v4
// Runs on all supported job sites

(function () {
  'use strict';

  let lastUrl = location.href;
  let lastJobData = null;
  let scrapeTimeout = null;

  // ─── Site Detection ─────────────────────────────────────────────────────────

  function detectSite() {
    const host = location.hostname;
    if (/linkedin\.com/.test(host)) return 'linkedin';
    if (/jobright\.ai/.test(host)) return 'jobright';
    if (/indeed\.com/.test(host)) return 'indeed';
    if (/greenhouse\.io/.test(host)) return 'greenhouse';
    if (/lever\.co/.test(host)) return 'lever';
    if (/myworkdayjobs\.com/.test(host)) return 'workday';
    return null;
  }

  // ─── Text helpers ────────────────────────────────────────────────────────────

  function getText(selector, root = document) {
    const el = root.querySelector(selector);
    return el ? el.innerText.trim() : null;
  }

  function getAttr(selector, attr, root = document) {
    const el = root.querySelector(selector);
    return el ? el.getAttribute(attr) : null;
  }

  function containsText(text, patterns) {
    if (!text) return false;
    return patterns.some(p => new RegExp(p, 'i').test(text));
  }

  function parseSalary(text) {
    if (!text) return null;
    const m = text.match(/\$[\d,]+(?:k)?(?:\s*[-–]\s*\$[\d,]+(?:k)?)?(?:\s*\/\s*(?:yr|year|hr|hour))?/i);
    return m ? m[0] : null;
  }

  function detectRemote(text) {
    if (!text) return null;
    if (/\bfully\s+remote\b|\b100%\s+remote\b/i.test(text)) return 'remote';
    if (/\bremote\b/i.test(text)) return 'remote';
    if (/\bhybrid\b/i.test(text)) return 'hybrid';
    if (/\bon.?site\b|\bin.?office\b/i.test(text)) return 'onsite';
    return null;
  }

  // ─── LinkedIn Scraper ────────────────────────────────────────────────────────

  function scrapeLinkedIn() {
    // Job detail panel (job search results view)
    const title =
      getText('.job-details-jobs-unified-top-card__job-title') ||
      getText('.jobs-unified-top-card__job-title') ||
      getText('h1.t-24') ||
      getText('h1');

    const company =
      getText('.job-details-jobs-unified-top-card__company-name') ||
      getText('.jobs-unified-top-card__company-name') ||
      getText('.jobs-unified-top-card__subtitle-primary-grouping a');

    const location =
      getText('.job-details-jobs-unified-top-card__bullet') ||
      getText('.jobs-unified-top-card__bullet');

    const descEl =
      document.querySelector('.jobs-description__content') ||
      document.querySelector('.job-details-jobs-unified-top-card__job-description') ||
      document.querySelector('[class*="description"]');

    const description = descEl ? descEl.innerText.trim() : '';

    const easyApply = !!document.querySelector('.jobs-apply-button--top-card, [data-control-name="jobdetails_topcard_inapply"]');

    const salary = parseSalary(description) || parseSalary(getText('.jobs-unified-top-card__job-insight'));

    const fullText = `${title} ${company} ${location} ${description}`;
    const remote = detectRemote(fullText);
    const sponsorship = containsText(description, ['visa sponsor', 'h1b', 'work authorization sponsor']);

    if (!title && !company) return null;

    return { title, company, location, description, salary, remote, sponsorship, easyApply, site: 'linkedin' };
  }

  // ─── Jobright Scraper ────────────────────────────────────────────────────────

  function scrapeJobright() {
    const title = getText('h1') || getText('[class*="job-title"]');
    const company = getText('[class*="company-name"]') || getText('[class*="company"]');
    const location = getText('[class*="location"]');
    const descEl = document.querySelector('[class*="job-description"], [class*="description"]');
    const description = descEl ? descEl.innerText.trim() : document.body.innerText.slice(0, 3000);

    const fullText = `${title} ${company} ${location} ${description}`;
    const salary = parseSalary(fullText);
    const remote = detectRemote(fullText);
    const sponsorship = containsText(description, ['visa sponsor', 'h1b', 'work authorization']);

    if (!title) return null;
    return { title, company, location, description, salary, remote, sponsorship, easyApply: false, site: 'jobright' };
  }

  // ─── Indeed Scraper ──────────────────────────────────────────────────────────

  function scrapeIndeed() {
    const title =
      getText('[data-testid="jobsearch-JobInfoHeader-title"]') ||
      getText('.jobsearch-JobInfoHeader-title') ||
      getText('h1');

    const company =
      getText('[data-testid="inlineHeader-companyName"]') ||
      getText('.jobsearch-InlineCompanyRating-companyHeader a') ||
      getText('[class*="company"]');

    const location =
      getText('[data-testid="job-location"]') ||
      getText('.jobsearch-JobInfoHeader-subtitle div:last-child');

    const descEl =
      document.querySelector('#jobDescriptionText') ||
      document.querySelector('.jobsearch-jobDescriptionText');

    const description = descEl ? descEl.innerText.trim() : '';

    const salary =
      parseSalary(getText('[data-testid="attribute_snippet_testid"]')) ||
      parseSalary(description);

    const fullText = `${title} ${company} ${location} ${description}`;
    const remote = detectRemote(fullText);
    const sponsorship = containsText(description, ['visa sponsor', 'h1b', 'work authorization sponsor']);

    if (!title) return null;
    return { title, company, location, description, salary, remote, sponsorship, easyApply: false, site: 'indeed' };
  }

  // ─── Greenhouse Scraper ──────────────────────────────────────────────────────

  function scrapeGreenhouse() {
    const title = getText('.app-title') || getText('h1.job-post-name') || getText('h1');
    const company = getText('.company-name') || getAttr('meta[property="og:site_name"]', 'content');
    const location = getText('.location') || getText('[class*="location"]');
    const descEl = document.querySelector('#content') || document.querySelector('.job-description');
    const description = descEl ? descEl.innerText.trim() : '';

    const fullText = `${title} ${company} ${location} ${description}`;
    const salary = parseSalary(fullText);
    const remote = detectRemote(fullText);
    const sponsorship = containsText(description, ['visa sponsor', 'h1b', 'work authorization']);

    if (!title) return null;
    return { title, company, location, description, salary, remote, sponsorship, easyApply: false, site: 'greenhouse' };
  }

  // ─── Lever Scraper ──────────────────────────────────────────────────────────

  function scrapeLever() {
    const title = getText('.posting-headline h2') || getText('h2') || getText('h1');
    const company = getAttr('meta[property="og:site_name"]', 'content') || document.title.split(' - ').pop();
    const location = getText('.location') || getText('.workplaceTypes') || getText('[class*="location"]');
    const descEl = document.querySelector('.content') || document.querySelector('[class*="posting-description"]');
    const description = descEl ? descEl.innerText.trim() : '';

    const fullText = `${title} ${company} ${location} ${description}`;
    const salary = parseSalary(fullText);
    const remote = detectRemote(fullText);
    const sponsorship = containsText(description, ['visa sponsor', 'h1b', 'work authorization']);

    if (!title) return null;
    return { title, company, location, description, salary, remote, sponsorship, easyApply: false, site: 'lever' };
  }

  // ─── Workday Scraper ─────────────────────────────────────────────────────────

  function scrapeWorkday() {
    const title =
      getText('[data-automation-id="jobPostingHeader"]') ||
      getText('h2[data-automation-id*="title"]') ||
      getText('h1');

    const company =
      getAttr('meta[property="og:site_name"]', 'content') ||
      document.title.split('|').pop().trim();

    const location =
      getText('[data-automation-id="locations"]') ||
      getText('[data-automation-id="location"]');

    const descEl =
      document.querySelector('[data-automation-id="jobPostingDescription"]') ||
      document.querySelector('[class*="job-description"]');

    const description = descEl ? descEl.innerText.trim() : '';

    const fullText = `${title} ${company} ${location} ${description}`;
    const salary = parseSalary(fullText);
    const remote = detectRemote(fullText);
    const sponsorship = containsText(description, ['visa sponsor', 'h1b', 'work authorization']);

    if (!title) return null;
    return { title, company, location, description, salary, remote, sponsorship, easyApply: false, site: 'workday' };
  }

  // ─── Main Scrape ─────────────────────────────────────────────────────────────

  function scrape() {
    const site = detectSite();
    if (!site) return;

    let data = null;
    try {
      switch (site) {
        case 'linkedin': data = scrapeLinkedIn(); break;
        case 'jobright': data = scrapeJobright(); break;
        case 'indeed': data = scrapeIndeed(); break;
        case 'greenhouse': data = scrapeGreenhouse(); break;
        case 'lever': data = scrapeLever(); break;
        case 'workday': data = scrapeWorkday(); break;
      }
    } catch (e) {
      console.warn('[JobHunt] Scrape error:', e);
    }

    if (data && JSON.stringify(data) !== JSON.stringify(lastJobData)) {
      lastJobData = data;
      chrome.runtime.sendMessage({ type: 'JOB_DATA', payload: data }).catch(() => {});
    }
  }

  // ─── SPA URL Change Detection ─────────────────────────────────────────────────

  function onUrlChange() {
    const current = location.href;
    if (current !== lastUrl) {
      lastUrl = current;
      lastJobData = null;
      clearTimeout(scrapeTimeout);
      scrapeTimeout = setTimeout(scrape, 1500);
    }
  }

  // Observe DOM mutations for SPA navigation
  const observer = new MutationObserver(onUrlChange);
  observer.observe(document.body, { subtree: true, childList: true });

  // Also patch history API
  const origPush = history.pushState.bind(history);
  const origReplace = history.replaceState.bind(history);
  history.pushState = function (...args) { origPush(...args); onUrlChange(); };
  history.replaceState = function (...args) { origReplace(...args); onUrlChange(); };
  window.addEventListener('popstate', onUrlChange);

  // ─── Message Listener ─────────────────────────────────────────────────────────

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'REQUEST_JOB_DATA') {
      scrape();
      sendResponse({ payload: lastJobData });
      return true;
    }
    if (msg.type === 'AUTOFILL_TRIGGER') {
      chrome.runtime.sendMessage({ type: 'INJECT_AUTOFILL' });
      sendResponse({ ok: true });
      return true;
    }
  });

  // Initial scrape after page settles
  setTimeout(scrape, 1500);

  console.log('[JobHunt AI Copilot] Content script loaded on', detectSite() || location.hostname);
})();
