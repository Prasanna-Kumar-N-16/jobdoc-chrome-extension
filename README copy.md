# ✦ AI Job Applicant — Chrome Extension

Auto-tailors your resume and cover letter using **local Ollama** for every job you apply to. 100% private, no cloud APIs.

## Features
- 🔍 **Scrapes JD** from 10+ job sites: LinkedIn, Indeed, Greenhouse, Lever, Workday, Glassdoor, AngelList/Wellfound, Dice, ZipRecruiter, Monster, Ashby + generic fallback
- 🤖 **Local AI** via Ollama — fully private, no data leaves your machine
- 📄 **Tailored Resume** — reordered bullets, added keywords, ATS-optimized
- ✉ **Cover Letter** — custom, specific, 250-350 word letter per role
- 📊 **Match Score** — ATS keyword match percentage
- ⬇ **Download** resume + cover letter as print-ready HTML
- ⚡ **Auto-fill** application forms (name, email, phone, LinkedIn, cover letter)
- 👁 **Preview** before downloading

---

## Setup

### 1. Install Ollama
```bash
# macOS / Linux
curl -fsSL https://ollama.ai/install.sh | sh

# Windows: Download from https://ollama.ai
```

### 2. Pull a Model (choose one)
```bash
ollama pull llama3        # Best quality (~4.7GB)
ollama pull llama3.1      # Updated version
ollama pull mistral       # Fast & capable (~4.1GB)
ollama pull gemma2        # Google's model
ollama pull phi3          # Lightweight, fast
```

### 3. Enable CORS for Chrome Extension
Ollama needs to allow connections from Chrome extensions. Add this to your environment:

**macOS/Linux** (`~/.bashrc`, `~/.zshrc`, or `~/.profile`):
```bash
export OLLAMA_ORIGINS="*"
```

**Or run Ollama with:**
```bash
OLLAMA_ORIGINS=* ollama serve
```

**Windows**: Set environment variable `OLLAMA_ORIGINS` = `*` in System Properties → Advanced → Environment Variables.

Then restart Ollama.

### 4. Load the Extension in Chrome
1. Open Chrome → go to `chrome://extensions`
2. Enable **Developer Mode** (toggle top-right)
3. Click **Load unpacked**
4. Select this folder (`job-ai-extension/`)

---

## Configure Your Profile

Click the extension icon → **Profile tab**:

1. Fill in your **personal info** (name, email, phone, location, LinkedIn, website)
2. Paste your **Resume JSON** — copy the format from `assets/resume_template.json`
3. Add **Cover Letter style notes** (e.g. "conversational tone, mention startup experience")
4. Select your **Ollama model**
5. Hit **Save Profile**

### Resume JSON Format
```json
{
  "yearsExperience": 5,
  "skills": ["Python", "React", "AWS"],
  "experience": [
    {
      "company": "Company Name",
      "title": "Your Role",
      "dates": "Jan 2022 – Present",
      "location": "City, State",
      "bullets": [
        "Achievement with metric — increased X by Y%",
        "Built feature used by N users"
      ]
    }
  ],
  "education": [
    {
      "school": "University Name",
      "degree": "B.S.",
      "field": "Computer Science",
      "year": "2019"
    }
  ],
  "certifications": ["AWS SAA (2023)"],
  "projects": [
    {
      "name": "Project Name",
      "description": "What it does",
      "tech": ["React", "Node.js"]
    }
  ]
}
```

---

## Usage

1. Navigate to a job posting on any supported site
2. Click the extension icon (✦)
3. The JD is auto-scanned — if not, click **Scan This Page**
4. Click **Generate Resume + Cover Letter**
5. Wait 30-60 seconds (depending on model)
6. Review **match score** and **keywords added**
7. Click **Preview** to review, then **Download**
8. Click **Auto-Fill** to fill the application form
9. Manually upload your resume file and submit!

---

## Supported Job Sites
| Site | Auto-Scrape | Auto-Fill |
|------|------------|-----------|
| LinkedIn | ✅ | ✅ |
| Indeed | ✅ | ✅ |
| Greenhouse | ✅ | ✅ |
| Lever | ✅ | ✅ |
| Workday | ✅ | ✅ |
| Glassdoor | ✅ | ✅ |
| Wellfound/AngelList | ✅ | ✅ |
| Dice | ✅ | ✅ |
| ZipRecruiter | ✅ | ✅ |
| Monster | ✅ | ✅ |
| Ashby | ✅ | ✅ |
| Generic (any site) | ✅ | ✅ |

---

## Troubleshooting

**"Ollama offline"**
- Make sure Ollama is running: `ollama serve`
- Check OLLAMA_ORIGINS is set to `*`
- Try visiting `http://localhost:11434/api/tags` in browser — should return JSON

**"Failed to parse resume JSON"**
- Use a larger/smarter model (llama3, mistral, gemma2)
- Make sure your resume JSON is valid

**Auto-fill didn't work**
- Some sites use React/Vue forms — try clicking into fields manually first
- Workday may require slow-typing simulation — click into fields then use autofill
- LinkedIn Easy Apply works only when the Easy Apply panel is open

**Slow generation**
- Try a smaller model: `ollama pull phi3` (~2.3GB)
- Close other apps to free RAM
- Generation is 30-90s depending on hardware

---

## Privacy
- All AI processing is 100% local via Ollama
- No data is sent to any external servers
- Your resume data is stored in Chrome's local storage (device only)
