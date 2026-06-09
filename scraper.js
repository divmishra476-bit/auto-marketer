import axios from 'axios';
import * as cheerio from 'cheerio';
import { URL } from 'url';

/**
 * Resilient scraping utility.
 * Mimics desktop headers, cleans content, handles timeouts, and implements fallbacks for blocked requests.
 */
export async function scrapeUrl(targetUrl) {
  const logs = [];
  const addLog = (message, type = 'info') => {
    const logEntry = { timestamp: new Date().toISOString(), type, message };
    logs.push(logEntry);
    console.log(`[SCRAPER] [${type.toUpperCase()}] ${message}`);
  };

  addLog(`Starting scrape for URL: ${targetUrl}`);

  // Validate URL structure
  let parsedUrl;
  try {
    parsedUrl = new URL(targetUrl);
  } catch (err) {
    addLog(`Invalid URL format: ${targetUrl}`, 'error');
    throw new Error(`Invalid URL format: ${targetUrl}`);
  }

  const domain = parsedUrl.hostname;
  const brandName = domain.replace('www.', '').split('.')[0];
  
  // Set of headers to mimic a normal browser request
  const browserHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'Referer': 'https://www.google.com/',
    'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"Windows"',
    'Upgrade-Insecure-Requests': '1'
  };

  let htmlContent = '';
  let statusCode = null;

  try {
    addLog(`Attempting standard HTTP request...`);
    const response = await axios.get(targetUrl, {
      headers: browserHeaders,
      timeout: 12000, // 12s timeout
      maxRedirects: 5,
      validateStatus: (status) => status < 500 // Accept 4xx errors to handle them with fallbacks
    });
    
    statusCode = response.status;
    htmlContent = response.data;
    addLog(`Received response with HTTP status: ${statusCode}`);

    if (statusCode >= 400) {
      addLog(`HTTP status is an error (${statusCode}). Shifting to fallback strategies.`, 'warn');
    }
  } catch (error) {
    addLog(`HTTP request failed: ${error.message}. Shifting to fallback strategies.`, 'warn');
  }

  // Fallback 1: If standard request failed or returned error, try a simpler request with standard user-agent
  if (!htmlContent || statusCode >= 400) {
    try {
      addLog(`Fallback 1: Attempting simple GET request with standard client...`);
      const response = await axios.get(targetUrl, {
        timeout: 8000,
        validateStatus: (status) => status < 500
      });
      statusCode = response.status;
      htmlContent = response.data;
      addLog(`Fallback 1 successful. Status: ${statusCode}`);
    } catch (error) {
      addLog(`Fallback 1 failed: ${error.message}`, 'warn');
    }
  }

  // Parse HTML
  let title = brandName;
  let description = '';
  let keywords = '';
  let textContent = '';
  let metaTagsFound = {};

  if (htmlContent) {
    try {
      addLog(`Parsing HTML content...`);
      const $ = cheerio.load(htmlContent);

      // Extract metadata (very reliable, usually not blocked even if full JS fails)
      title = $('title').text().trim() || $('meta[property="og:title"]').attr('content') || brandName;
      description = $('meta[name="description"]').attr('content') || $('meta[property="og:description"]').attr('content') || '';
      keywords = $('meta[name="keywords"]').attr('content') || '';
      
      metaTagsFound = {
        title,
        description,
        keywords,
        ogTitle: $('meta[property="og:title"]').attr('content') || '',
        ogDescription: $('meta[property="og:description"]').attr('content') || '',
        ogSiteName: $('meta[property="og:site_name"]').attr('content') || ''
      };

      // Clean the HTML from unnecessary elements
      $('script').remove();
      $('style').remove();
      $('noscript').remove();
      $('iframe').remove();
      $('svg').remove();
      $('header').remove();
      $('footer').remove();
      $('nav').remove();
      $('aside').remove();

      // Extract text content from main layout tags
      const textBlocks = [];
      
      // Look in semantic areas first
      const semanticTags = ['main', 'article', 'section', '.content', '#content', '.main'];
      semanticTags.forEach(selector => {
        $(selector).find('h1, h2, h3, p, li').each((_, elem) => {
          const text = $(elem).text().trim();
          if (text && !textBlocks.includes(text)) {
            textBlocks.push(text);
          }
        });
      });

      // If semantic areas are empty, scan the whole body
      if (textBlocks.length === 0) {
        $('h1, h2, h3, p, li').each((_, elem) => {
          const text = $(elem).text().trim();
          if (text && !textBlocks.includes(text)) {
            textBlocks.push(text);
          }
        });
      }

      // If still empty, grab any body text
      if (textBlocks.length === 0) {
        const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
        if (bodyText) textBlocks.push(bodyText);
      }

      textContent = textBlocks.join('\n').trim();
      addLog(`Successfully extracted raw text of length: ${textContent.length} characters.`);
    } catch (parseError) {
      addLog(`Failed to parse HTML: ${parseError.message}`, 'error');
    }
  }

  // Fallback 2: If we couldn't get any content, or the content is extremely sparse (<150 chars)
  if (!textContent || textContent.length < 150) {
    addLog(`Extracted text is empty or too short. Activating Metadata and Brand Inference fallbacks...`, 'warn');
    
    let fallbackText = `Brand: ${brandName.toUpperCase()}\n`;
    fallbackText += `Website domain: ${domain}\n`;
    
    if (metaTagsFound.title && metaTagsFound.title !== brandName) {
      fallbackText += `Site Title: ${metaTagsFound.title}\n`;
    }
    if (metaTagsFound.description) {
      fallbackText += `Site Description: ${metaTagsFound.description}\n`;
    }
    if (metaTagsFound.ogDescription) {
      fallbackText += `Social Description: ${metaTagsFound.ogDescription}\n`;
    }
    if (metaTagsFound.keywords) {
      fallbackText += `Keywords: ${metaTagsFound.keywords}\n`;
    }
    
    // Add generic domain-based details to help LLM construct context
    fallbackText += `\nContext Inference:\n`;
    fallbackText += `The user wants to generate a marketing campaign for the brand "${brandName}" (website: ${targetUrl}). `;
    
    if (domain.endsWith('.org')) {
      fallbackText += `This appears to be a non-profit, educational, or community organization. `;
    } else if (domain.endsWith('.gov')) {
      fallbackText += `This is a government or public sector portal. `;
    } else if (domain.endsWith('.edu')) {
      fallbackText += `This is an educational institution or academic service. `;
    } else if (domain.includes('shop') || domain.includes('store') || domain.includes('cart')) {
      fallbackText += `This is likely an e-commerce storefront selling consumer goods. `;
    } else if (domain.includes('tech') || domain.includes('io') || domain.includes('app')) {
      fallbackText += `This appears to be a technology startup, SaaS application, or software development service. `;
    } else {
      fallbackText += `This is a commercial or business web portal. `;
    }

    textContent = fallbackText;
    addLog(`Constructed fallback inference profile of length: ${textContent.length} characters.`);
  }

  // Truncate to avoid overloading token limits (approx 10,000 characters is plenty for marketing tone)
  const maxChars = 12000;
  if (textContent.length > maxChars) {
    addLog(`Truncating text content from ${textContent.length} to ${maxChars} characters.`);
    textContent = textContent.substring(0, maxChars) + '... [truncated]';
  }

  return {
    url: targetUrl,
    domain,
    brandName: brandName.charAt(0).toUpperCase() + brandName.slice(1),
    title: title || brandName,
    description: description || '',
    scrapedText: textContent,
    metadata: metaTagsFound,
    logs
  };
}
