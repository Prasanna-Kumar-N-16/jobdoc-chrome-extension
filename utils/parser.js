// utils/parser.js — JD parsing, keyword extraction, match scoring for JobHunt AI Copilot v4

// Common tech terms, frameworks, languages to prioritize in JD parsing
const TECH_PATTERNS = [
  // Languages
  'javascript', 'typescript', 'python', 'java', 'go', 'golang', 'rust', 'c\\+\\+', 'c#', 'ruby', 'php', 'swift', 'kotlin', 'scala',
  // Frontend
  'react', 'vue', 'angular', 'next\\.js', 'nuxt', 'svelte', 'html', 'css', 'tailwind', 'webpack', 'vite',
  // Backend
  'node\\.js', 'express', 'fastapi', 'django', 'flask', 'spring', 'gin', 'fiber', 'nestjs',
  // Databases
  'postgresql', 'postgres', 'mysql', 'mongodb', 'redis', 'elasticsearch', 'cassandra', 'dynamodb', 'sqlite', 'cockroachdb',
  // Cloud & DevOps
  'aws', 'gcp', 'azure', 'docker', 'kubernetes', 'k8s', 'terraform', 'ansible', 'jenkins', 'github actions', 'ci/cd',
  // Data & Streaming
  'kafka', 'rabbitmq', 'sqs', 'pubsub', 'spark', 'airflow', 'dbt', 'snowflake', 'bigquery',
  // APIs & Protocols
  'rest', 'graphql', 'grpc', 'websocket', 'openapi', 'swagger',
  // Practices
  'microservices', 'distributed systems', 'system design', 'agile', 'scrum', 'tdd', 'bdd', 'ci/cd',
  // Soft skills / experience
  'leadership', 'mentoring', 'cross-functional', 'stakeholder'
];

const TECH_REGEX = new RegExp(`\\b(${TECH_PATTERNS.join('|')})\\b`, 'gi');

// Stop words to exclude from general noun extraction
const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'you', 'our', 'are', 'this', 'that', 'will', 'have',
  'your', 'from', 'they', 'been', 'has', 'its', 'but', 'not', 'or', 'by', 'we', 'at',
  'be', 'an', 'as', 'of', 'to', 'in', 'is', 'it', 'on', 'do', 'if', 'up', 'us',
  'can', 'may', 'must', 'should', 'would', 'could', 'also', 'into', 'more', 'any',
  'all', 'new', 'use', 'work', 'who', 'how', 'what', 'when', 'where', 'why', 'strong',
  'ability', 'experience', 'skills', 'knowledge', 'understanding', 'proficiency'
]);

/**
 * Extract relevant keywords from job description text.
 * @param {string} jdText
 * @returns {string[]} Deduplicated, normalized keyword list
 */
export function extractKeywords(jdText) {
  if (!jdText) return [];

  const found = new Set();

  // Extract known tech terms
  const techMatches = jdText.match(TECH_REGEX) || [];
  techMatches.forEach(m => found.add(m.toLowerCase().trim()));

  // Extract capitalized multi-word terms (e.g., "Amazon Web Services", "Data Engineering")
  const capPhrases = jdText.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b/g) || [];
  capPhrases.forEach(p => {
    const lower = p.toLowerCase();
    if (!STOP_WORDS.has(lower) && lower.length > 3) {
      found.add(lower);
    }
  });

  // Extract standalone capitalized words (likely tools/tech)
  const capWords = jdText.match(/\b[A-Z][A-Za-z]{2,}\b/g) || [];
  capWords.forEach(w => {
    const lower = w.toLowerCase();
    if (!STOP_WORDS.has(lower) && lower.length > 2 && !/^\d/.test(lower)) {
      found.add(lower);
    }
  });

  // Extract year experience patterns: "3+ years", "5 years of"
  const yearMatches = jdText.match(/(\d+)\+?\s*years?\s+(?:of\s+)?([a-z][a-z\s]{2,20})/gi) || [];
  yearMatches.forEach(m => {
    const parts = m.match(/years?\s+(?:of\s+)?(.+)/i);
    if (parts && parts[1]) {
      found.add(parts[1].trim().toLowerCase());
    }
  });

  return [...found].filter(k => k.length > 1).slice(0, 60);
}

