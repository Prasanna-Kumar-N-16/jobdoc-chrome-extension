// background/service_worker.js — Service Worker for JobHunt AI Copilot v4
import { initStorage, incrementStat } from '../utils/storage.js';

// ─── Install Handler ─────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('[JobHunt] Extension installed/updated:', details.reason);
  await initStorage();
});

// ─── Message Router ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      switch (msg.type) {

        // Content script reports autofill completed
        case 'FIELD_FILLED': {
          const count = msg.count || 1;
          for (let i = 0; i < count; i++) {
            await incrementStat('filled');
          }
          sendResponse({ ok: true });
          break;
        }

        // Popup requests autofill injection on the active tab
        case 'INJECT_AUTOFILL': {
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (tab?.id) {
            await chrome.scripting.executeScript({
              target: { tabId: tab.id },
              files: ['content/autofill.js']
            });
            sendResponse({ ok: true });
          } else {
            sendResponse({ ok: false, error: 'No active tab found' });
          }
          break;
        }

        // Popup requests job data from the active tab
        case 'GET_JOB_DATA': {
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (tab?.id) {
            try {
              const response = await chrome.tabs.sendMessage(tab.id, { type: 'REQUEST_JOB_DATA' });
              sendResponse(response || { payload: null });
            } catch {
              sendResponse({ payload: null });
            }
          } else {
            sendResponse({ payload: null });
          }
          break;
        }

        // Increment an arbitrary stat key
        case 'INCREMENT_STAT': {
          if (msg.key) {
            const stats = await incrementStat(msg.key);
            sendResponse({ ok: true, stats });
          } else {
            sendResponse({ ok: false });
          }
          break;
        }

        default:
          sendResponse({ ok: false, error: 'Unknown message type' });
      }
    } catch (e) {
      console.error('[JobHunt] Service worker error:', e);
      sendResponse({ ok: false, error: e.message });
    }
  })();

  return true; // Keep message channel open for async response
});

// ─── Tab Update Listener ─────────────────────────────────────────────────────
// Re-injects content script if the tab navigates to a supported job site
// (handles cases where the extension was installed after page load)

const SUPPORTED_PATTERNS = [
  /linkedin\.com\/jobs/,
  /jobright\.ai/,
  /indeed\.com/,
  /greenhouse\.io/,
  /lever\.co/,
  /myworkdayjobs\.com/
];

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete' || !tab.url) return;

  const isSupported = SUPPORTED_PATTERNS.some(p => p.test(tab.url));
  if (!isSupported) return;

  // Try to ping content script — if it errors, inject it
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'PING' });
  } catch {
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['content/content.js']
      });
    } catch (e) {
      console.warn('[JobHunt] Could not inject content script:', e.message);
    }
  }
});

console.log('[JobHunt AI Copilot] Service worker started');
