/**
 * @file background.js
 * @description Service worker for DocLens AI.
 * Handles side panel click behavior, tab content extraction, retrieving configuration,
 * listing available Gemini models, auto-falling back on 404 model errors, and executing API calls.
 */

import { buildPrompt } from './utils/prompt.js';

/**
 * Global Constants
 * Why: Centralizes default configuration constants and API endpoint URLs.
 */
const DEFAULT_MODEL = 'gemini-2.5-flash';
const DEFAULT_MAX_CHARS = 120000;
const REQUEST_TIMEOUT_MS = 30000;
const GEMINI_API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

/**
 * STEP 1: Set side panel behavior on installation/startup
 * Why: Ensures clicking the toolbar action icon automatically toggles the side panel.
 */
chrome.runtime.onInstalled.addListener(() => {
  if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((err) => {
      console.error('Failed to set side panel behavior on install:', err);
    });
  }
});

/**
 * STEP 2: Register runtime message listeners
 * Why: Routes message requests (ANALYZE_PAGE, LIST_MODELS, GET_ACTIVE_TAB_INFO) to handler functions.
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'ANALYZE_PAGE') {
    handleAnalyzePage(message.payload)
      .then((response) => sendResponse(response))
      .catch((error) => {
        console.error('Unhandled background error during page analysis:', error);
        sendResponse({
          ok: false,
          errorType: 'UNKNOWN_ERROR',
          message: error.message || 'An unexpected error occurred during analysis.'
        });
      });
    return true; // Keep message channel open for async response
  }

  if (message.type === 'LIST_MODELS') {
    handleListModels(message.payload)
      .then((response) => sendResponse(response))
      .catch((error) => {
        console.error('Unhandled error listing models:', error);
        sendResponse({ ok: false, error: error.message || 'Failed to list models' });
      });
    return true;
  }

  if (message.type === 'GET_ACTIVE_TAB_INFO') {
    getActiveTabInfo()
      .then((info) => sendResponse({ ok: true, data: info }))
      .catch((err) => sendResponse({ ok: false, message: err.message }));
    return true;
  }
});

/**
 * Retrieves title and URL of current active tab.
 *
 * @returns {Promise<{title: string, url: string}>} Active tab details.
 */
async function getActiveTabInfo() {
  let [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab) {
    [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  }
  if (!tab) {
    return { title: '', url: '' };
  }
  return { title: tab.title || '', url: tab.url || '' };
}

/**
 * Checks whether a given URL is scriptable by Chrome extensions.
 *
 * @param {string} url - Tab URL string.
 * @returns {boolean} True if scriptable, false if browser restricted page.
 */
function isScriptableUrl(url) {
  if (!url) return true; // Allow executeScript to evaluate if URL is missing/undefined
  const restrictedPrefixes = [
    'chrome://',
    'brave://',
    'edge://',
    'about:',
    'chrome-extension://',
    'https://chrome.google.com/webstore',
    'https://chromewebstore.google.com'
  ];
  return !restrictedPrefixes.some((prefix) => url.startsWith(prefix));
}

/**
 * Fetches available Gemini models supporting generateContent from REST API.
 * Supports pagination via nextPageToken until all models are loaded.
 *
 * @param {string} apiKey - Gemini API key.
 * @returns {Promise<Array<{id: string, displayName: string}>>} Filtered list of models.
 */
async function listAvailableModels(apiKey) {
  /**
   * STEP 1: Validate API key parameter
   * Why: Prevents network call if API key is missing.
   */
  if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length === 0) {
    throw new Error('Add your Gemini API key in Settings');
  }

  const cleanKey = apiKey.trim();
  const modelsList = [];
  let pageToken = '';

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    /**
     * STEP 2: Paginate through models endpoint
     * Why: Google AI Studio REST API paginates model listings with nextPageToken.
     */
    do {
      let requestUrl = `${GEMINI_API_BASE_URL}?pageSize=100`;
      if (pageToken) {
        requestUrl += `&pageToken=${encodeURIComponent(pageToken)}`;
      }

      const response = await fetch(requestUrl, {
        method: 'GET',
        headers: {
          'x-goog-api-key': cleanKey
        },
        signal: controller.signal
      });

      if (!response.ok) {
        const status = response.status;
        if (status === 400 || status === 403) {
          throw new Error('API key invalid or not allowed');
        }
        throw new Error(`Failed to fetch models (HTTP ${status})`);
      }

      const data = await response.json();
      if (data.models && Array.isArray(data.models)) {
        for (const modelItem of data.models) {
          // Keep only models that support generateContent
          if (modelItem.supportedGenerationMethods && modelItem.supportedGenerationMethods.includes('generateContent')) {
            const rawName = modelItem.name || '';
            const id = rawName.replace(/^models\//, '');
            if (id) {
              modelsList.push({
                id: id,
                displayName: modelItem.displayName || id
              });
            }
          }
        }
      }

      pageToken = data.nextPageToken || '';
    } while (pageToken);

    clearTimeout(timeoutId);
    return modelsList;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error('Network problem or request timed out');
    }
    throw err;
  }
}

