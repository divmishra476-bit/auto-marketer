import axios from 'axios';
import fs from 'fs';
import path from 'path';

/**
 * AI Orchestration Service
 * Handles LLM text generation and image API calling with strict timeouts, fallbacks, and a Mock Mode.
 */

// Helper to make API calls with a timeout
async function fetchWithTimeout(url, options, timeoutMs = 15000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(id);
    return response;
  } catch (error) {
    clearTimeout(id);
    throw error;
  }
}

/**
 * 1. Synthesize Caption and Translate Prompt
 * Uses the selected LLM (or mock) to analyze text and generate JSON with:
 * - caption (2 sentences)
 * - brandTone (tone analysis)
 * - imagePrompt (highly detailed graphic generation prompt)
 * - keywords (extracted tags)
 */
export async function generateMarketingData({ scrapedText, brandName, apiProvider, apiKey, isMock = false }) {
  const logs = [];
  const addLog = (message, type = 'info') => {
    logs.push({ timestamp: new Date().toISOString(), type, message });
    console.log(`[AI-TEXT] [${type.toUpperCase()}] ${message}`);
  };

  addLog(`Requesting marketing content generation... Provider: ${isMock ? 'Mock' : apiProvider}`);

  if (isMock || !apiKey) {
    if (!isMock && !apiKey) {
      addLog(`No API key provided. Falling back to Mock Mode.`, 'warn');
    }
    
    // Simulate latency
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    const mockCaptions = [
      `Elevate your daily operations with ${brandName}'s seamless automation suite. Designed for modern teams, we streamline your workflow so you can focus on building what matters.`,
      `Experience the future of digital efficiency with ${brandName}. Our intelligence-driven platform adapts to your unique challenges, delivering measurable growth in real time.`,
      `Unlock your true potential using ${brandName}'s state-of-the-art developer ecosystems. Join thousands of high-performing teams who trust us to secure and scale their infrastructure.`
    ];
    
    const mockTones = ["Innovative & Futuristic", "Professional & Secure", "Empowering & Modern"];
    const mockPrompts = [
      `A premium commercial graphic for ${brandName}. A modern workspace with abstract floating holographic widgets and graphs glowing in neon teal and violet, clean glassmorphism interface panels, soft studio lighting, cinematic, 8k resolution, minimalist style.`,
      `A sleek, professional editorial graphic showcasing a high-tech corporate interface. A secure glowing network shield hovering over a sleek metallic laptop, dark mode setting with warm amber accents, highly detailed, photorealistic, 4k.`,
      `A vibrant developer-centric graphic. Abstract glowing lines of code transforming into a rocket ship launching from a clean tablet screen, deep blue and orange color scheme, modern vector design, clean corporate branding.`
    ];

    const idx = Math.floor(Math.random() * mockCaptions.length);
    const result = {
      caption: mockCaptions[idx],
      brandTone: mockTones[idx],
      imagePrompt: mockPrompts[idx],
      keywords: [brandName.toLowerCase(), "marketing", "technology", "growth"]
    };

    addLog(`Mock campaign details generated successfully.`);
    return { data: result, logs };
  }

  const systemPrompt = `You are a professional marketing director and copywriting expert.
Analyze the provided scraped website text and return a JSON object with:
1. "caption": A highly engaging, punchy, 2-sentence marketing caption suitable for social media.
2. "brandTone": A brief summary of the brand's tone of voice (e.g., "Playful & Dynamic", "Secure & Corporate").
3. "imagePrompt": A highly detailed and descriptive image generation prompt designed for Stable Diffusion/Flux. It should describe a clean, professional, premium marketing graphic or conceptual photo that embodies the brand's tone and message. Avoid text overlays in the image prompt, and focus on style, visual elements, layout, color palette, and lighting.
4. "keywords": 3-4 relevant marketing keywords/tags.

Response MUST be strictly valid JSON. Do not wrap in markdown code blocks.`;

  const userPrompt = `Brand Name: ${brandName}
Scraped Website Content:
---
${scrapedText}
---`;

  try {
    if (apiProvider === 'groq') {
      addLog(`Calling Groq API...`);
      const response = await fetchWithTimeout('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.7,
          response_format: { type: 'json_object' }
        })
      }, 15000);

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Groq API returned ${response.status}: ${errText}`);
      }

      const json = await response.json();
      const rawContent = json.choices[0].message.content;
      const data = JSON.parse(rawContent);
      addLog(`Groq API completed successfully.`);
      return { data, logs };
    } 
    
    if (apiProvider === 'gemini') {
      addLog(`Calling Gemini API...`);
      // Use standard Gemini REST call structure
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
      const response = await fetchWithTimeout(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `${systemPrompt}\n\n${userPrompt}`
            }]
          }],
          generationConfig: {
            responseMimeType: 'application/json'
          }
        })
      }, 15000);

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Gemini API returned ${response.status}: ${errText}`);
      }

      const json = await response.json();
      const rawContent = json.candidates[0].content.parts[0].text;
      const data = JSON.parse(rawContent);
      addLog(`Gemini API completed successfully.`);
      return { data, logs };
    }

    if (apiProvider === 'openai') {
      addLog(`Calling OpenAI API...`);
      const response = await fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.7,
          response_format: { type: 'json_object' }
        })
      }, 15000);

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`OpenAI API returned ${response.status}: ${errText}`);
      }

      const json = await response.json();
      const rawContent = json.choices[0].message.content;
      const data = JSON.parse(rawContent);
      addLog(`OpenAI API completed successfully.`);
      return { data, logs };
    }

    throw new Error(`Unsupported API provider: ${apiProvider}`);
  } catch (error) {
    addLog(`LLM Text generation failed: ${error.message}. Attempting fallback parser...`, 'error');
    
    // Fallback: If JSON parsing or the API failed, build a simple regex parser or return a hardcoded/heuristic object
    const fallbackData = {
      caption: `Discover what makes ${brandName} unique. We deliver top-tier solutions tailored to help your team scale and succeed.`,
      brandTone: "Professional & Trustworthy",
      imagePrompt: `A professional commercial graphic for ${brandName}. A modern desk with subtle tech components, glowing network grids in deep blue and indigo, elegant business layout, photorealistic.`,
      keywords: [brandName.toLowerCase(), "business", "innovation"]
    };
    addLog(`Resilient Fallback: Generated heuristic marketing data.`, 'warn');
    return { data: fallbackData, logs };
  }
}