/**
 * Compute match score between user skills and JD keywords.
 * @param {string[]} userSkills
 * @param {string[]} jdKeywords
 * @returns {{ overall: number, skills: number, experience: number, matched: string[], partial: string[], missing: string[] }}
 */
export function computeMatchScore(userSkills, jdKeywords) {
  if (!jdKeywords.length) {
    return { overall: 0, skills: 0, experience: 0, matched: [], partial: [], missing: [] };
  }

  const normalizedUser = userSkills.map(s => s.toLowerCase().trim());
  const matched = [];
  const partial = [];
  const missing = [];

  for (const kw of jdKeywords) {
    const kwLower = kw.toLowerCase();

    // Exact match
    if (normalizedUser.some(s => s === kwLower)) {
      matched.push(kw);
      continue;
    }

    // Partial match: user skill contains keyword or vice versa
    const isPartial = normalizedUser.some(s =>
      s.includes(kwLower) || kwLower.includes(s) || tokenOverlap(s, kwLower) > 0.5
    );

    if (isPartial) {
      partial.push(kw);
    } else {
      missing.push(kw);
    }
  }

  const total = jdKeywords.length;
  const skillsScore = Math.round(((matched.length + partial.length * 0.5) / total) * 100);
  const experienceScore = Math.round((matched.length / total) * 100);
  const overall = Math.round((skillsScore * 0.6 + experienceScore * 0.4));

  return {
    overall: Math.min(overall, 100),
    skills: Math.min(skillsScore, 100),
    experience: Math.min(experienceScore, 100),
    matched,
    partial,
    missing
  };
}

/**
 * Helper: compute token overlap ratio between two strings
 */
function tokenOverlap(a, b) {
  const tokA = a.split(/\s+/);
  const tokB = b.split(/\s+/);
  const setA = new Set(tokA);
  const common = tokB.filter(t => setA.has(t));
  return common.length / Math.max(tokA.length, tokB.length);
}

/**
 * Detect which supported job site a URL belongs to.
 * @param {string} url
 * @returns {'linkedin'|'jobright'|'indeed'|'greenhouse'|'lever'|'workday'|null}
 */
export function detectSite(url) {
  if (!url) return null;
  if (/linkedin\.com/i.test(url)) return 'linkedin';
  if (/jobright\.ai/i.test(url)) return 'jobright';
  if (/indeed\.com/i.test(url)) return 'indeed';
  if (/greenhouse\.io/i.test(url)) return 'greenhouse';
  if (/lever\.co/i.test(url)) return 'lever';
  if (/myworkdayjobs\.com/i.test(url)) return 'workday';
  return null;
}

/**
 * Parse salary string from text.
 * @param {string} text
 * @returns {string|null}
 */
export function parseSalary(text) {
  if (!text) return null;
  const match = text.match(/\$[\d,]+(?:k)?(?:\s*[-–]\s*\$[\d,]+(?:k)?)?(?:\s*\/\s*(?:yr|year|hr|hour))?/i);
  return match ? match[0] : null;
}

/**
 * Check if job mentions visa sponsorship.
 * @param {string} text
 * @returns {boolean}
 */
export function detectSponsorship(text) {
  if (!text) return false;
  return /visa\s+sponsor(?:ship)?|h[1-9][ab]|sponsor\s+work\s+authorization|work\s+authorization\s+sponsor/i.test(text);
}

/**
 * Detect remote work type from text.
 * @param {string} text
 * @returns {'remote'|'hybrid'|'onsite'|null}
 */
export function detectRemote(text) {
  if (!text) return null;
  if (/\bfully\s+remote\b|\bremote\s+only\b|\b100%\s+remote\b/i.test(text)) return 'remote';
  if (/\bremote\b/i.test(text) && !/\bnon.?remote\b/i.test(text)) return 'remote';
  if (/\bhybrid\b/i.test(text)) return 'hybrid';
  if (/\bon.?site\b|\bin.?office\b/i.test(text)) return 'onsite';
  return null;
}
