/**
 * @file sidepanel/sidepanel.js
 * @description Controller script for DocLens AI side panel UI.
 * Handles DOM element bindings, active tab tracking, message passing to background service worker,
 * rendering markdown output, displaying fallback model notices, and managing error states.
 */

import { renderMarkdown } from '../utils/markdown.js';

/**
 * Global DOM Elements Cache
 * Why: Avoids repeated querySelector lookups during UI interaction loops.
 */
let elements = {};
let currentRawResultText = '';

/**
 * STEP 1: Initialize side panel on DOM content load
 * Why: Binds DOM references, attaches event handlers, and loads current tab metadata.
 */
document.addEventListener('DOMContentLoaded', () => {
  initElements();
  attachEventListeners();
  loadActiveTabInfo();
  setupTabListeners();
});

/**
 * Caches all required HTML element references.
 */
function initElements() {
  elements = {
    settingsBtn: document.getElementById('settingsBtn'),
    pageTitle: document.getElementById('pageTitle'),
    pageUrl: document.getElementById('pageUrl'),
    questionInput: document.getElementById('questionInput'),
    analyzeBtn: document.getElementById('analyzeBtn'),
    btnSpinner: document.getElementById('btnSpinner'),
    loadingState: document.getElementById('loadingState'),
    errorCard: document.getElementById('errorCard'),
    errorTitle: document.getElementById('errorTitle'),
    errorMessage: document.getElementById('errorMessage'),
    openSettingsBtn: document.getElementById('openSettingsBtn'),
    resultCard: document.getElementById('resultCard'),
    truncationWarning: document.getElementById('truncationWarning'),
    resultContent: document.getElementById('resultContent'),
    copyBtn: document.getElementById('copyBtn'),
    clearBtn: document.getElementById('clearBtn')
  };
}

/**
 * Attaches click and input event handlers to interactive UI components.
 */
function attachEventListeners() {
  elements.settingsBtn.addEventListener('click', openSettings);
  elements.openSettingsBtn.addEventListener('click', openSettings);
  elements.analyzeBtn.addEventListener('click', handleAnalyzeClick);
  elements.copyBtn.addEventListener('click', handleCopyClick);
  elements.clearBtn.addEventListener('click', handleClearClick);
}

/**
 * STEP 2: Listen for tab switching and URL changes
 * Why: Keeps top metadata card synchronized with whichever tab user is actively viewing.
 */
function setupTabListeners() {
  chrome.tabs.onActivated.addListener(() => {
    loadActiveTabInfo();
  });

  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (tab.active && (changeInfo.status === 'complete' || changeInfo.title || changeInfo.url)) {
      loadActiveTabInfo();
    }
  });
}

/**
 * Queries background script for active tab details.
 */
async function loadActiveTabInfo() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_ACTIVE_TAB_INFO' });
    if (response && response.ok && response.data) {
      if (response.data.title) elements.pageTitle.textContent = response.data.title;
      if (response.data.url) elements.pageUrl.textContent = response.data.url;
    }
  } catch (err) {
    // Retain existing title/url on error
  }
}

/**
 * Opens the extension options page.
 */
function openSettings() {
  if (chrome.runtime.openOptionsPage) {
    chrome.runtime.openOptionsPage();
  } else {
    window.open(chrome.runtime.getURL('options/options.html'));
  }
}

/**
 * STEP 3: Handle Analyze button click event
 * Why: Triggers page extraction and Gemini analysis via background worker message passing.
 */
async function handleAnalyzeClick() {
  const question = elements.questionInput.value.trim();

  // Reset UI state
  hideError();
  hideResult();
  showLoading();

  try {
    /**
     * STEP 4: Send ANALYZE_PAGE message to background script
     * Why: Background worker handles tab injection, security checks, and REST API fetch.
     */
    const response = await chrome.runtime.sendMessage({
      type: 'ANALYZE_PAGE',
      payload: { question }
    });

    hideLoading();

    if (!response || !response.ok) {
      const errorMsg = response ? response.message : 'Failed to connect to background service worker.';
      const errorType = response ? response.errorType : 'UNKNOWN';
      showError(errorMsg, errorType);
      return;
    }

    /**
     * STEP 5: Render successful analysis result
     * Why: Displays formatted key points safely and alerts user if page was trimmed or fallback model was used.
     */
    const { resultText, title, url, wasTruncated, usedFallbackModel } = response.data;
    currentRawResultText = resultText;

    if (title) elements.pageTitle.textContent = title;
    if (url) elements.pageUrl.textContent = url;

    displayResult(resultText, wasTruncated, usedFallbackModel);
  } catch (err) {
    hideLoading();
    showError(err.message || 'An unexpected error occurred.', 'UNKNOWN');
  }
}