/**
 * 2. Generate Graphic
 * Takes an imagePrompt and contacts the selected API.
 * Includes fallbacks:
 * - Hugging Face Inference API
 * - Fal.ai
 * - OpenAI DALL-E
 * - Unsplash stock image lookup (Fallback 1)
 * - Custom SVG Graphic Generator (Fallback 2)
 */
export async function generateMarketingGraphic({ prompt, keywords, brandName, caption, apiProvider, apiKey, isMock = false }) {
  const logs = [];
  const addLog = (message, type = 'info') => {
    logs.push({ timestamp: new Date().toISOString(), type, message });
    console.log(`[AI-IMAGE] [${type.toUpperCase()}] ${message}`);
  };

  addLog(`Requesting image generation... Provider: ${isMock ? 'Mock' : apiProvider}`);

  // Build a rich search context from all available signals
  const searchKeyword = keywords && keywords.length > 0 ? keywords[0] : (brandName || 'business');
  // Use the full prompt as the diversity seed — it contains randomly varied content per run
  const diversitySeed = (prompt || '') + (brandName || '') + Date.now().toString().slice(-4);

  if (isMock || !apiKey) {
    if (!isMock && !apiKey) {
      addLog(`No image generator key provided. Falling back to stock image lookup.`, 'warn');
    }
    try {
      return await getUnsplashStockImage(searchKeyword, diversitySeed, addLog, logs);
    } catch (unsplashError) {
      addLog(`Unsplash lookup failed: ${unsplashError.message}. Shifting to SVG Generator...`, 'error');
      return generateSvgGraphic(brandName, caption, addLog, logs);
    }
  }

  try {
    if (apiProvider === 'huggingface') {
      addLog(`Calling Hugging Face Inference API (Model: FLUX.1-schnell)...`);
      const response = await fetch('https://api-inference.huggingface.co/models/black-forest-labs/FLUX.1-schnell', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ inputs: prompt })
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Hugging Face API returned ${response.status}: ${errText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      addLog(`Hugging Face Image generated successfully.`);
      return { buffer: Buffer.from(arrayBuffer), format: 'png', logs };
    }

    if (apiProvider === 'fal') {
      addLog(`Calling Fal.ai (Model: Flux Schnell)...`);
      const response = await fetchWithTimeout('https://queue.fal.run/fal-ai/flux/schnell', {
        method: 'POST',
        headers: {
          'Authorization': `Key ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ prompt: prompt, sync_mode: true })
      }, 20000);

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Fal.ai returned ${response.status}: ${errText}`);
      }

      const json = await response.json();
      if (!json.images || json.images.length === 0) {
        throw new Error('Fal.ai returned no images.');
      }

      const imageUrl = json.images[0].url;
      addLog(`Downloading image from Fal.ai URL: ${imageUrl}...`);
      const imgRes = await axios.get(imageUrl, { responseType: 'arraybuffer' });
      addLog(`Fal.ai Image downloaded successfully.`);
      return { buffer: Buffer.from(imgRes.data), format: 'png', logs };
    }

    if (apiProvider === 'openai') {
      addLog(`Calling OpenAI DALL-E API...`);
      const response = await fetchWithTimeout('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'dall-e-3',
          prompt: prompt,
          n: 1,
          size: '1024x1024'
        })
      }, 25000);

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`OpenAI DALL-E returned ${response.status}: ${errText}`);
      }

      const json = await response.json();
      const imageUrl = json.data[0].url;
      addLog(`Downloading image from DALL-E URL...`);
      const imgRes = await axios.get(imageUrl, { responseType: 'arraybuffer' });
      addLog(`DALL-E Image downloaded successfully.`);
      return { buffer: Buffer.from(imgRes.data), format: 'png', logs };
    }

    throw new Error(`Unsupported Image API Provider: ${apiProvider}`);

  } catch (error) {
    addLog(`Image generation API failed: ${error.message}. Shifting to Unsplash stock fallback...`, 'error');
    try {
      return await getUnsplashStockImage(searchKeyword, diversitySeed, addLog, logs);
    } catch (unsplashError) {
      addLog(`Unsplash fallback failed: ${unsplashError.message}. Shifting to SVG Generator...`, 'error');
      return generateSvgGraphic(brandName, caption, addLog, logs);
    }
  }
}

