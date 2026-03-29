// content/autofill.js — Form autofill for JobHunt AI Copilot v4
// Injected on demand via chrome.scripting.executeScript

(function () {
  'use strict';

  const FLASH_STYLE_ID = 'jobhunt-autofill-flash';

  // Inject flash CSS if not already present
  if (!document.getElementById(FLASH_STYLE_ID)) {
    const style = document.createElement('style');
    style.id = FLASH_STYLE_ID;
    style.textContent = `
      @keyframes jobhunt-flash {
        0%   { outline: 2px solid #16a37f; box-shadow: 0 0 0 3px rgba(22,163,127,0.25); }
        60%  { outline: 2px solid #16a37f; box-shadow: 0 0 0 3px rgba(22,163,127,0.25); }
        100% { outline: none; box-shadow: none; }
      }
      .jobhunt-filled {
        animation: jobhunt-flash 1.2s ease-out forwards !important;
      }
    `;
    document.head.appendChild(style);
  }

  function detectSite() {
    const host = location.hostname;
    if (/linkedin\.com/.test(host)) return 'linkedin';
    if (/jobright\.ai/.test(host)) return 'jobright';
    if (/indeed\.com/.test(host)) return 'indeed';
    if (/greenhouse\.io/.test(host)) return 'greenhouse';
    if (/lever\.co/.test(host)) return 'lever';
    if (/myworkdayjobs\.com/.test(host)) return 'workday';
    return 'generic';
  }

  // Site-specific field selector mappings
  const FIELD_MAPS = {
    linkedin: {
      name: ['input[name="name"]', 'input[id*="name"]', 'input[placeholder*="name" i]'],
      email: ['input[name="email"]', 'input[type="email"]', 'input[id*="email"]'],
      phone: ['input[name="phone"]', 'input[type="tel"]', 'input[id*="phone"]'],
      summary: ['textarea[id*="summary"]', 'textarea[id*="cover"]', 'textarea[name="summary"]']
    },
    greenhouse: {
      firstName: ['input[id*="first_name"]', 'input[name="first_name"]'],
      lastName: ['input[id*="last_name"]', 'input[name="last_name"]'],
      email: ['input[id*="email"]', 'input[name="email"]', 'input[type="email"]'],
      phone: ['input[id*="phone"]', 'input[name="phone"]', 'input[type="tel"]'],
      linkedin: ['input[id*="linkedin"]', 'input[placeholder*="linkedin" i]'],
      github: ['input[id*="github"]', 'input[placeholder*="github" i]']
    },
    lever: {
      name: ['input[name="name"]', 'input[id*="name"]'],
      email: ['input[name="email"]', 'input[type="email"]'],
      phone: ['input[name="phone"]', 'input[type="tel"]'],
      org: ['input[name="org"]', 'input[id*="company"]'],
      urls_linkedin: ['input[name="urls[LinkedIn]"]', 'input[placeholder*="linkedin" i]'],
      urls_github: ['input[name="urls[GitHub]"]', 'input[placeholder*="github" i]'],
      comments: ['textarea[name="comments"]', 'textarea[id*="cover"]']
    },
    workday: {
      firstName: ['input[data-automation-id*="firstName"]', 'input[data-automation-id*="legalFirstName"]'],
      lastName: ['input[data-automation-id*="lastName"]', 'input[data-automation-id*="legalLastName"]'],
      email: ['input[data-automation-id*="email"]', 'input[type="email"]'],
      phone: ['input[data-automation-id*="phone"]', 'input[type="tel"]'],
      linkedin: ['input[data-automation-id*="linkedin"]', 'input[placeholder*="linkedin" i]']
    },
    generic: {
      firstName: ['input[name="first_name"]', 'input[id*="first"]', 'input[placeholder*="first name" i]'],
      lastName: ['input[name="last_name"]', 'input[id*="last"]', 'input[placeholder*="last name" i]'],
      name: ['input[name="name"]', 'input[id*="name"]', 'input[placeholder*="full name" i]'],
      email: ['input[type="email"]', 'input[name="email"]', 'input[id*="email"]'],
      phone: ['input[type="tel"]', 'input[name="phone"]', 'input[id*="phone"]'],
      linkedin: ['input[placeholder*="linkedin" i]', 'input[id*="linkedin"]'],
      github: ['input[placeholder*="github" i]', 'input[id*="github"]']
    }
  };

  function findElement(selectors) {
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.offsetParent !== null) return el; // visible
    }
    return null;
  }

  function fillField(el, value) {
    if (!el || !value) return false;

    // React/Vue synthetic event approach
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype,
      'value'
    )?.set;

    if (nativeInputValueSetter) {
      nativeInputValueSetter.call(el, value);
    } else {
      el.value = value;
    }

    // Trigger events that frameworks listen to
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));

    // Flash animation
    el.classList.remove('jobhunt-filled');
    void el.offsetWidth; // reflow
    el.classList.add('jobhunt-filled');
    setTimeout(() => el.classList.remove('jobhunt-filled'), 1400);

    return true;
  }

  function splitName(fullName) {
    if (!fullName) return { first: '', last: '' };
    const parts = fullName.trim().split(/\s+/);
    const first = parts[0] || '';
    const last = parts.slice(1).join(' ') || '';
    return { first, last };
  }

  async function autofill() {
    const { profile } = await chrome.storage.local.get('profile');
    if (!profile) return 0;

    const site = detectSite();
    const map = FIELD_MAPS[site] || FIELD_MAPS.generic;
    let filledCount = 0;
    const { first, last } = splitName(profile.name);

    // Helper to try filling with field name
    function tryFill(fieldKey, value) {
      const selectors = map[fieldKey];
      if (!selectors || !value) return;
      const el = findElement(selectors);
      if (el && fillField(el, value)) filledCount++;
    }

    // Name fields
    if (map.name) tryFill('name', profile.name);
    if (map.firstName) tryFill('firstName', first);
    if (map.lastName) tryFill('lastName', last);

    // Contact
    tryFill('email', profile.email);
    tryFill('phone', profile.phone);

    // URLs
    tryFill('linkedin', profile.linkedin);
    tryFill('urls_linkedin', profile.linkedin);
    tryFill('github', profile.github);
    tryFill('urls_github', profile.github);

    // Summary / cover
    tryFill('summary', profile.summary);
    tryFill('comments', profile.summary);

    return filledCount;
  }

  // Execute autofill and report back
  autofill().then(count => {
    if (count > 0) {
      chrome.runtime.sendMessage({ type: 'FIELD_FILLED', count }).catch(() => {});
    }
    console.log(`[JobHunt] Autofilled ${count} fields`);
  }).catch(e => {
    console.warn('[JobHunt] Autofill error:', e);
  });

})();
