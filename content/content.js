// content/content.js — Robust Job Scraper for JobHunt AI Copilot v4
// Handles SPA navigation, lazy-loaded content, JSON-LD structured data, multiple selector fallbacks

(function () {
  'use strict';

  if (window.__jobhuntInjected) return; // Prevent double-injection
  window.__jobhuntInjected = true;

  let lastUrl = location.href;
  let lastJobData = null;
  let scrapeTimeout = null;
  let retryCount = 0;
  const MAX_RETRIES = 6;

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

  // Try multiple selectors, return first non-empty text
  function tryText(...selectors) {
    for (const sel of selectors) {
      try {
        const els = document.querySelectorAll(sel);
        for (const el of els) {
          const t = (el.innerText || el.textContent || '').trim();
          if (t && t.length > 1) return t;
        }
      } catch { }
    }
    return null;
  }

  // Try multiple attribute reads
  function tryAttr(attr, ...selectors) {
    for (const sel of selectors) {
      try {
        const el = document.querySelector(sel);
        const v = el && el.getAttribute(attr) && el.getAttribute(attr).trim();
        if (v && v.length > 1) return v;
      } catch { }
    }
    return null;
  }

  // Get text from largest matching element (best for descriptions)
  function tryLargestText(...selectors) {
    let best = '';
    for (const sel of selectors) {
      try {
        const els = document.querySelectorAll(sel);
        for (const el of els) {
          const t = (el.innerText || '').trim();
          if (t.length > best.length) best = t;
        }
      } catch { }
    }
    return best || null;
  }

  function parseSalary(text) {
    if (!text) return null;
    const m = text.match(/\$[\d,]+(?:\.\d+)?[kK]?(?:\s*[-\u2013\u2014]\s*\$[\d,]+(?:\.\d+)?[kK]?)?(?:\s*(?:\/\s*(?:yr|year|hr|hour|mo|month)|per\s+(?:year|hour|month)))?/i);
    return m ? m[0] : null;
  }

  function detectRemote(text) {
    if (!text) return null;
    const t = text.toLowerCase();
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
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (const script of scripts) {
      try {
        const raw = JSON.parse(script.textContent);
        const items = Array.isArray(raw) ? raw : [raw];
        for (const item of items) {
          if (item['@type'] === 'JobPosting' || item['@type'] === 'Job') {
            const desc = item.description
              ? item.description.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
              : null;
            const loc = item.jobLocation;
            const locStr = typeof loc === 'string' ? loc :
              loc && loc.address ? (
                [loc.address.streetAddress, loc.address.addressLocality,
                 loc.address.addressRegion, loc.address.addressCountry]
                .filter(Boolean).join(', ')
              ) : null;
            const salary = item.baseSalary && item.baseSalary.value
              ? (item.baseSalary.value.minValue && item.baseSalary.value.maxValue
                  ? '$' + item.baseSalary.value.minValue + '\u2013$' + item.baseSalary.value.maxValue
                  : String(item.baseSalary.value.value || ''))
              : null;
            return {
              title: item.title || item.name || null,
              company: (item.hiringOrganization && item.hiringOrganization.name) || (item.employer && item.employer.name) || null,
              location: locStr,
              description: desc,
              salary: salary,
              remote: item.jobLocationType === 'TELECOMMUTE' ? 'remote' : null,
              fromLD: true
            };
          }
        }
      } catch { }
    }
    return null;
  }

  // ─── LinkedIn ────────────────────────────────────────────────────────────────

  function scrapeLinkedIn() {
    const ld = parseJsonLD();

    const title = (ld && ld.title) || tryText(
      '.job-details-jobs-unified-top-card__job-title h1',
      '.job-details-jobs-unified-top-card__job-title',
      '.jobs-unified-top-card__job-title h1',
      '.jobs-unified-top-card__job-title',
      '.job-view-layout h1',
      'h1.t-24',
      '[class*="job-title"] h1',
      '[class*="topCard"] h1',
      '.top-card-layout__title',
      'h1'
    );

    const company = (ld && ld.company) || tryText(
      '.job-details-jobs-unified-top-card__company-name a',
      '.job-details-jobs-unified-top-card__company-name',
      '.jobs-unified-top-card__company-name a',
      '.jobs-unified-top-card__company-name',
      '.jobs-unified-top-card__subtitle-primary-grouping a',
      'a[href*="/company/"][aria-label]',
      '.top-card-layout__card a[href*="company"]',
      '.artdeco-entity-lockup__subtitle a'
    );

    const location = (ld && ld.location) || tryText(
      '.job-details-jobs-unified-top-card__bullet',
      '.jobs-unified-top-card__bullet',
      '.jobs-unified-top-card__workplace-type',
      '.job-details-jobs-unified-top-card__primary-description span:nth-child(3)',
      '.topcard__flavor--bullet',
      '[class*="workplace-type"]'
    );

    const description = (ld && ld.description) || tryLargestText(
      '.jobs-description__content .jobs-box__html-content',
      '.jobs-description__content',
      '.jobs-description-content__text',
      '.job-details-jobs-unified-top-card__job-description',
      '#job-details',
      '.description__text--rich',
      '[class*="jobs-description"]',
      '[class*="job-description"]'
    ) || '';

    const easyApply = !!(
      document.querySelector('button[aria-label*="Easy Apply"]') ||
      document.querySelector('.jobs-apply-button--top-card') ||
      document.querySelector('[class*="easy-apply"]') ||
      document.querySelector('button[class*="jobs-apply"]')
    );

    const insightText = tryText(
      '.jobs-unified-top-card__job-insight',
      '.job-details-jobs-unified-top-card__job-insight',
      '.jobs-unified-top-card__salary-info',
      '[class*="salary"]'
    ) || '';

    const fullText = [title, company, location, insightText, description].join(' ');
    const salary = (ld && ld.salary) || parseSalary(insightText) || parseSalary(fullText);
    const remote = (ld && ld.remote) || detectRemote([location, insightText, description].join(' '));
    const sponsorship = detectSponsorship(description);

    if (!title && !company) return null;
    return { title, company, location, description, salary, remote, sponsorship, easyApply, site: 'linkedin', url: location.href };
  }

  // ─── Jobright ────────────────────────────────────────────────────────────────

  function scrapeJobright() {
    const ld = parseJsonLD();
    const title = (ld && ld.title) || tryText('h1', '[class*="JobTitle"]', '[class*="job-title"]', '[class*="jobTitle"]', '[data-testid*="title"]');
    const company = (ld && ld.company) || tryText('[class*="CompanyName"]', '[class*="company-name"]', '[class*="companyName"]', 'a[href*="/company/"]');
    const location = (ld && ld.location) || tryText('[class*="Location"]', '[class*="location"]', '[data-testid*="location"]');
    const description = (ld && ld.description) || tryLargestText('[class*="JobDescription"]', '[class*="job-description"]', '[class*="Description"]', 'article', 'main') || '';
    const fullText = [title, company, location, description].join(' ');
    if (!title) return null;
    return { title, company, location, description, salary: parseSalary(fullText), remote: detectRemote(fullText), sponsorship: detectSponsorship(description), easyApply: false, site: 'jobright', url: location.href };
  }

  // ─── Indeed ──────────────────────────────────────────────────────────────────

  function scrapeIndeed() {
    const ld = parseJsonLD();
    const title = (ld && ld.title) || tryText('[data-testid="jobsearch-JobInfoHeader-title"] span', '[data-testid="jobsearch-JobInfoHeader-title"]', '.jobsearch-JobInfoHeader-title', 'h1');
    const company = (ld && ld.company) || tryText('[data-testid="inlineHeader-companyName"] a', '[data-testid="inlineHeader-companyName"]', '[data-testid="company-name"]', '.jobsearch-InlineCompanyRating-companyHeader a');
    const location = (ld && ld.location) || tryText('[data-testid="job-location"]', '[data-testid="inlineHeader-companyLocation"]', '.jobsearch-JobInfoHeader-subtitle span');
    const description = (ld && ld.description) || tryLargestText('#jobDescriptionText', '.jobsearch-jobDescriptionText', '[id*="jobDescription"]', '[data-testid="job-description"]') || '';
    const salaryEl = tryText('[data-testid="attribute_snippet_testid"]', '[class*="salary"]', '[data-testid*="salary"]');
    const fullText = [title, company, location, description].join(' ');
    if (!title) return null;
    return { title, company, location, description, salary: parseSalary(salaryEl) || parseSalary(fullText), remote: detectRemote(fullText), sponsorship: detectSponsorship(description), easyApply: false, site: 'indeed', url: location.href };
  }

  // ─── Greenhouse ──────────────────────────────────────────────────────────────

  function scrapeGreenhouse() {
    const ld = parseJsonLD();
    const title = (ld && ld.title) || tryText('.app-title', 'h1.job-post-name', '.posting-headline h2', 'h1');
    const company = (ld && ld.company) || tryAttr('content', 'meta[property="og:site_name"]') || tryText('.company-name') || document.title.split(' - ').slice(-1)[0];
    const location = (ld && ld.location) || tryText('.location', '.posting-categories .location', '[class*="location"]');
    const description = (ld && ld.description) || tryLargestText('#content', '.job-description', '#job-description', '.content', 'article') || '';
    const fullText = [title, company, location, description].join(' ');
    if (!title) return null;
    return { title, company, location, description, salary: parseSalary(fullText), remote: detectRemote(fullText), sponsorship: detectSponsorship(description), easyApply: false, site: 'greenhouse', url: location.href };
  }

  // ─── Lever ───────────────────────────────────────────────────────────────────

  function scrapeLever() {
    const ld = parseJsonLD();
    const title = (ld && ld.title) || tryText('.posting-headline h2', '.posting h2', 'h2', 'h1');
    const company = (ld && ld.company) || tryAttr('content', 'meta[property="og:site_name"]') || document.title.split(' - ')[1] || document.title.split('|')[1] || '';
    const location = (ld && ld.location) || tryText('.location', '.workplaceTypes', '.posting-categories [class*="location"]');
    const description = (ld && ld.description) || tryLargestText('.posting-description', '.content', '[class*="posting-description"]', 'article') || '';
    const fullText = [title, company, location, description].join(' ');
    if (!title) return null;
    return { title, company, location, description, salary: parseSalary(fullText), remote: detectRemote(fullText), sponsorship: detectSponsorship(description), easyApply: false, site: 'lever', url: location.href };
  }

  // ─── Workday ─────────────────────────────────────────────────────────────────

  function scrapeWorkday() {
    const ld = parseJsonLD();
    const title = (ld && ld.title) || tryText('[data-automation-id="jobPostingHeader"]', '[data-automation-id="Job_Posting_Header"]', 'h2[data-automation-id]', 'h1', 'h2');
    const company = (ld && ld.company) || tryAttr('content', 'meta[property="og:site_name"]') || document.title.split('|').slice(-1)[0] || document.title.split('-').slice(-1)[0] || '';
    const location = (ld && ld.location) || tryText('[data-automation-id="locations"]', '[data-automation-id="location"]', '[data-automation-id*="Location"]');
    const description = (ld && ld.description) || tryLargestText('[data-automation-id="jobPostingDescription"]', '[class*="job-description"]', '[class*="rich-text"]', 'article') || '';
    const fullText = [title, company, location, description].join(' ');
    if (!title) return null;
    return { title, company, location, description, salary: parseSalary(fullText), remote: detectRemote(fullText), sponsorship: detectSponsorship(description), easyApply: false, site: 'workday', url: location.href };
  }

  // ─── Main Scrape with Retry ───────────────────────────────────────────────────

  function scrape() {
    const site = detectSite();
    if (!site) return;

    let data = null;
    try {
      if (site === 'linkedin')   data = scrapeLinkedIn();
      else if (site === 'jobright')   data = scrapeJobright();
      else if (site === 'indeed')     data = scrapeIndeed();
      else if (site === 'greenhouse') data = scrapeGreenhouse();
      else if (site === 'lever')      data = scrapeLever();
      else if (site === 'workday')    data = scrapeWorkday();
    } catch (e) {
      console.warn('[JobHunt] Scrape error:', e);
    }

    if (!data || !data.title) {
      if (retryCount < MAX_RETRIES) {
        retryCount++;
        const delay = Math.min(1000 * retryCount, 5000);
        clearTimeout(scrapeTimeout);
        scrapeTimeout = setTimeout(scrape, delay);
        chrome.runtime.sendMessage({ type: 'SCRAPE_PROGRESS', progress: retryCount, total: MAX_RETRIES, site }).catch(function(){});
      } else {
        chrome.runtime.sendMessage({ type: 'SCRAPE_FAILED', site }).catch(function(){});
      }
      return;
    }

    retryCount = 0;
    if (JSON.stringify(data) !== JSON.stringify(lastJobData)) {
      lastJobData = data;
      console.log('[JobHunt] Scraped:', data.title, '@', data.company);
      chrome.runtime.sendMessage({ type: 'JOB_DATA', payload: data }).catch(function(){});
    }
  }

  // ─── SPA Navigation ──────────────────────────────────────────────────────────

  function onUrlChange() {
    const current = location.href;
    if (current !== lastUrl) {
      lastUrl = current;
      lastJobData = null;
      retryCount = 0;
      clearTimeout(scrapeTimeout);
      scrapeTimeout = setTimeout(scrape, 1200);
    }
  }

  let mutationTimer = null;
  const observer = new MutationObserver(function() {
    clearTimeout(mutationTimer);
    mutationTimer = setTimeout(onUrlChange, 400);
  });
  observer.observe(document.body, { subtree: false, childList: true });

  const origPush = history.pushState.bind(history);
  const origReplace = history.replaceState.bind(history);
  history.pushState = function() { origPush.apply(history, arguments); setTimeout(onUrlChange, 100); };
  history.replaceState = function() { origReplace.apply(history, arguments); setTimeout(onUrlChange, 100); };
  window.addEventListener('popstate', function() { setTimeout(onUrlChange, 100); });

  // ─── Message Listener ─────────────────────────────────────────────────────────

  chrome.runtime.onMessage.addListener(function(msg, sender, sendResponse) {
    if (msg.type === 'PING') {
      sendResponse({ ok: true });
      return true;
    }
    if (msg.type === 'REQUEST_JOB_DATA') {
      if (lastJobData) {
        sendResponse({ payload: lastJobData });
        return true;
      }
      retryCount = 0;
      scrape();
      var waited = 0;
      var waitInterval = setInterval(function() {
        waited += 200;
        if (lastJobData) {
          clearInterval(waitInterval);
          sendResponse({ payload: lastJobData });
        } else if (waited >= 4000) {
          clearInterval(waitInterval);
          sendResponse({ payload: null });
        }
      }, 200);
      return true;
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
  console.log('[JobHunt AI Copilot] Content script loaded on', detectSite() || location.hostname);
})();