/**
 * Fallback 1: Get Unsplash Stock Image based on keywords
 */
async function getUnsplashStockImage(keyword, diversitySeed, addLog, logs) {
  addLog(`Querying Unsplash for keyword: "${keyword}"...`);

  // Large curated pool — 16 verified high-quality Unsplash photos covering different themes
  const photoPool = [
    { tags: ['tech','software','app','saas','startup'],         url: 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1024&q=80' },
    { tags: ['code','dev','developer','git','github','program'], url: 'https://images.unsplash.com/photo-1555066931-4365d14bab8c?auto=format&fit=crop&w=1024&q=80' },
    { tags: ['ai','ml','robot','neural','openai','chatgpt'],     url: 'https://images.unsplash.com/photo-1620712943543-bcc4688e7485?auto=format&fit=crop&w=1024&q=80' },
    { tags: ['news','media','press','journalist','blog'],        url: 'https://images.unsplash.com/photo-1504711434969-e33886168f5c?auto=format&fit=crop&w=1024&q=80' },
    { tags: ['shop','store','ecommerce','retail','product'],     url: 'https://images.unsplash.com/photo-1472851294608-062f824d29cc?auto=format&fit=crop&w=1024&q=80' },
    { tags: ['finance','bank','invest','money','stock','pay'],   url: 'https://images.unsplash.com/photo-1559526324-4b87b5e36e44?auto=format&fit=crop&w=1024&q=80' },
    { tags: ['design','art','creative','ui','ux','graphic'],     url: 'https://images.unsplash.com/photo-1507238691740-187a5b1d37b8?auto=format&fit=crop&w=1024&q=80' },
    { tags: ['analytics','data','chart','dashboard','report'],   url: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=1024&q=80' },
    { tags: ['marketing','growth','brand','advertis','campaign'],url: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=1024&q=80' },
    { tags: ['wiki','learn','education','knowledge','encyclop'], url: 'https://images.unsplash.com/photo-1506880018603-83d5b814b5a6?auto=format&fit=crop&w=1024&q=80' },
    { tags: ['social','network','community','connect','twitter'],url: 'https://images.unsplash.com/photo-1432888622747-4eb9a8efeb07?auto=format&fit=crop&w=1024&q=80' },
    { tags: ['team','office','work','meeting','business','corp'],url: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=1024&q=80' },
    { tags: ['space','launch','rocket','future','holograph'],    url: 'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&w=1024&q=80' },
    { tags: ['strategy','plan','idea','innovation','vision'],    url: 'https://images.unsplash.com/photo-1531403009284-440f080d1e12?auto=format&fit=crop&w=1024&q=80' },
    { tags: ['laptop','remote','freelance','workspace','desk'],  url: 'https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=1024&q=80' },
    { tags: ['security','shield','cyber','protect','network'],   url: 'https://images.unsplash.com/photo-1563986768494-4dee2763ff3f?auto=format&fit=crop&w=1024&q=80' },
  ];

  // Score every photo against combined keyword + seed text
  const lowerKeyword = keyword.toLowerCase();
  const lowerSeed = (diversitySeed || '').toLowerCase();
  const combinedText = lowerKeyword + ' ' + lowerSeed;

  const scored = photoPool.map(photo => ({
    url: photo.url,
    score: photo.tags.filter(tag => combinedText.includes(tag)).length
  }));

  // Stable seed hash for tie-breaking (same brand → consistent ordering)
  const seedHash = Array.from(diversitySeed || keyword)
    .reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) & 0xFFFFFF, 7);

  if (scored.some(s => s.score > 0)) {
    // Sort by best match first
    scored.sort((a, b) => b.score - a.score);
    addLog(`Best theme match score: ${scored[0].score}. Trying themed images in order.`);
  } else {
    // No tag matched — rotate pool by seed offset so different brands get different images
    addLog(`No theme tag matched. Rotating pool by seed for variety.`);
    const offset = Math.abs(seedHash) % scored.length;
    const rotated = [...scored.slice(offset), ...scored.slice(0, offset)];
    scored.length = 0;
    rotated.forEach(s => scored.push(s));
  }

  // Try each URL in order — automatically skip any that 404 or timeout
  for (const entry of scored) {
    try {
      const imgRes = await axios.get(entry.url, {
        responseType: 'arraybuffer',
        timeout: 8000,
        validateStatus: s => s === 200
      });
      addLog(`Successfully loaded Unsplash stock photo.`);
      return { buffer: Buffer.from(imgRes.data), format: 'jpg', logs };
    } catch (_) {
      addLog(`Photo URL failed (${entry.url.split('/').pop().split('?')[0]}), trying next...`, 'warn');
    }
  }

  throw new Error('All Unsplash pool URLs failed — escalating to SVG fallback.');
}

/**
 * Fallback 2: Generate an SVG Graphic locally when offline / all APIs fail
 */
function generateSvgGraphic(brandName, caption, addLog, logs) {
  addLog(`Generating emergency SVG graphic...`);
  
  // Format caption to fit in SVG
  const words = caption.split(' ');
  const lines = [];
  let currentLine = '';
  
  words.forEach(word => {
    if ((currentLine + ' ' + word).length > 40) {
      lines.push(currentLine.trim());
      currentLine = word;
    } else {
      currentLine += ' ' + word;
    }
  });
  if (currentLine) lines.push(currentLine.trim());
  
  // Create beautiful SVG with gradient
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800" width="800" height="800">
    <defs>
      <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style="stop-color:#3b82f6;stop-opacity:1" />
        <stop offset="50%" style="stop-color:#8b5cf6;stop-opacity:1" />
        <stop offset="100%" style="stop-color:#ec4899;stop-opacity:1" />
      </linearGradient>
      <filter id="shadow">
        <feDropShadow dx="0" dy="4" stdDeviation="6" flood-opacity="0.3"/>
      </filter>
    </defs>
    
    <!-- Background -->
    <rect width="800" height="800" fill="url(#grad)" />
    
    <!-- Abstract Design Grid -->
    <circle cx="200" cy="200" r="300" fill="white" opacity="0.05" />
    <circle cx="700" cy="600" r="250" fill="white" opacity="0.03" />
    <rect x="50" y="50" width="700" height="700" rx="20" fill="none" stroke="white" stroke-width="2" opacity="0.1" />

    <!-- Brand Card -->
    <g transform="translate(100, 150)">
      <!-- Glassmorphic backplate -->
      <rect width="600" height="500" rx="24" fill="white" fill-opacity="0.1" stroke="white" stroke-opacity="0.2" filter="url(#shadow)" />
      
      <!-- Brand Name -->
      <text x="300" y="80" font-family="'Inter', system-ui, sans-serif" font-size="36" font-weight="bold" fill="white" text-anchor="middle" letter-spacing="2">
        ${brandName.toUpperCase()}
      </text>
      
      <line x1="150" y1="120" x2="450" y2="120" stroke="white" stroke-width="2" opacity="0.3" />
      
      <!-- Text Lines -->
      <g transform="translate(300, 190)">
        ${lines.map((line, idx) => `
          <text y="${idx * 40}" font-family="'Inter', system-ui, sans-serif" font-size="22" fill="#f3f4f6" text-anchor="middle" font-style="italic">
            "${line}"
          </text>
        `).join('')}
      </g>
      
      <!-- Footer tag -->
      <rect x="220" y="400" width="160" height="40" rx="20" fill="white" fill-opacity="0.2" />
      <text x="300" y="425" font-family="'Inter', system-ui, sans-serif" font-size="14" font-weight="bold" fill="white" text-anchor="middle">
        MARKETING CAMPAIGN
      </text>
    </g>
  </svg>`;

  addLog(`SVG graphic compiled successfully.`);
  return { buffer: Buffer.from(svg), format: 'svg', logs };
}
