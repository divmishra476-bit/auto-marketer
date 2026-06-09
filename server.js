import express from 'express';
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

const app = express();
const PORT = process.env.PORT || 3000;

// Enable JSON body parsing
app.use(express.json());

// Serve static frontend files
app.use(express.static(path.join(__dirname, 'public')));

// Ensure outputs and public folders exist
const outputsDir = path.join(__dirname, 'outputs');
if (!fs.existsSync(outputsDir)) {
  fs.mkdirSync(outputsDir, { recursive: true });
}

// Serve outputs static folder so frontend can load generated graphics
app.use('/outputs', express.static(outputsDir));

/**
 * Run Auto-Marketer Pipeline
 * POST /api/generate
 * Payload: { url, textProvider, textKey, imageProvider, imageKey, isMock }
 */
app.post('/api/generate', async (req, res) => {
  const { url, textProvider, textKey, imageProvider, imageKey, isMock } = req.body;
  const pipelineLogs = [];

  const addPipelineLog = (moduleName, message, type = 'info') => {
    const log = {
      timestamp: new Date().toISOString(),
      module: moduleName,
      type,
      message
    };
    pipelineLogs.push(log);
    console.log(`[PIPELINE] [${moduleName.toUpperCase()}] [${type.toUpperCase()}] ${message}`);
  };

  if (!url) {
    return res.status(400).json({ error: 'URL is required.' });
  }

  addPipelineLog('system', `Pipeline initialized for URL: ${url}`);

  try {
    // 1. Scraping Step
    addPipelineLog('scraper', 'Initializing page extraction...');
    let scrapeResult;
    try {
      scrapeResult = await scrapeUrl(url);
      scrapeResult.logs.forEach(l => addPipelineLog('scraper', l.message, l.type));
    } catch (scrapeErr) {
      addPipelineLog('scraper', `Extraction crashed: ${scrapeErr.message}. Aborting.`, 'error');
      return res.status(500).json({ error: `Scraping failed: ${scrapeErr.message}`, logs: pipelineLogs });
    }

    // 2. Synthesis & Prompt Translation Step
    addPipelineLog('llm', 'Initializing brand analysis & marketing synthesis...');
    let textResult;
    try {
      // Use env key as fallback if user key isn't provided
      const finalTextKey = textKey || (
        textProvider === 'groq' ? process.env.GROQ_API_KEY :
        textProvider === 'gemini' ? process.env.GEMINI_API_KEY :
        textProvider === 'openai' ? process.env.OPENAI_API_KEY : null
      );
      
      textResult = await generateMarketingData({
        scrapedText: scrapeResult.scrapedText,
        brandName: scrapeResult.brandName,
        apiProvider: textProvider,
        apiKey: finalTextKey,
        isMock: isMock
      });
      textResult.logs.forEach(l => addPipelineLog('llm', l.message, l.type));
    } catch (textErr) {
      addPipelineLog('llm', `Synthesis crashed: ${textErr.message}`, 'error');
      return res.status(500).json({ error: `Synthesis failed: ${textErr.message}`, logs: pipelineLogs });
    }

    const campaignData = textResult.data;

    // 3. Image Generation Step
    addPipelineLog('image', 'Initializing marketing graphic generation...');
    let graphicResult;
    try {
      const finalImageKey = imageKey || (
        imageProvider === 'huggingface' ? process.env.HF_API_KEY :
        imageProvider === 'fal' ? process.env.FAL_KEY :
        imageProvider === 'openai' ? process.env.OPENAI_API_KEY : null
      );

      graphicResult = await generateMarketingGraphic({
        prompt: campaignData.imagePrompt,
        keywords: campaignData.keywords,
        brandName: scrapeResult.brandName,
        caption: campaignData.caption,
        apiProvider: imageProvider,
        apiKey: finalImageKey,
        isMock: isMock
      });
      graphicResult.logs.forEach(l => addPipelineLog('image', l.message, l.type));
    } catch (imgErr) {
      addPipelineLog('image', `Graphic generation crashed: ${imgErr.message}`, 'error');
      return res.status(500).json({ error: `Graphic generation failed: ${imgErr.message}`, logs: pipelineLogs });
    }

    // 4. Save locally
    addPipelineLog('storage', 'Saving campaign components locally...');
    const timestamp = Date.now();
    const campaignId = `campaign_${timestamp}`;
    const campaignFolder = path.join(outputsDir, campaignId);
    fs.mkdirSync(campaignFolder, { recursive: true });

    // Save individual parts
    fs.writeFileSync(path.join(campaignFolder, 'caption.txt'), campaignData.caption, 'utf8');
    fs.writeFileSync(path.join(campaignFolder, 'prompt.txt'), campaignData.imagePrompt, 'utf8');
    
    // Save image
    const imageFilename = `graphic.${graphicResult.format}`;
    fs.writeFileSync(path.join(campaignFolder, imageFilename), graphicResult.buffer);
    
    // Save metadata
    const metadata = {
      id: campaignId,
      timestamp,
      url,
      brandName: scrapeResult.brandName,
      brandTone: campaignData.brandTone,
      caption: campaignData.caption,
      imagePrompt: campaignData.imagePrompt,
      keywords: campaignData.keywords,
      imageFile: `/outputs/${campaignId}/${imageFilename}`,
      logs: pipelineLogs
    };
    
    fs.writeFileSync(
      path.join(campaignFolder, 'metadata.json'), 
      JSON.stringify(metadata, null, 2), 
      'utf8'
    );

    addPipelineLog('system', `Campaign created successfully! ID: ${campaignId}`);

    res.json({
      success: true,
      campaignId,
      metadata,
      logs: pipelineLogs
    });

  } catch (err) {
    addPipelineLog('system', `Fatal pipeline error: ${err.message}`, 'error');
    res.status(500).json({ error: `Fatal pipeline crash: ${err.message}`, logs: pipelineLogs });
  }
});

/**
 * Fetch Campaign History
 * GET /api/campaigns
 */
app.get('/api/campaigns', (req, res) => {
  try {
    if (!fs.existsSync(outputsDir)) {
      return res.json([]);
    }
    
    const folders = fs.readdirSync(outputsDir);
    const campaigns = [];
    
    folders.forEach(folder => {
      const metadataPath = path.join(outputsDir, folder, 'metadata.json');
      if (fs.existsSync(metadataPath)) {
        try {
          const content = fs.readFileSync(metadataPath, 'utf8');
          campaigns.push(JSON.parse(content));
        } catch (e) {
          console.error(`Failed to parse metadata in folder ${folder}: ${e.message}`);
        }
      }
    });

    // Sort newest first
    campaigns.sort((a, b) => b.timestamp - a.timestamp);
    res.json(campaigns);
  } catch (error) {
    res.status(500).json({ error: `Failed to load campaign list: ${error.message}` });
  }
});

// Start Express Server
app.listen(PORT, () => {
  console.log(`========================================================`);
  console.log(`  🚀 Auto-Marketer Dashboard running on http://localhost:${PORT}`);
  console.log(`  💾 Output Directory: ${outputsDir}`);
  console.log(`========================================================`);
});