/**
 * Handles LIST_MODELS runtime message.
 *
 * @param {Object} payload - Message payload containing optional apiKey.
 * @returns {Promise<Object>} Response object { ok: true, models } or { ok: false, error }.
 */
async function handleListModels(payload = {}) {
  let apiKey = payload.apiKey ? payload.apiKey.trim() : '';

  if (!apiKey) {
    const settings = await chrome.storage.local.get(['geminiApiKey']);
    apiKey = settings.geminiApiKey ? settings.geminiApiKey.trim() : '';
  }

  if (!apiKey) {
    return {
      ok: false,
      errorType: 'NO_API_KEY',
      error: 'Add your Gemini API key in Settings'
    };
  }

  try {
    const models = await listAvailableModels(apiKey);
    return { ok: true, models };
  } catch (err) {
    return { ok: false, error: err.message || 'Failed to fetch models' };
  }
}

/**
 * Selects a fallback model ID in priority order:
 * 1. Model containing "flash" and NOT containing "lite", "preview", "exp", "image", "tts", "thinking"
 * 2. Any model containing "flash-lite"
 * 3. First available model
 *
 * @param {Array<{id: string, displayName: string}>} models - List of available models.
 * @returns {string|null} Chosen model ID or null if list empty.
 */
function selectFallbackModel(models) {
  if (!models || models.length === 0) return null;

  const modelIds = models.map((m) => m.id);

  // Priority 1: Contains "flash" and excludes "lite", "preview", "exp", "image", "tts", "thinking"
  const p1Exclusions = ['lite', 'preview', 'exp', 'image', 'tts', 'thinking'];
  const p1Candidate = modelIds.find((id) => {
    const lower = id.toLowerCase();
    return lower.includes('flash') && !p1Exclusions.some((ex) => lower.includes(ex));
  });
  if (p1Candidate) return p1Candidate;

  // Priority 2: Contains "flash-lite"
  const p2Candidate = modelIds.find((id) => id.toLowerCase().includes('flash-lite'));
  if (p2Candidate) return p2Candidate;

  // Priority 3: First available model
  return modelIds[0] || null;
}

/**
 * Executes raw Gemini API fetch for text generation.
 *
 * @param {string} model - Target model ID.
 * @param {string} apiKey - Gemini API Key.
 * @param {string} promptText - Constructed prompt string.
 * @returns {Promise<Response>} Native fetch response object.
 */
