/**
 * ============================================================================
 * 🚀 AUTO-MARKETER: AI ORCHESTRATION PIPELINE (CLI Entrypoint)
 * ============================================================================
 * 
 * DESCRIPTION:
 * This script automates marketing campaign generation from a single URL input.
 * It chains multiple services: scraping content, synthesizing copy, 
 * translating tone to image prompts, and rendering assets.
 * 
 * LOGICAL PIPELINE ARCHITECTURE:
 * 1. Scrape: Extracts text with user-agent spoofing (Cheerio).
 *    - Fallback 1: Extract title, description & OpenGraph metadata if blocked (403/401).
 *    - Fallback 2: Domain-name analysis if standard extraction is empty.
 * 2. Synthesis (LLM): Synthesizes brand tone, caption, and graphic prompt.
 *    - Orchestrates Groq, Gemini, or OpenAI API based on env configuration.
 *    - Fallback: Pre-mapped sandbox mock synthesizer if no keys are provided.
 * 3. Image Generation: Creates ad graphics.
 *    - Orchestrates Hugging Face Inference, Fal.ai, or OpenAI DALL-E.
 *    - Fallback 1: Keyword-matching stock image lookup via Unsplash.
 *      - Fix: Curated 16-theme tag matching with seed-hash rotation & sequential retry.
 *    - Fallback 2: Emergency local SVG gradient canvas builder if offline.
 * 4. Local Archiving: Saves outputs (caption, prompt, graphic, JSON meta) in outputs/.
 * ============================================================================
 */

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

import { scrapeUrl } from './scraper.js';
import { generateMarketingData, generateMarketingGraphic } from './ai.js';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper for colorful console output (ANSI escape codes)
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m'
};

function printBanner() {
  console.log(`${colors.cyan}${colors.bright}`);
  console.log(`========================================================`);
  console.log(`        🔥 AUTO-MARKETER CAMPAIGN GENERATOR 🔥         `);
  console.log(`========================================================${colors.reset}`);
}