/**
 * Renders markdown text and displays the result section.
 *
 * @param {string} markdownText - Raw markdown text.
 * @param {boolean} wasTruncated - Whether text exceeded max char limit.
 * @param {string|null} usedFallbackModel - Fallback model ID if primary was unavailable.
 */
function displayResult(markdownText, wasTruncated, usedFallbackModel) {
  const htmlContent = renderMarkdown(markdownText);
  elements.resultContent.innerHTML = htmlContent;

  if (wasTruncated) {
    elements.truncationWarning.classList.remove('hidden');
  } else {
    elements.truncationWarning.classList.add('hidden');
  }

  /**
   * STEP 6: Display fallback model info note if fallback was used
   * Why: Informs user that requested model was unavailable and auto-selected a fallback model instead.
   */
  let fallbackNote = document.getElementById('fallbackNote');
  if (!fallbackNote) {
    fallbackNote = document.createElement('div');
    fallbackNote.id = 'fallbackNote';
    fallbackNote.className = 'truncation-warning hidden';
    fallbackNote.style.marginTop = '6px';
    elements.resultCard.insertBefore(fallbackNote, elements.resultContent);
  }

  if (usedFallbackModel) {
    fallbackNote.textContent = `Selected model was unavailable, used ${usedFallbackModel} instead.`;
    fallbackNote.classList.remove('hidden');
  } else {
    fallbackNote.classList.add('hidden');
  }

  elements.resultCard.classList.remove('hidden');
}

/**
 * Displays error message card with action buttons if applicable.
 *
 * @param {string} message - Human readable error description.
 * @param {string} errorType - Category code of error.
 */
function showError(message, errorType) {
  elements.errorMessage.textContent = message;

  if (errorType === 'NO_API_KEY' || errorType === 'INVALID_API_KEY' || errorType === 'MODEL_NOT_FOUND') {
    elements.openSettingsBtn.classList.remove('hidden');
  } else {
    elements.openSettingsBtn.classList.add('hidden');
  }

  elements.errorCard.classList.remove('hidden');
}

/**
 * Hides error card.
 */
function hideError() {
  elements.errorCard.classList.add('hidden');
  elements.openSettingsBtn.classList.add('hidden');
}

/**
 * Displays loading state spinner and disables primary action button.
 */
function showLoading() {
  elements.analyzeBtn.disabled = true;
  elements.btnSpinner.classList.remove('hidden');
  elements.loadingState.classList.remove('hidden');
}

/**
 * Hides loading state spinner and enables primary action button.
 */
function hideLoading() {
  elements.analyzeBtn.disabled = false;
  elements.btnSpinner.classList.add('hidden');
  elements.loadingState.classList.add('hidden');
}

/**
 * Hides result card.
 */
function hideResult() {
  elements.resultCard.classList.add('hidden');
  elements.resultContent.innerHTML = '';
  currentRawResultText = '';
  const fallbackNote = document.getElementById('fallbackNote');
  if (fallbackNote) {
    fallbackNote.classList.add('hidden');
  }
}

/**
 * STEP 7: Handle Copy button click
 * Why: Copies extracted text analysis to user clipboard with visual confirmation.
 */
async function handleCopyClick() {
  if (!currentRawResultText) return;

  try {
    await navigator.clipboard.writeText(currentRawResultText);
    const originalText = elements.copyBtn.textContent;
    elements.copyBtn.textContent = 'Copied!';
    setTimeout(() => {
      elements.copyBtn.textContent = originalText;
    }, 2000);
  } catch (err) {
    console.error('Failed to copy text to clipboard:', err);
  }
}

/**
 * STEP 8: Handle Clear button click
 * Why: Resets side panel state to default blank view.
 */
function handleClearClick() {
  hideResult();
  hideError();
  elements.questionInput.value = '';
}