async function callGeminiGenerateContent(model, apiKey, promptText) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  const endpointUrl = `${GEMINI_API_BASE_URL}/${model}:generateContent`;

  const requestBody = {
    contents: [
      {
        parts: [
          { text: promptText }
        ]
      }
    ],
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 2048
    }
  };

  try {
    const response = await fetch(endpointUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    return response;
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

/**
 * Executes end-to-end page analysis workflow with automatic model fallback on 404.
 *
 * @param {Object} payload - Input payload from side panel.
 * @param {string} [payload.question] - User typed query.
 * @returns {Promise<Object>} Response object { ok, data } or { ok: false, errorType, message }.
 */
async function handleAnalyzePage({ question = '' } = {}) {
  /**
   * STEP 1: Query active tab in focused window
   * Why: Uses lastFocusedWindow to target browser tab user is viewing.
   */
  let [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab || !tab.id) {
    [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  }

  if (!tab || !tab.id) {
    return {
      ok: false,
      errorType: 'NO_ACTIVE_TAB',
      message: 'No active browser tab found.'
    };
  }

  /**
   * STEP 2: Validate URL against system security restrictions
   * Why: Browser security prohibits extensions from injecting scripts into internal pages or Web Store.
   */
  if (tab.url && !isScriptableUrl(tab.url)) {
    return {
      ok: false,
      errorType: 'RESTRICTED_PAGE',
      message: "This page can't be read by extensions."
    };
  }

  /**
   * STEP 3: Inject content.js script on demand
   * Why: activeTab permission enables page text extraction on demand.
   */
  let extractionResult;
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content.js']
    });
    if (results && results[0] && results[0].result) {
      extractionResult = results[0].result;
    }
  } catch (err) {
    console.error('Content script injection failed:', err);
    const errMsg = err && err.message ? err.message : '';
    if (errMsg.includes('chrome://') || errMsg.includes('brave://') || errMsg.includes('edge://') || errMsg.includes('extension gallery') || errMsg.includes('about:')) {
      return {
        ok: false,
        errorType: 'RESTRICTED_PAGE',
        message: "This page can't be read by extensions."
      };
    }
    return {
      ok: false,
      errorType: 'PERMISSION_REQUIRED',
      message: 'Please click the DocLens AI toolbar icon on this tab to activate page reading.'
    };
  }

  if (!extractionResult) {
    return {
      ok: false,
      errorType: 'EMPTY_TEXT',
      message: 'No readable content found on this page.'
    };
  }

  const { title, url, text, charCount, selectedText } = extractionResult;

  if (!text || text.trim().length === 0) {
    return {
      ok: false,
      errorType: 'EMPTY_TEXT',
      message: 'No readable content found on this page.'
    };
  }

  /**
   * STEP 4: Retrieve user settings from chrome.storage.local
   * Why: Reads stored API credentials, model name, and character length ceiling.
   */
  const settings = await chrome.storage.local.get(['geminiApiKey', 'geminiModel', 'maxChars']);
  const apiKey = settings.geminiApiKey ? settings.geminiApiKey.trim() : '';
  let model = settings.geminiModel ? settings.geminiModel.trim() : DEFAULT_MODEL;
  const maxChars = settings.maxChars ? parseInt(settings.maxChars, 10) : DEFAULT_MAX_CHARS;

  if (!apiKey) {
    return {
      ok: false,
      errorType: 'NO_API_KEY',
      message: 'Add your Gemini API key in Settings'
    };
  }

  /**
   * STEP 5: Truncate text if character length exceeds max limit
   * Why: Prevents token overflow and payload size limit errors.
   */
  let textToAnalyze = text;
  let wasTruncated = false;

  if (textToAnalyze.length > maxChars) {
    textToAnalyze = textToAnalyze.substring(0, maxChars);
    wasTruncated = true;
  }

  /**
   * STEP 6: Construct Gemini prompt payload
   * Why: Builds structured prompt with metadata, focus instructions, and page content.
   */
  const promptText = buildPrompt({
    title,
    url,
    text: textToAnalyze,
    question,
    selectedText
  });

  /**
   * STEP 7: Dispatch primary HTTP call to Gemini API
   * Why: Executes fetch call with configured model and headers.
   */
  let usedFallbackModel = null;
  let apiResponse;

  try {
    apiResponse = await callGeminiGenerateContent(model, apiKey, promptText);
  } catch (error) {
    if (error.name === 'AbortError') {
      return {
        ok: false,
        errorType: 'TIMEOUT',
        message: 'Network problem or request timed out'
      };
    }
    return {
      ok: false,
      errorType: 'NETWORK_ERROR',
      message: 'Network problem or request timed out'
    };
  }

  /**
   * STEP 8: Handle Model 404 / Unavailable with Automatic Fallback
   * Why: If requested model is retired or unavailable for user key, automatically query models list and retry once.
   */
  if (!apiResponse.ok && (apiResponse.status === 404 || apiResponse.status === 400)) {
    let isModelNotFoundError = apiResponse.status === 404;

    if (apiResponse.status === 400) {
      try {
        const errorJson = await apiResponse.clone().json();
        const errDetail = errorJson.error?.message || '';
        if (errDetail.toLowerCase().includes('model') || errDetail.toLowerCase().includes('not found')) {
          isModelNotFoundError = true;
        }
      } catch (e) {
        // Ignored
      }
    }

    if (isModelNotFoundError) {
      try {
        const availableModels = await listAvailableModels(apiKey);
        const fallbackModelId = selectFallbackModel(availableModels);

        if (fallbackModelId && fallbackModelId !== model) {
          // Retry ONCE with fallback model
          const retryResponse = await callGeminiGenerateContent(fallbackModelId, apiKey, promptText);

          if (retryResponse.ok) {
            apiResponse = retryResponse;
            model = fallbackModelId;
            usedFallbackModel = fallbackModelId;
            // Save fallback model to chrome.storage.local for future requests
            await chrome.storage.local.set({ geminiModel: fallbackModelId });
          }
        }
      } catch (fallbackErr) {
        console.error('Fallback attempt failed:', fallbackErr);
      }
    }
  }

  /**
   * STEP 9: Evaluate API response status codes
   * Why: Maps technical HTTP statuses to user-friendly error messages.
   */
  if (!apiResponse.ok) {
    const status = apiResponse.status;
    if (status === 400 || status === 403) {
      return {
        ok: false,
        errorType: 'INVALID_API_KEY',
        message: 'API key invalid or not allowed'
      };
    }
    if (status === 404) {
      return {
        ok: false,
        errorType: 'MODEL_NOT_FOUND',
        message: 'Selected model not found. Please open Settings and pick an available model from the list.'
      };
    }
    if (status === 429) {
      return {
        ok: false,
        errorType: 'RATE_LIMIT',
        message: 'Rate limit reached, try again in a minute'
      };
    }
    if (status >= 500) {
      return {
        ok: false,
        errorType: 'SERVER_ERROR',
        message: 'Gemini is having issues, try again'
      };
    }
    return {
      ok: false,
      errorType: 'API_ERROR',
      message: `Gemini API request failed (HTTP ${status})`
    };
  }

  /**
   * STEP 10: Parse response JSON and return output
   * Why: Extracts generated candidate Markdown string from Gemini payload.
   */
  try {
    const responseData = await apiResponse.json();
    const resultText = responseData.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!resultText) {
      return {
        ok: false,
        errorType: 'EMPTY_RESPONSE',
        message: 'No response text received from Gemini API.'
      };
    }

    return {
      ok: true,
      data: {
        resultText,
        title,
        url,
        charCount,
        wasTruncated,
        usedFallbackModel
      }
    };
  } catch (parseErr) {
    return {
      ok: false,
      errorType: 'PARSE_ERROR',
      message: 'Failed to parse response from Gemini API.'
    };
  }
}
