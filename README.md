# JobHunt AI Copilot v4

**Local · Free · Open Source** — AI-powered job application assistant for Chrome.  
No paid APIs. No data sent to the cloud. Runs entirely on your machine via [Ollama](https://ollama.ai).

---

## What it does

| Tab | Function |
|-----|----------|
| **Job** | Auto-detects job postings on LinkedIn, Jobright, Indeed, Greenhouse, Lever, Workday. Shows ATS match score, skill gap analysis, and job chips. |
| **Generate** | Streams AI-generated resumes, cover letters, elevator pitches, and LinkedIn DMs — token by token from a local LLM. |
| **Fill** | Autofills job application forms on supported sites with your profile data. Fields flash teal on fill. |
| **Log** | Tracks your applications with status badges (Applied / Interview / Rejected / Offer) and lifetime stats. |
| **Me** | Your profile: name, email, phone, LinkedIn, GitHub, summary, skills. Feeds all AI prompts. |
| **Setup** | Ollama connection status, model selector, CORS fix wizard. |

---

## Installation

### Step 1 — Install Ollama

Download and install from [https://ollama.ai](https://ollama.ai), then pull a model:

```bash
ollama pull llama3
```

### Step 2 — Start Ollama with CORS enabled

The extension runs in a Chrome popup which requires CORS to be open. Start Ollama with:

**macOS / Linux:**
```bash
OLLAMA_ORIGINS=* ollama serve
```

**Windows (PowerShell):**
```powershell
$env:OLLAMA_ORIGINS="*"; ollama serve
```

> **Why is this needed?** Chrome extensions make requests from a `chrome-extension://` origin. Ollama blocks cross-origin requests by default. Setting `OLLAMA_ORIGINS=*` allows the extension to connect.

### Step 3 — Load the extension in Chrome

1. Open Chrome and navigate to `chrome://extensions`
2. Enable **Developer mode** (toggle in the top-right corner)
3. Click **"Load unpacked"**
4. Select the `jobhunt-ai-copilot-v4` folder (the one containing `manifest.json`)
5. The extension icon will appear in your toolbar

### Step 4 — Verify the connection

1. Click the **JobHunt AI Copilot** icon in Chrome
2. Go to the **Setup** tab
3. Click **"Test"** — you should see a green "Connected" status
4. The header chip will show **"Ollama ✓"**

If you see a CORS error, make sure Ollama was started with `OLLAMA_ORIGINS=*` as shown above.

---

## Usage

### Analyzing a job

1. Navigate to a job posting on LinkedIn, Indeed, Greenhouse, Lever, Workday, or Jobright
2. Click the extension icon
3. The **Job** tab auto-populates with the scraped title, company, chips (salary, remote, visa sponsorship, Easy Apply)
4. Click **Analyze** to run local keyword extraction and see your ATS match score
5. Green chips = skills you have · Amber = partial match · Red = missing

### Generating content

1. Go to the **Generate** tab
2. Select a mode: Resume · Cover Letter · Elevator Pitch · LinkedIn DM
3. Click **Generate** — text streams token by token from Ollama
4. Add a custom instruction at the bottom to refine the output
5. Use the **Copy** button to copy to clipboard

### Autofilling forms

1. Navigate to a job application form (LinkedIn Easy Apply, Greenhouse, Lever, Workday)
2. Open the extension, go to **Fill**
3. Click **"Auto-fill Page"** — your profile fields are injected into the form
4. Fields flash with a teal border when filled

### Setting up your profile

1. Go to the **Me** tab
2. Fill in your name, email, phone, LinkedIn, GitHub, and a rich summary paragraph
3. Add your skills (comma-separated or one at a time)
4. Select your preferred model from the dropdown
5. Click **Save Profile**

> **Tip:** The richer your summary in the Me tab, the better the AI output will be. Include your years of experience, key impact metrics, and tech stack.

---

## Supported Sites

| Site | Job Detection | Autofill |
|------|--------------|----------|
| LinkedIn | ✓ | ✓ (Easy Apply) |
| Jobright.ai | ✓ | ✓ |
| Indeed | ✓ | ✓ |
| Greenhouse | ✓ | ✓ |
| Lever | ✓ | ✓ |
| Workday | ✓ | ✓ |

---

## File Structure

```
jobhunt-ai-copilot-v4/
├── manifest.json              MV3 manifest
├── background/
│   └── service_worker.js      Message router, stat tracking
├── content/
│   ├── content.js             Per-site DOM scrapers + SPA navigation
│   └── autofill.js            Form field filler with teal flash
├── utils/
│   ├── ollama.js              Ollama API: testConnection, streamGenerate, buildPrompt
│   ├── storage.js             chrome.storage.local CRUD helpers
│   └── parser.js              Keyword extraction, ATS scoring, site detection
├── popup/
│   ├── popup.html             All 6 tabs
│   ├── popup.css              Full design system (CSS variables, components)
│   └── popup.js              Main controller
└── icons/
    ├── icon16.png
    ├── icon32.png
    ├── icon48.png
    └── icon128.png
```

---

## Troubleshooting

**"Ollama Offline" in header**  
→ Ollama is not running. Start it: `ollama serve` (or with CORS: `OLLAMA_ORIGINS=* ollama serve`)

**"CORS Error" in header**  
→ Ollama is running but blocking requests. Restart with `OLLAMA_ORIGINS=* ollama serve`

**No job detected on LinkedIn**  
→ Make sure you're on a job detail page (`/jobs/view/...`), not just the search results list. Click a job to open its detail panel.

**Autofill didn't fill any fields**  
→ The site may use dynamic form rendering. Try scrolling to the form first, then clicking Auto-fill again. Greenhouse and Lever work most reliably.

**Model dropdown is empty**  
→ Go to Setup tab and click Test. If Ollama is connected, pull a model: `ollama pull llama3`

---

## Privacy

- All AI processing runs locally via Ollama — nothing leaves your machine
- Your profile data is stored in `chrome.storage.local` (browser-local, never synced)
- No analytics, no tracking, no accounts

---

*JobHunt AI Copilot v4 · Free · Local · Open Source*
