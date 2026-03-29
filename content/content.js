// content/content.js — Robust Job Scraper for JobHunt AI Copilot v4

(function () {
  'use strict';

  if (window.__jobhuntInjected) return;
  window.__jobhuntInjected = true;

  let lastUrl = window.location.href;
  let lastJobData = null;
  let scrapeTimeout = null;
  let retryCount = 0;
  const MAX_RETRIES = 6;

  // ─── Site Detection ─────────────────────────────────────────────────────────
  function detectSite() {
    const host = window.location.hostname;
    if (/linkedin\.com/.test(host))         return 'linkedin';
    if (/jobright\.ai/.test(host))          return 'jobright';
    if (/indeed\.com/.test(host))           return 'indeed';
    if (/greenhouse\.io/.test(host))        return 'greenhouse';
    if (/lever\.co/.test(host))             return 'lever';
    if (/myworkdayjobs\.com/.test(host))    return 'workday';
    return null;
  }

  // ─── Robust Helpers ──────────────────────────────────────────────────────────

  // Try a list of CSS selectors, return text from the first non-empty match
  function tryText() {
    var selectors = Array.prototype.slice.call(arguments);
    for (var i = 0; i < selectors.length; i++) {
      try {
        var els = document.querySelectorAll(selectors[i]);
        for (var j = 0; j < els.length; j++) {
          var t = (els[j].innerText || els[j].textContent || '').trim();
          if (t && t.length > 1) return t;
        }
      } catch (e) { /* invalid selector */ }
    }
    return null;
  }

  // Return text from the largest-content matching element (best for descriptions)
  function tryLargestText() {
    var selectors = Array.prototype.slice.call(arguments);
    var best = '';
    for (var i = 0; i < selectors.length; i++) {
      try {
        var els = document.querySelectorAll(selectors[i]);
        for (var j = 0; j < els.length; j++) {
          var t = (els[j].innerText || '').trim();
          if (t.length > best.length) best = t;
        }
      } catch (e) { /* invalid selector */ }
    }
    return best || null;
  }

  // Try to read an attribute from a list of selectors
  function tryAttr(attr) {
    var selectors = Array.prototype.slice.call(arguments, 1);
    for (var i = 0; i < selectors.length; i++) {
      try {
        var el = document.querySelector(selectors[i]);
        if (el) {
          var v = el.getAttribute(attr);
          if (v && v.trim().length > 1) return v.trim();
        }
      } catch (e) { /* invalid selector */ }
    }
    return null;
  }

  function parseSalary(text) {
    if (!text) return null;
    var m = text.match(/\$[\d,]+(?:\.\d+)?[kK]?(?:\s*[-\u2013\u2014]\s*\$[\d,]+(?:\.\d+)?[kK]?)?(?:\s*(?:\/\s*(?:yr|year|hr|hour|mo|month)|per\s+(?:year|hour|month)))?/i);
    return m ? m[0] : null;
  }

  function detectRemote(text) {
    if (!text) return null;
    var t = text.toLowerCase();
    if (/fully\s+remote|100%\s+remote|remote\s+only|work\s+from\s+home|\bwfh\b/.test(t)) return 'remote';
    if (/\bhybrid\b/.test(t)) return 'hybrid';
    if (/\bonsite\b|on-site|in.office|in.person/.test(t)) return 'onsite';
    if (/\bremote\b/.test(t)) return 'remote';
    return null;
  }

  function detectSponsorship(text) {
    if (!text) return false;
    return /visa\s*sponsor|h[1-9][ab][-\s]?(?:visa|transfer|sponsor)|work\s*authorization\s*sponsor|will\s*sponsor|sponsor.*work\s*permit/i.test(text);
  }

  // Parse JSON-LD structured data — most reliable when available
  function parseJsonLD() {
    var scripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (var i = 0; i < scripts.length; i++) {
      try {
        var raw = JSON.parse(scripts[i].textContent);
        var items = Array.isArray(raw) ? raw : [raw];
        for (var j = 0; j < items.length; j++) {
          var item = items[j];
          if (item['@type'] === 'JobPosting' || item['@type'] === 'Job') {
            var desc = item.description
              ? item.description.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
              : null;
            var locObj = item.jobLocation;
            var locStr = null;
            if (typeof locObj === 'string') {
              locStr = locObj;
            } else if (locObj && locObj.address) {
              var addr = locObj.address;
              locStr = [addr.streetAddress, addr.addressLocality, addr.addressRegion, addr.addressCountry]
                .filter(Boolean).join(', ');
            }
            var salary = null;
            if (item.baseSalary && item.baseSalary.value) {
              var bsv = item.baseSalary.value;
              if (bsv.minValue && bsv.maxValue) {
                salary = '$' + bsv.minValue + '\u2013$' + bsv.maxValue;
              } else if (bsv.value) {
                salary = String(bsv.value);
              }
            }
            var org = item.hiringOrganization || item.employer || {};
            return {
              title:       item.title || item.name || null,
              company:     org.name || null,
              jobLocation: locStr,
              description: desc,
              salary:      salary,
              remote:      item.jobLocationType === 'TELECOMMUTE' ? 'remote' : null,
              fromLD:      true
            };
          }
        }
      } catch (e) { /* malformed JSON-LD */ }
    }
    return null;
  }

  // Build the final data object — centralised to avoid copy-paste bugs
  function makeData(site, title, company, jobLocation, description, extras) {
    extras = extras || {};
    var fullText = [title, company, jobLocation, description].join(' ');
    return {
      title:       title       || null,
      company:     company     || null,
      location:    jobLocation || null,   // exposed as `location` to the rest of the extension
      description: description || '',
      salary:      extras.salary      || parseSalary(extras.insightText || fullText),
      remote:      extras.remote      || detectRemote([jobLocation, extras.insightText, description].join(' ')),
      sponsorship: extras.sponsorship !== undefined ? extras.sponsorship : detectSponsorship(description),
      easyApply:   !!extras.easyApply,
      site:        site,
      url:         window.location.href   // always from window — never the local var
    };
  }

  // ─── LinkedIn ────────────────────────────────────────────────────────────────
  function scrapeLinkedIn() {
    var ld = parseJsonLD();

    var title = (ld && ld.title) || tryText(
      '.job-details-jobs-unified-top-card__job-title h1',
      '.job-details-jobs-unified-top-card__job-title',
      '.jobs-unified-top-card__job-title h1',
      '.jobs-unified-top-card__job-title',
      '.job-view-layout h1',
      'h1.t-24',
      '[class*="job-title"] h1',
      '.top-card-layout__title',
      'h1'
    );

    var company = (ld && ld.company) || tryText(
      '.job-details-jobs-unified-top-card__company-name a',
      '.job-details-jobs-unified-top-card__company-name',
      '.jobs-unified-top-card__company-name a',
      '.jobs-unified-top-card__company-name',
      '.jobs-unified-top-card__subtitle-primary-grouping a',
      'a[href*="/company/"][aria-label]',
      '.top-card-layout__card a[href*="company"]'
    );

    var jobLocation = (ld && ld.jobLocation) || tryText(
      '.job-details-jobs-unified-top-card__bullet',
      '.jobs-unified-top-card__bullet',
      '.jobs-unified-top-card__workplace-type',
      '.topcard__flavor--bullet',
      '[class*="workplace-type"]'
    );

    var description = (ld && ld.description) || tryLargestText(
      '.jobs-description__content .jobs-box__html-content',
      '.jobs-description__content',
      '.jobs-description-content__text',
      '#job-details',
      '.description__text--rich',
      '[class*="jobs-description"]',
      '[class*="job-description"]'
    ) || '';

    var easyApply = !!(
      document.querySelector('button[aria-label*="Easy Apply"]') ||
      document.querySelector('.jobs-apply-button--top-card') ||
      document.querySelector('[class*="easy-apply"]') ||
      document.querySelector('button[class*="jobs-apply"]')
    );

    var insightText = tryText(
      '.jobs-unified-top-card__job-insight',
      '.job-details-jobs-unified-top-card__job-insight',
      '.jobs-unified-top-card__salary-info',
      '[class*="salary"]'
    ) || '';

    if (!title && !company) return null;
    return makeData('linkedin', title, company, jobLocation, description, {
      salary: (ld && ld.salary) || parseSalary(insightText) || null,
      remote: (ld && ld.remote) || null,
      sponsorship: detectSponsorship(description),
      easyApply: easyApply,
      insightText: insightText
    });
  }

  // ─── Jobright ────────────────────────────────────────────────────────────────
  function scrapeJobright() {
    var ld = parseJsonLD();
    var title = (ld && ld.title) || tryText('h1', '[class*="JobTitle"]', '[class*="job-title"]', '[class*="jobTitle"]', '[data-testid*="title"]');
    var company = (ld && ld.company) || tryText('[class*="CompanyName"]', '[class*="company-name"]', '[class*="companyName"]', 'a[href*="/company/"]');
    var jobLocation = (ld && ld.jobLocation) || tryText('[class*="Location"]', '[class*="location"]', '[data-testid*="location"]');
    var description = (ld && ld.description) || tryLargestText('[class*="JobDescription"]', '[class*="job-description"]', '[class*="Description"]', 'article', 'main') || '';
    if (!title) return null;
    return makeData('jobright', title, company, jobLocation, description, {
      remote: (ld && ld.remote) || null,
      salary: (ld && ld.salary) || null
    });
  }

  // ─── Indeed ──────────────────────────────────────────────────────────────────
  function scrapeIndeed() {
    var ld = parseJsonLD();
    var title = (ld && ld.title) || tryText(
      '[data-testid="jobsearch-JobInfoHeader-title"] span',
      '[data-testid="jobsearch-JobInfoHeader-title"]',
      '.jobsearch-JobInfoHeader-title',
      'h1'
    );
    var company = (ld && ld.company) || tryText(
      '[data-testid="inlineHeader-companyName"] a',
      '[data-testid="inlineHeader-companyName"]',
      '[data-testid="company-name"]',
      '.jobsearch-InlineCompanyRating-companyHeader a'
    );
    var jobLocation = (ld && ld.jobLocation) || tryText(
      '[data-testid="job-location"]',
      '[data-testid="inlineHeader-companyLocation"]',
      '.jobsearch-JobInfoHeader-subtitle span'
    );
    var description = (ld && ld.description) || tryLargestText(
      '#jobDescriptionText',
      '.jobsearch-jobDescriptionText',
      '[id*="jobDescription"]',
      '[data-testid="job-description"]'
    ) || '';
    var salaryText = tryText('[data-testid="attribute_snippet_testid"]', '[class*="salary"]', '[data-testid*="salary"]');
    if (!title) return null;
    return makeData('indeed', title, company, jobLocation, description, {
      salary: (ld && ld.salary) || parseSalary(salaryText) || null,
      remote: (ld && ld.remote) || null
    });
  }

  // ─── Greenhouse ──────────────────────────────────────────────────────────────
  function scrapeGreenhouse() {
    var ld = parseJsonLD();
    var title = (ld && ld.title) || tryText('.app-title', 'h1.job-post-name', '.posting-headline h2', 'h1');
    var company = (ld && ld.company)
      || tryAttr('content', 'meta[property="og:site_name"]')
      || tryText('.company-name', '[class*="company"]')
      || (document.title.split(' - ').slice(-1)[0] || '').trim();
    var jobLocation = (ld && ld.jobLocation) || tryText('.location', '.posting-categories .location', '[class*="location"]');
    var description = (ld && ld.description) || tryLargestText('#content', '.job-description', '#job-description', '.content', 'article') || '';
    if (!title) return null;
    return makeData('greenhouse', title, company, jobLocation, description, {
      salary: (ld && ld.salary) || null,
      remote: (ld && ld.remote) || null
    });
  }

  // ─── Lever ───────────────────────────────────────────────────────────────────
  function scrapeLever() {
    var ld = parseJsonLD();
    var title = (ld && ld.title) || tryText('.posting-headline h2', '.posting h2', 'h2', 'h1');
    var company = (ld && ld.company)
      || tryAttr('content', 'meta[property="og:site_name"]')
      || (document.title.split(' - ')[1] || document.title.split('|')[1] || '').trim();
    var jobLocation = (ld && ld.jobLocation) || tryText('.location', '.workplaceTypes', '.posting-categories [class*="location"]');
    var description = (ld && ld.description) || tryLargestText('.posting-description', '.content', '[class*="posting-description"]', 'article') || '';
    if (!title) return null;
    return makeData('lever', title, company, jobLocation, description, {
      salary: (ld && ld.salary) || null,
      remote: (ld && ld.remote) || null
    });
  }

  // ─── Workday ─────────────────────────────────────────────────────────────────
  function scrapeWorkday() {
    var ld = parseJsonLD();
    var title = (ld && ld.title) || tryText(
      '[data-automation-id="jobPostingHeader"]',
      '[data-automation-id="Job_Posting_Header"]',
      'h2[data-automation-id]',
      'h1', 'h2'
    );
    var company = (ld && ld.company)
      || tryAttr('content', 'meta[property="og:site_name"]')
      || (document.title.split('|').slice(-1)[0] || document.title.split('-').slice(-1)[0] || '').trim();
    var jobLocation = (ld && ld.jobLocation) || tryText(
      '[data-automation-id="locations"]',
      '[data-automation-id="location"]',
      '[data-automation-id*="Location"]'
    );
    var description = (ld && ld.description) || tryLargestText(
      '[data-automation-id="jobPostingDescription"]',
      '[class*="job-description"]',
      '[class*="rich-text"]',
      'article'
    ) || '';
    if (!title) return null;
    return makeData('workday', title, company, jobLocation, description, {
      salary: (ld && ld.salary) || null,
      remote: (ld && ld.remote) || null
    });
  }

  // ─── Main Scrape with Retry ───────────────────────────────────────────────────
  function scrape() {
    var site = detectSite();
    if (!site) return;

    var data = null;
    try {
      if      (site === 'linkedin')   data = scrapeLinkedIn();
      else if (site === 'jobright')   data = scrapeJobright();
      else if (site === 'indeed')     data = scrapeIndeed();
      else if (site === 'greenhouse') data = scrapeGreenhouse();
      else if (site === 'lever')      data = scrapeLever();
      else if (site === 'workday')    data = scrapeWorkday();
    } catch (e) {
      console.warn('[JobHunt] Scrape error:', e);
      // Don't rethrow — fall through to retry logic
    }

    if (!data || !data.title) {
      if (retryCount < MAX_RETRIES) {
        retryCount++;
        var delay = Math.min(1000 * retryCount, 5000);
        clearTimeout(scrapeTimeout);
        scrapeTimeout = setTimeout(scrape, delay);
        try { chrome.runtime.sendMessage({ type: 'SCRAPE_PROGRESS', progress: retryCount, total: MAX_RETRIES, site: site }); } catch (e) {}
      } else {
        try { chrome.runtime.sendMessage({ type: 'SCRAPE_FAILED', site: site }); } catch (e) {}
      }
      return;
    }

    retryCount = 0;
    if (JSON.stringify(data) !== JSON.stringify(lastJobData)) {
      lastJobData = data;
      console.log('[JobHunt] Scraped:', data.title, '@', data.company);
      try { chrome.runtime.sendMessage({ type: 'JOB_DATA', payload: data }); } catch (e) {}
    }
  }

  // ─── SPA Navigation ──────────────────────────────────────────────────────────
  function onUrlChange() {
    var current = window.location.href;   // explicitly window.location, never shadowed
    if (current !== lastUrl) {
      lastUrl = current;
      lastJobData = null;
      retryCount = 0;
      clearTimeout(scrapeTimeout);
      scrapeTimeout = setTimeout(scrape, 1200);
    }
  }

  var mutationTimer = null;
  var observer = new MutationObserver(function () {
    clearTimeout(mutationTimer);
    mutationTimer = setTimeout(onUrlChange, 400);
  });
  observer.observe(document.body, { subtree: false, childList: true });

  var origPush    = history.pushState.bind(history);
  var origReplace = history.replaceState.bind(history);
  history.pushState    = function () { origPush.apply(history, arguments);    setTimeout(onUrlChange, 100); };
  history.replaceState = function () { origReplace.apply(history, arguments); setTimeout(onUrlChange, 100); };
  window.addEventListener('popstate', function () { setTimeout(onUrlChange, 100); });

  // ─── Message Listener ─────────────────────────────────────────────────────────
  chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
    if (msg.type === 'PING') {
      sendResponse({ ok: true });
      return true;
    }

    if (msg.type === 'REQUEST_JOB_DATA') {
      if (lastJobData) {
        sendResponse({ payload: lastJobData });
        return true;
      }
      // Kick off a fresh scrape and wait up to 5s for data
      retryCount = 0;
      scrape();
      var waited = 0;
      var waitInterval = setInterval(function () {
        waited += 200;
        if (lastJobData) {
          clearInterval(waitInterval);
          try { sendResponse({ payload: lastJobData }); } catch (e) {}
        } else if (waited >= 5000) {
          clearInterval(waitInterval);
          try { sendResponse({ payload: null }); } catch (e) {}
        }
      }, 200);
      return true; // keep channel open for async response
    }

    if (msg.type === 'FORCE_RESCRAPE') {
      lastJobData = null;
      retryCount = 0;
      clearTimeout(scrapeTimeout);
      scrape();
      sendResponse({ ok: true });
      return true;
    }
  });

  // Initial scrape
  scrape();
  console.log('[JobHunt AI Copilot] Content script loaded on', detectSite() || window.location.hostname);
})();