async function runCli() {
  printBanner();

  const args = process.argv.slice(2);
  const urlArg = args.find(arg => arg.startsWith('http://') || arg.startsWith('https://'));
  const isMockArg = args.includes('--mock');

  if (!urlArg) {
    console.log(`${colors.yellow}Usage:${colors.reset}`);
    console.log(`  node cli.js <URL> [options]`);
    console.log(`  npm run cli -- <URL> [options]\n`);
    console.log(`${colors.yellow}Options:${colors.reset}`);
    console.log(`  --mock        Force run in Mock/Sandbox mode (no API keys required)\n`);
    console.log(`${colors.yellow}Example:${colors.reset}`);
    console.log(`  node cli.js https://news.ycombinator.com\n`);
    process.exit(1);
  }

  const targetUrl = urlArg;
  
  // Detect available API keys in environment
  const groqKey = process.env.GROQ_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  const hfKey = process.env.HF_API_KEY;
  const falKey = process.env.FAL_KEY;

  let textProvider = 'groq';
  let textKey = groqKey;
  let imageProvider = 'huggingface';
  let imageKey = hfKey;

  // Autodetect best configured provider
  if (!textKey) {
    if (geminiKey) { textProvider = 'gemini'; textKey = geminiKey; }
    else if (openaiKey) { textProvider = 'openai'; textKey = openaiKey; }
  }
  if (!imageKey) {
    if (falKey) { imageProvider = 'fal'; imageKey = falKey; }
    else if (openaiKey) { imageProvider = 'openai'; imageKey = openaiKey; }
  }

  let isMock = isMockArg;
  if (!isMock && (!textKey || !imageKey)) {
    console.log(`${colors.yellow}Warning: Missing text LLM or Image API keys in .env.${colors.reset}`);
    console.log(`${colors.yellow}Automatically routing pipeline via Mock / Sandbox Mode.${colors.reset}`);
    console.log(`(Configure .env file to run with live LLM and Graphic APIs)\n`);
    isMock = true;
  }

  console.log(`${colors.cyan}🚀 Initializing pipeline for:${colors.reset} ${targetUrl}`);
  console.log(`${colors.cyan}⚙️  Config: LLM=${isMock ? 'Mock' : textProvider.toUpperCase()} | ImageGen=${isMock ? 'Mock/Unsplash' : imageProvider.toUpperCase()}\n`);

  try {
    // 1. Scraping Step
    console.log(`${colors.bright}[1/4] Scraping Website Content...${colors.reset}`);
    const scrapeResult = await scrapeUrl(targetUrl);
    console.log(`${colors.green}✔ Scrape Complete! Brand inferred: ${scrapeResult.brandName}${colors.reset}\n`);

    // 2. Synthesis Step
    console.log(`${colors.bright}[2/4] Synthesizing Marketing Caption & Brand Tone...${colors.reset}`);
    const textResult = await generateMarketingData({
      scrapedText: scrapeResult.scrapedText,
      brandName: scrapeResult.brandName,
      apiProvider: textProvider,
      apiKey: textKey,
      isMock: isMock
    });
    const campaignData = textResult.data;
    console.log(`${colors.green}✔ Brand Tone: ${campaignData.brandTone}${colors.reset}`);
    console.log(`${colors.green}✔ Generated Caption: ${colors.reset}${campaignData.caption}\n`);

    // 3. Image Generation Step
    console.log(`${colors.bright}[3/4] Translating Tone & Generating Marketing Graphic...${colors.reset}`);
    console.log(`${colors.cyan}Prompt:${colors.reset} ${campaignData.imagePrompt}`);
    const graphicResult = await generateMarketingGraphic({
      prompt: campaignData.imagePrompt,
      keywords: campaignData.keywords,
      brandName: scrapeResult.brandName,
      caption: campaignData.caption,
      apiProvider: imageProvider,
      apiKey: imageKey,
      isMock: isMock
    });
    console.log(`${colors.green}✔ Graphic generation complete (format: ${graphicResult.format}).${colors.reset}\n`);

    // 4. Save locally
    console.log(`${colors.bright}[4/4] Writing Campaign files to disk...${colors.reset}`);
    const outputsDir = path.join(__dirname, 'outputs');
    if (!fs.existsSync(outputsDir)) {
      fs.mkdirSync(outputsDir, { recursive: true });
    }

    const timestamp = Date.now();
    const campaignId = `campaign_${timestamp}`;
    const campaignFolder = path.join(outputsDir, campaignId);
    fs.mkdirSync(campaignFolder, { recursive: true });

    // Save individual parts
    const captionPath = path.join(campaignFolder, 'caption.txt');
    const promptPath = path.join(campaignFolder, 'prompt.txt');
    const imageFilename = `graphic.${graphicResult.format}`;
    const imagePath = path.join(campaignFolder, imageFilename);
    const metadataPath = path.join(campaignFolder, 'metadata.json');

    fs.writeFileSync(captionPath, campaignData.caption, 'utf8');
    fs.writeFileSync(promptPath, campaignData.imagePrompt, 'utf8');
    fs.writeFileSync(imagePath, graphicResult.buffer);

    const metadata = {
      id: campaignId,
      timestamp,
      url: targetUrl,
      brandName: scrapeResult.brandName,
      brandTone: campaignData.brandTone,
      caption: campaignData.caption,
      imagePrompt: campaignData.imagePrompt,
      keywords: campaignData.keywords,
      imageFile: `/outputs/${campaignId}/${imageFilename}`
    };

    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), 'utf8');

    console.log(`${colors.green}${colors.bright}✔ Success! Campaign created!${colors.reset}`);
    console.log(`📂 Saved Folder: ${campaignFolder}`);
    console.log(`📄 Caption:      ${captionPath}`);
    console.log(`🎨 Image:        ${imagePath}`);
    console.log(`⚙️  Metadata:     ${metadataPath}`);
    console.log(`\n========================================================`);

  } catch (error) {
    console.error(`\n${colors.red}❌ Pipeline failed: ${error.message}${colors.reset}`);
    process.exit(1);
  }
}

runCli();
