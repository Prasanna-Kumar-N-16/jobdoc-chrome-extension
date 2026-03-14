// utils/ollama.js — Ollama API integration for JobHunt AI Copilot v4

const DEFAULT_BASE_URL = 'http://localhost:11434';

async function getBaseUrl() {
  try {
    const { settings } = await chrome.storage.local.get('settings');
    return (settings && settings.ollamaUrl) ? settings.ollamaUrl : DEFAULT_BASE_URL;
  } catch {
    return DEFAULT_BASE_URL;
  }
}

/**
 * Test connection to Ollama and retrieve available models.
 * Returns { ok: bool, models: string[], error?: 'cors' | 'offline' | 'unknown' }
 */
export async function testConnection() {
  const base = await getBaseUrl();
  try {
    const res = await fetch(`${base}/api/tags`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });
    if (res.status === 403 || res.status === 0) {
      return { ok: false, error: 'cors', models: [] };
    }
    if (!res.ok) {
      return { ok: false, error: 'unknown', models: [] };
    }
    const data = await res.json();
    const models = (data.models || []).map(m => m.name);
    return { ok: true, models };
  } catch (e) {
    if (e instanceof TypeError) {
      // Network error — either offline or CORS preflight blocked
      // Try to distinguish: CORS errors also appear as TypeError
      return { ok: false, error: 'offline', models: [] };
    }
    return { ok: false, error: 'unknown', models: [] };
  }
}

/**
 * Fetch available model names from Ollama.
 * Returns string[]
 */
export async function fetchModels() {
  const result = await testConnection();
  return result.models || [];
}

/**
 * Stream text generation from Ollama.
 * @param {string} prompt - Full prompt text
 * @param {string} model - Model name e.g. "llama3"
 * @param {function} onToken - Called with each token string
 * @param {function} onDone - Called when stream completes
 * @param {function} onError - Called with error message string
 */
export async function streamGenerate(prompt, model, onToken, onDone, onError) {
  const base = await getBaseUrl();
  try {
    const res = await fetch(`${base}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model || 'llama3',
        prompt,
        stream: true
      })
    });

    if (res.status === 403) {
      onError('cors');
      return;
    }
    if (!res.ok) {
      onError(`HTTP error: ${res.status}`);
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n').filter(l => l.trim());

      for (const line of lines) {
        try {
          const obj = JSON.parse(line);
          if (obj.response) {
            onToken(obj.response);
          }
          if (obj.done) {
            onDone();
            return;
          }
          if (obj.error) {
            onError(obj.error);
            return;
          }
        } catch {
          // Skip malformed JSON lines
        }
      }
    }

    onDone();
  } catch (e) {
    if (e instanceof TypeError) {
      onError('offline');
    } else {
      onError(e.message || 'unknown');
    }
  }
}

/**
 * Build prompts for each generation mode.
 */
export function buildPrompt(mode, profile, jobData) {
  const title = jobData?.title || 'the role';
  const company = jobData?.company || 'the company';
  const summary = profile?.summary || '';
  const skills = (profile?.skills || []).join(', ');
  const matchedSkills = (jobData?.matchResult?.matched || []).join(', ');

  switch (mode) {
    case 'resume':
      return `Generate 3-5 ATS-optimized resume bullet points for the role of ${title} at ${company}. Use STAR format with quantified metrics where possible. Emphasize these matched skills: ${matchedSkills || skills}. User background: ${summary}. Output only the bullet points, one per line, starting with a strong action verb.`;

    case 'cover':
      return `Write a concise, non-generic cover letter (250 words or less) for ${title} at ${company}. Tone: direct, human, no buzzwords, no clichés. Opening: a specific hook about the company. Body: 2 STAR-structured achievement bullets. Closing: one sentence call to action. User background: ${summary}. Skills: ${skills}.`;

    case 'pitch':
      return `Write a 30-second elevator pitch for a Backend/Full-Stack Engineer applying to ${company} for the ${title} role. Include: current role context, 1-2 impact metrics, relevant tech stack match. Keep it under 80 words. No filler phrases. Sound human, not rehearsed. User background: ${summary}. Skills: ${skills}.`;

    case 'dm':
      return `Write a LinkedIn cold outreach message to a recruiter at ${company} for the ${title} role. Keep it under 60 words. Friendly, direct, reference one specific thing about the company or the role. Do NOT start with "I hope this finds you well" or any generic opener. End with a simple question or call to action. User background: ${summary}.`;

    default:
      return prompt;
  }
}
