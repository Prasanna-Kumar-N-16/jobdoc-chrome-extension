// utils/storage.js — chrome.storage.local CRUD helpers for JobHunt AI Copilot v4

const DEFAULT_SCHEMA = {
  profile: {
    name: '',
    email: '',
    phone: '',
    linkedin: '',
    github: '',
    summary: '',
    skills: []
  },
  settings: {
    model: 'llama3',
    ollamaUrl: 'http://localhost:11434'
  },
  log: [],
  stats: {
    applied: 0,
    generated: 0,
    filled: 0,
    saved: 0
  }
};

/**
 * Initialize storage with defaults on first install.
 * Called from service_worker onInstalled.
 */
export async function initStorage() {
  const existing = await chrome.storage.local.get(null);
  const updates = {};
  if (!existing.profile) updates.profile = DEFAULT_SCHEMA.profile;
  if (!existing.settings) updates.settings = DEFAULT_SCHEMA.settings;
  if (!existing.log) updates.log = DEFAULT_SCHEMA.log;
  if (!existing.stats) updates.stats = DEFAULT_SCHEMA.stats;
  if (Object.keys(updates).length > 0) {
    await chrome.storage.local.set(updates);
  }
}

// ─── Profile ────────────────────────────────────────────────────────────────

export async function getProfile() {
  const { profile } = await chrome.storage.local.get('profile');
  return profile || DEFAULT_SCHEMA.profile;
}

export async function saveProfile(profileData) {
  const current = await getProfile();
  const merged = { ...current, ...profileData };
  // Normalize skills to array
  if (typeof merged.skills === 'string') {
    merged.skills = merged.skills.split(',').map(s => s.trim()).filter(Boolean);
  }
  await chrome.storage.local.set({ profile: merged });
  return merged;
}

// ─── Settings ───────────────────────────────────────────────────────────────

export async function getSettings() {
  const { settings } = await chrome.storage.local.get('settings');
  return settings || DEFAULT_SCHEMA.settings;
}

export async function saveSettings(settingsData) {
  const current = await getSettings();
  const merged = { ...current, ...settingsData };
  await chrome.storage.local.set({ settings: merged });
  return merged;
}

// ─── Application Log ────────────────────────────────────────────────────────

export async function getLog() {
  const { log } = await chrome.storage.local.get('log');
  return log || [];
}

export async function addLogEntry(entry) {
  const log = await getLog();
  const newEntry = {
    id: Date.now().toString(),
    company: entry.company || '',
    role: entry.role || '',
    date: entry.date || new Date().toISOString().split('T')[0],
    status: entry.status || 'Applied',
    source: entry.source || ''
  };
  log.unshift(newEntry); // newest first
  await chrome.storage.local.set({ log });
  return newEntry;
}

export async function deleteLogEntry(id) {
  const log = await getLog();
  const filtered = log.filter(e => e.id !== id);
  await chrome.storage.local.set({ log: filtered });
}

export async function updateLogEntryStatus(id, status) {
  const log = await getLog();
  const updated = log.map(e => e.id === id ? { ...e, status } : e);
  await chrome.storage.local.set({ log: updated });
}

// ─── Stats ──────────────────────────────────────────────────────────────────

export async function getStats() {
  const { stats } = await chrome.storage.local.get('stats');
  return stats || DEFAULT_SCHEMA.stats;
}

export async function incrementStat(key) {
  const stats = await getStats();
  if (key in stats) {
    stats[key] = (stats[key] || 0) + 1;
    await chrome.storage.local.set({ stats });
  }
  return stats;
}

export async function resetStats() {
  await chrome.storage.local.set({ stats: { ...DEFAULT_SCHEMA.stats } });
}
