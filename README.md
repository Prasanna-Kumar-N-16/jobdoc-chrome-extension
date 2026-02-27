## AI Job Applicant — Chrome Extension (Ollama‑Powered)

AI assistant for job applications that **analyzes a job description, tailors your resume with local Ollama**, generates an ATS‑optimized report, and **auto‑fills job forms** on major job boards — all fully on your machine.

---

## Table of Contents
- **Overview**
- **Features**
- **Architecture**
- **Requirements**
- **Installation**
- **Configuration**
- **Usage**
- **Permissions & Security**
- **Development**
- **Troubleshooting**
- **Roadmap**
- **License**

---

## Overview

This repository contains a Chrome (MV3) extension that:
- Connects to **local Ollama** (`http://localhost:11434`) for LLM processing  
- Generates a **deep ATS analysis** and **tailored resume HTML** from your base resume JSON  
- Streams tokens into the popup UI so the user sees progress in real time  
- Auto‑fills common application forms (LinkedIn, Greenhouse, Lever, Workday, and generic forms)

Nothing is sent to any external SaaS API: **all AI calls stay on your machine.**

---

## Features

- **Local AI via Ollama**
  - Uses `/api/chat` streaming with configurable model (e.g. `llama3`, `mistral`, `phi3`, `gemma2`, etc.)
  - Long context (`num_ctx` 12000) for full resume + JD analysis

- **ATS & Fit Analysis**
  - Overall **ATS compatibility score** out of 100
  - Match between resume and JD, including keyword coverage
  - Section‑by‑section breakdown (summary, experience, skills, education, projects)
  - Suggestions for missing achievements, skills, and keywords

- **Tailored Resume Generation**
  - Extracts a “rewritten resume” section from the model output
  - Builds a clean, printable, single‑page **HTML resume** using your contact info

- **Form Auto‑Fill**
  - Auto‑fills name, email, phone, location, LinkedIn, website, and cover‑letter fields
  - Site‑specific logic for LinkedIn, Greenhouse, Lever, Workday, plus a generic heuristic filler

- **Job Description Scraping**
  - Content script scrapes job details from many sites:
    - LinkedIn, Indeed, Greenhouse, Lever, Workday, Glassdoor, Wellfound/AngelList, Dice, ZipRecruiter, Monster, Ashby
    - Generic fallback that finds the largest “description‑like” block on any page

- **Modern Popup UI**
  - Tabs for **Analyze**, **Report**, and **Profile**
  - Live token streaming preview while Ollama is generating
  - Downloadable ATS report + resume HTML and quick **Preview** in a new tab

---

## Architecture

- **Manifest (MV3)** – `manifest.json`
  - Background service worker: `background/service-worker.js`
  - Content script: `content/content.js`
  - Popup UI: `popup/popup.html` + `popup/popup.js` + `popup/defaults.js`
  - Icons and assets: `assets/`

- **Background (`background/service-worker.js`)**
  - Manages Ollama connectivity (`checkOllama`)
  - Streams from `/api/chat` via `ollamaStream` and forwards tokens to the popup
  - Builds ATS analysis result and resume HTML (`handleFullAnalysis`)
  - Handles file downloads (report/resume) and forwards autofill requests to the content script

- **Popup (`popup/popup.html`, `popup/popup.js`)**
  - Provides the main UX for:
    - Connecting to Ollama and listing local models
    - Pasting a job description and triggering **Analyze**
    - Displaying ATS score, analysis, and tailored resume info
    - Configuring profile + resume JSON in the **Profile** tab
  - Renders streamed markdown into rich HTML in the **Report** tab

- **Content Script (`content/content.js`)**
  - Scrapes job descriptions from supported sites
  - Offers generic scraping for arbitrary job pages
  - Auto‑fills application forms with profile data and generated cover letter

---

## Requirements

- **Browser**: Chrome or any Chromium‑based browser that supports Manifest V3
- **Ollama**:
  - Installed and running locally (`ollama serve`)
  - Accessible at `http://localhost:11434` (default; can be changed)
  - CORS enabled for extension origins (see below)
- **OS**: macOS, Windows, or Linux

---

## Installation

### 1. Install Ollama

```bash
# macOS / Linux
curl -fsSL https://ollama.ai/install.sh | sh

# Windows
# Download and install from https://ollama.ai
```

### 2. Pull at Least One Model

```bash
ollama pull llama3        # Recommended general model
ollama pull mistral       # Faster, still strong
ollama pull phi3          # Lightweight, good for slower machines
ollama pull gemma2        # Alternative from Google
```

### 3. Enable CORS for Ollama

The extension calls `http://localhost:11434` from a Chrome extension context, so Ollama must allow cross‑origin requests.

- **Quick scripts in this repo**:
  - macOS / Linux: run `./setup-ollama-cors.sh`
  - Windows: run `setup-ollama-cors.bat` (as Administrator)

Or configure manually:

