/**
 * Auto-Marketer Dashboard State Controller
 */

document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const mockToggle = document.getElementById('mock-toggle');
  const mockStatusText = document.getElementById('mock-status-text');
  
  const pipelineForm = document.getElementById('pipeline-form');
  const targetUrlInput = document.getElementById('target-url');
  const btnGenerate = document.getElementById('btn-generate');
  
  // API settings inputs
  const textProviderSelect = document.getElementById('text-provider');
  const textKeyInput = document.getElementById('text-key');
  const imageProviderSelect = document.getElementById('image-provider');
  const imageKeyInput = document.getElementById('image-key');
  
  // Pipeline steps
  const steps = {
    scrape: document.getElementById('step-scrape'),
    synthesis: document.getElementById('step-synthesis'),
    translate: document.getElementById('step-translate'),
    vision: document.getElementById('step-vision')
  };

  // Logs terminal
  const logsList = document.getElementById('logs-list');
  const btnClearLogs = document.getElementById('btn-clear-logs');
  
  // Output panels
  const outputEmpty = document.getElementById('output-empty');
  const outputLoading = document.getElementById('output-loading');
  const outputContent = document.getElementById('output-content');
  
  // Result elements
  const resultBrand = document.getElementById('result-brand');
  const resultTone = document.getElementById('result-tone');
  const resultDownload = document.getElementById('result-download');
  const resultGraphic = document.getElementById('result-graphic');
  const resultFormatBadge = document.getElementById('result-format-badge');
  const resultCaption = document.getElementById('result-caption');
  const resultPrompt = document.getElementById('result-prompt');
  const resultKeywords = document.getElementById('result-keywords');
  const resultPathFolder = document.getElementById('result-path-folder');
  const btnCopyCaption = document.getElementById('btn-copy-caption');
  
  // History
  const historyList = document.getElementById('history-list');
  const historyCount = document.getElementById('history-count');

  // Load API keys from localStorage on startup
  textProviderSelect.value = localStorage.getItem('auto_marketer_text_provider') || 'groq';
  textKeyInput.value = localStorage.getItem('auto_marketer_text_key') || '';
  imageProviderSelect.value = localStorage.getItem('auto_marketer_image_provider') || 'huggingface';
  imageKeyInput.value = localStorage.getItem('auto_marketer_image_key') || '';
  mockToggle.checked = localStorage.getItem('auto_marketer_is_mock') !== 'false'; // default to true

  // Initial UI state setup
  updateMockStatusText();
  loadCampaignHistory();

  // Save changes to localStorage
  textProviderSelect.addEventListener('change', () => {
    localStorage.setItem('auto_marketer_text_provider', textProviderSelect.value);
  });
  textKeyInput.addEventListener('input', () => {
    localStorage.setItem('auto_marketer_text_key', textKeyInput.value);
  });
  imageProviderSelect.addEventListener('change', () => {
    localStorage.setItem('auto_marketer_image_provider', imageProviderSelect.value);
  });
  imageKeyInput.addEventListener('input', () => {
    localStorage.setItem('auto_marketer_image_key', imageKeyInput.value);
  });
  
  mockToggle.addEventListener('change', () => {
    localStorage.setItem('auto_marketer_is_mock', mockToggle.checked);
    updateMockStatusText();
  });

  function updateMockStatusText() {
    if (mockToggle.checked) {
      mockStatusText.textContent = 'Sandbox / Mock Mode (Active)';
      mockStatusText.style.color = '#94a3b8';
    } else {
      mockStatusText.textContent = 'Live Production Mode';
      mockStatusText.style.color = '#6366f1';
    }
  }

  // Password toggle behavior
  document.querySelectorAll('.toggle-password').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const targetId = e.target.getAttribute('data-target');
      const input = document.getElementById(targetId);
      if (input.type === 'password') {
        input.type = 'text';
        e.target.textContent = '🙈';
      } else {
        input.type = 'password';
        e.target.textContent = '👁';
      }
    });
  });

  // Clear logs helper
  btnClearLogs.addEventListener('click', () => {
    logsList.innerHTML = `<div class="log-entry system">Terminal cleared. Ready.</div>`;
  });

  // Copy caption to clipboard helper
  btnCopyCaption.addEventListener('click', () => {
    const text = resultCaption.textContent.replace(/^"|"$/g, '');
    navigator.clipboard.writeText(text).then(() => {
      const originalText = btnCopyCaption.textContent;
      btnCopyCaption.textContent = 'Copied!';
      btnCopyCaption.style.borderColor = '#10b981';
      btnCopyCaption.style.color = '#10b981';
      setTimeout(() => {
        btnCopyCaption.textContent = originalText;
        btnCopyCaption.style.borderColor = '';
        btnCopyCaption.style.color = '';
      }, 2000);
    });
  });

  // Add terminal log line
  function appendLog(message, type = 'info', moduleName = 'system') {
    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    const timestamp = new Date().toLocaleTimeString();
    entry.textContent = `[${timestamp}] [${moduleName.toUpperCase()}] ${message}`;
    logsList.appendChild(entry);
    logsList.scrollTop = logsList.scrollHeight;
  }

  // Reset steps to pending
  function resetPipelineSteps() {
    Object.values(steps).forEach(step => {
      step.className = 'pipeline-step';
      step.querySelector('.step-status').textContent = 'Pending';
    });
  }

  // Update a single step status
  function updateStepStatus(stepKey, status) {
    const step = steps[stepKey];
    if (!step) return;

    step.className = `pipeline-step ${status}`;
    
    if (status === 'active') {
      step.querySelector('.step-status').textContent = 'Running...';
    } else if (status === 'completed') {
      step.querySelector('.step-status').textContent = 'Completed';
    } else if (status === 'failed') {
      step.querySelector('.step-status').textContent = 'Failed';
    } else {
      step.querySelector('.step-status').textContent = 'Pending';
    }
  }

  // Load history list from server
  async function loadCampaignHistory() {
    try {
      const res = await fetch('/api/campaigns');
      if (!res.ok) throw new Error('Failed to fetch history');
      const campaigns = await res.json();
      
      historyCount.textContent = campaigns.length;

      if (campaigns.length === 0) {
        historyList.innerHTML = '<div class="empty-state">No campaigns generated yet.</div>';
        return;
      }

      historyList.innerHTML = '';
      campaigns.forEach(c => {
        const item = document.createElement('div');
        item.className = 'history-item';
        item.dataset.id = c.id;
        
        const dateStr = new Date(c.timestamp).toLocaleString();
        item.innerHTML = `
          <h4>${escapeHtml(c.brandName)}</h4>
          <p>${escapeHtml(c.caption)}</p>
          <div class="item-meta">
            <span>${escapeHtml(c.brandTone)}</span>
            <span>${dateStr.split(',')[0]}</span>
          </div>
        `;
        
        item.addEventListener('click', () => {
          document.querySelectorAll('.history-item').forEach(el => el.classList.remove('active'));
          item.classList.add('active');
          displayCampaignResult(c);
        });
        
        historyList.appendChild(item);
      });
    } catch (err) {
      console.error(err);
    }
  }

  // Render campaign details to output panel
  function displayCampaignResult(campaign) {
    outputEmpty.classList.add('hidden');
    outputLoading.classList.add('hidden');
    outputContent.classList.remove('hidden');

    resultBrand.textContent = campaign.brandName;
    resultTone.textContent = campaign.brandTone;
    resultDownload.href = campaign.imageFile;
    resultGraphic.src = campaign.imageFile;
    
    // Determine extension
    const ext = campaign.imageFile.split('.').pop().toUpperCase();
    resultFormatBadge.textContent = ext;

    resultCaption.textContent = `"${campaign.caption}"`;
    resultPrompt.textContent = campaign.imagePrompt;
    resultPathFolder.textContent = `outputs/${campaign.id}/`;

    // Render keywords
    resultKeywords.innerHTML = '';
    const tags = campaign.keywords || [];
    tags.forEach(t => {
      const tag = document.createElement('span');
      tag.className = 'tag';
      tag.textContent = `#${t}`;
      resultKeywords.appendChild(tag);
    });
  }

  // Submit Form - Pipeline Core Execution
  pipelineForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const targetUrl = targetUrlInput.value.trim();
    if (!targetUrl) return;

    // Reset UI state
    resetPipelineSteps();
    outputEmpty.classList.add('hidden');
    outputContent.classList.add('hidden');
    outputLoading.classList.remove('hidden');
    btnGenerate.disabled = true;
    btnGenerate.textContent = 'Generating...';

    logsList.innerHTML = ''; // Reset terminal logs
    appendLog(`Pipeline launched for URL: ${targetUrl}`, 'system');

    // Simulate real-time progress transitions in UI
    updateStepStatus('scrape', 'active');
    appendLog('HTTP Scraper service activated...', 'info', 'scraper');
    
    const isMock = mockToggle.checked;
    const textProvider = textProviderSelect.value;
    const textKey = textKeyInput.value.trim();
    const imageProvider = imageProviderSelect.value;
    const imageKey = imageKeyInput.value.trim();

    // Trigger synthetic milestones while awaiting HTTP response
    let synthesisTimer = setTimeout(() => {
      updateStepStatus('scrape', 'completed');
      updateStepStatus('synthesis', 'active');
      appendLog('Synthesizing marketing summary & brand tone analysis...', 'info', 'llm');
    }, 2500);

    let translateTimer = setTimeout(() => {
      updateStepStatus('synthesis', 'completed');
      updateStepStatus('translate', 'active');
      appendLog('Translating brand voice into graphic prompt parameters...', 'info', 'llm');
    }, 5500);

    let visionTimer = setTimeout(() => {
      updateStepStatus('translate', 'completed');
      updateStepStatus('vision', 'active');
      appendLog('Vision rendering module processing graphic prompts...', 'info', 'image');
    }, 8000);

    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: targetUrl,
          textProvider,
          textKey,
          imageProvider,
          imageKey,
          isMock
        })
      });

      // Clear the step timing simulations
      clearTimeout(synthesisTimer);
      clearTimeout(translateTimer);
      clearTimeout(visionTimer);

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Server returned an error');
      }

      // Populate actual logs
      logsList.innerHTML = '';
      result.logs.forEach(l => {
        let type = 'info';
        if (l.type === 'warn') type = 'warn';
        if (l.type === 'error') type = 'error';
        if (l.message.includes('successfully') || l.message.includes('created')) type = 'success';
        appendLog(l.message, type, l.module);
      });

      // Update all steps to completed
      Object.keys(steps).forEach(key => updateStepStatus(key, 'completed'));
      
      appendLog(`Pipeline complete! Saved locally to outputs/${result.campaignId}`, 'success', 'system');

      // Display outputs
      displayCampaignResult(result.metadata);
      
      // Reload sidebar
      await loadCampaignHistory();

      // Highlight the generated item in history
      setTimeout(() => {
        const items = document.querySelectorAll('.history-item');
        if (items.length > 0) items[0].classList.add('active');
      }, 200);

    } catch (error) {
      clearTimeout(synthesisTimer);
      clearTimeout(translateTimer);
      clearTimeout(visionTimer);

      appendLog(`Pipeline execution aborted: ${error.message}`, 'error', 'system');
      
      // Mark current active step as failed, or default to scrape
      let markedError = false;
      Object.entries(steps).forEach(([key, step]) => {
        if (step.classList.contains('active')) {
          updateStepStatus(key, 'failed');
          markedError = true;
        }
      });
      if (!markedError) {
        updateStepStatus('scrape', 'failed');
      }

      outputLoading.classList.add('hidden');
      outputEmpty.classList.remove('hidden');

      alert(`Campaign generation failed: ${error.message}`);
    } finally {
      btnGenerate.disabled = false;
      btnGenerate.textContent = 'Generate Campaign';
    }
  });

  // Simple HTML Escaper
  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
});
