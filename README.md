# 🚀 Auto-Marketer: Resilient AI Orchestration Pipeline

Auto-Marketer is a robust pipeline that automates the generation of complete social media campaigns from a single URL input. It scrapes web pages, extracts context, synthesizes captions, translates brand tone into visual parameters, generates graphics, and archives campaigns locally.

It features a command-line interface (CLI) and a premium, responsive Web Dashboard built with standard HTML, vanilla CSS, and JavaScript.

---

## 🌟 Key Features

- **Multi-API Integration**: Built-in REST clients for **Groq**, **Gemini**, and **OpenAI** (for copy synthesis), alongside **Hugging Face**, **Fal.ai**, and **DALL-E** (for graphics generation).
- **Double-Layer Scraping Fallback**: Falls back to OpenGraph meta tags and domain-based inference if standard browser request spoofing gets blocked by firewalls (e.g. Cloudflare).
- **Resilient Image Generation**: Automatically switches to **Unsplash Stock Photo** queries or a **Locally Generated SVG Canvas Card** if image generation APIs fail, time out, or rate limit.
- **Zero-Config Sandbox Mode**: Includes a "Mock Mode" that simulates the pipeline using placeholder assets and high-res Unsplash graphics so you can test it immediately without configuring API keys.
- **Interactive UI Console Logs**: Watch every phase of the pipeline execute in real time with the visual dashboard logs panel.

---

## 📂 Project Structure

```
.
├── server.js              # Express server and API backend
├── cli.js                 # Command Line Interface runner
├── scraper.js             # Resilient Cheerio-based web scraper
├── ai.js                  # LLM and Image API request handlers
├── package.json           # Node configuration and dependencies
├── .env.example           # API keys configuration template
├── public/                # Web Dashboard assets (served by Express)
│   ├── index.html         # UI Layout
│   ├── style.css          # Premium glassmorphic styling
│   └── app.js             # Frontend state machine and event listener
└── outputs/               # Campaign storage folder (auto-generated)
    └── campaign_[time]/   # Individual campaign run output
        ├── metadata.json  # Inferred brand data, caption, and prompts
        ├── caption.txt    # Plaintext campaign caption
        └── graphic.png    # The generated graphic asset
```

---

## 🛠️ Installation & Setup

### 1. Prerequisites
Ensure you have **Node.js** installed (v18 or higher is recommended; tested on v24).

### 2. Install Dependencies
Clone or download this repository, open your terminal in the directory, and run:
```bash
npm install
```

### 3. API Keys Configuration (Optional)
If you want to run the pipeline using live AI endpoints, rename `.env.example` to `.env` and insert your API credentials:
```bash
cp .env.example .env
```
Open `.env` and configure your keys:
- `GROQ_API_KEY`: API key from console.groq.com
- `GEMINI_API_KEY`: API key from Google AI Studio
- `OPENAI_API_KEY`: API key from platform.openai.com (for GPT-4o-mini and DALL-E)
- `HF_API_KEY`: User access token from huggingface.co (FLUX.1-schnell model is free)
- `FAL_KEY`: API key from fal.ai

*Note: If keys are missing or you run in Sandbox Mode, the application gracefully operates using Mock content and stock images, ensuring the pipeline never crashes.*

---

## 💻 Usage

### Option A: The Web Dashboard (Recommended)
Launch the server:
```bash
npm start
```
1. Open your browser and navigate to **`http://localhost:3000`**.
2. To use live APIs, paste your API keys into the **🔑 Configure API Keys** drawer, or make sure they are written in your `.env` file.
3. Toggle the **Sandbox / Mock Mode** switch at the top-right to run with mock simulation or live API calls.
4. Input a URL (e.g. `https://news.ycombinator.com`) and click **Generate Campaign**.
5. Watch the timeline update and view logs in the terminal viewer. Once complete, download the graphic and copy the social copy.

### Option B: The CLI Tool
Run the pipeline directly from your shell:
```bash
# Run in sandbox mode (does not require API keys)
node cli.js https://news.ycombinator.com --mock

# Run in production mode (requires .env configuration)
node cli.js https://github.com
```

Output files will be saved in the `outputs/campaign_[timestamp]/` folder, and the console will output the paths.

---

## 🛡️ Resiliency & Error Handling Matrix

| Failure Mode | Impacted Step | Automatic Mitigation Strategy |
| :--- | :--- | :--- |
| **Cloudflare / HTTP 403 Block** | Scraping | Switches to **Metadata Extractor** to pull Title/OG Tags, then uses **Domain Inference** to construct a brand context profile. |
| **API Request Timeout** | LLM / Graphic | REST fetches enforce a **12-second timeout** via `AbortController`. If triggered, it retries or shifts to a fallback generator. |
| **LLM Key Rate Limited** | Synthesis | Returns a structured copywriting template generated from page heuristics so the pipeline can proceed. |
| **Image Generator Key Error** | Graphic | Contacts **Unsplash Photo API** using keywords extracted by the LLM. |
| **Network Offline / No Internet** | Image Fallback | Backend compiles a custom **glowing SVG vector graphic** containing the brand name, tone, and formatted caption. |