```bash
export OLLAMA_ORIGINS="*"
ollama serve
```

After changing the environment variable, restart the Ollama service/app.

### 4. Load the Extension in Chrome

1. Open `chrome://extensions`  
2. Toggle **Developer mode** on (top right)  
3. Click **Load unpacked**  
4. Select this project folder  
5. Pin the extension to your toolbar (optional)

---

## Configuration

Open the popup and go to the **Profile** tab:

- **Personal details**
  - First name, last name
  - Email, phone, location
  - LinkedIn, website/GitHub

- **Resume data (JSON)**
  - Paste JSON following the template in `assets/resume_template.json`
  - This is what gets sent to Ollama for tailoring

- **Ollama settings**
  - Ollama URL (defaults to `http://localhost:11434`)
  - Model name (e.g. `llama3`, `mistral`, `phi3`)
  - You can refresh model list from Ollama using the **↻** button

You can reset to your default resume profile using the **Reset** button, which re‑seeds data from `popup/defaults.js`.

---

## Usage

### Analyze a Job Description

1. Copy the full job description from a job posting (title, requirements, responsibilities, etc.)
2. Open the extension popup, ensure **Profile** is filled out
3. In the **Analyze** tab, paste the job description into the textarea
4. Click **Analyze & Generate Resume**
5. Wait while:
   - The extension checks Ollama connectivity
   - Sends your resume JSON + JD to Ollama
   - Streams analysis text back into the popup
6. When complete, the **Report** tab shows:
   - ATS score and match classification
   - Detailed analysis and keyword tables
   - Rewritten resume section

### Download & Preview

From the **Report** tab:
- **Download Report** – saves an HTML ATS report
- **Download Resume** – saves the generated resume HTML
- **Preview** – opens a new tab with the generated resume for quick review/printing

### Auto‑Fill Job Applications

1. Navigate to a supported job application form (LinkedIn Easy Apply, Greenhouse, Lever, Workday, etc.)
2. Run an analysis so the extension has a resume and cover letter ready
3. With the application form open, go to the **Report** tab and click **Autofill**
4. The content script attempts to fill profile fields and a cover‑letter textarea

Filled field counts and any issues are shown in the popup.

---

## Permissions & Security

From `manifest.json`:

- **Permissions**
  - `activeTab`, `tabs`, `scripting` – to inspect and interact with the current tab for scraping and autofill
  - `storage` – to store profile and resume JSON locally in Chrome
  - `downloads` – to save HTML reports and resumes

- **Host permissions**
  - `<all_urls>` – required for scraping JDs and autofilling forms on many sites
  - `http://localhost:11434/*` – calls to local Ollama only

**Security & Privacy**
- All AI requests go to `http://localhost:11434` (your local Ollama instance)
- No remote APIs, no third‑party servers
- Resume/profile data is stored only in browser local storage

Review `manifest.json` and the code in `background/service-worker.js` and `content/content.js` if you need a deeper audit.

---

## Development

- **Tech stack**
  - Plain JavaScript, HTML, and CSS (no framework)
  - Chrome Extension Manifest V3

- **Key files/directories**
  - `manifest.json` – extension manifest and permissions
  - `background/service-worker.js` – Ollama integration + message router
  - `content/content.js` – JD scraping and form autofill
  - `popup/popup.html` – main UI markup + styles
  - `popup/popup.js` – popup logic, streaming, rendering
  - `popup/defaults.js` – default profile/resume JSON and model config
  - `assets/resume_template.json` – resume JSON schema/sample

### Building & Packaging

There is no build step; the extension runs directly from source.  
To publish to the Chrome Web Store, zip the folder (excluding any development‑only files) and upload via the Developer Dashboard.

---

## Troubleshooting

- **Status shows “Ollama offline”**
  - Ensure the Ollama app/service is running (`ollama serve`)
  - Open `http://localhost:11434/api/tags` in a browser – you should see JSON
  - Confirm `OLLAMA_ORIGINS` is configured (or rerun `setup-ollama-cors` scripts)

- **“403 CORS” errors**
  - Means Ollama is blocking cross‑origin requests from Chrome
  - Use the popup’s built‑in CORS helper or run the provided setup scripts

- **Resume JSON errors**
  - Ensure your JSON validates (no trailing commas, properly quoted strings, etc.)
  - Start from `assets/resume_template.json` and adjust gradually

- **Slow generation**
  - Use a smaller model (e.g. `phi3`)
  - Close heavy apps or reduce other workloads while generating

---

## Roadmap

- Optional job‑page auto‑import directly into the Analyze tab
- Multi‑template resume exports (PDF, DOCX via HTML to print/PDF)
- Per‑job history view and comparison
- More robust autofill strategies for highly dynamic sites

---

## License

Specify your license here (e.g. **MIT**, **Apache‑2.0**, or another OSI‑approved license).  
If this is a private/personal project, you may also keep it unlicensed and for personal use only.
