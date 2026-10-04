/**
 * @file options/options.js
 * @description Controller script for DocLens AI options/settings page.
 * Manages loading saved configuration from chrome.storage.local, toggling password field visibility,
 * fetching available Gemini models via LIST_MODELS message passing, and persisting settings.
 */

/**
 * Global Constants
 * Why: Defines fallback defaults if storage items are uninitialized.
 */
const DEFAULT_MODEL = 'gemini-2.5-flash';
const DEFAULT_MAX_CHARS = 120000;

/**
 * Global State
 */
let currentSavedModel = DEFAULT_MODEL;

/**
 * STEP 1: Bind DOM elements on load
 * Why: Initializes event listeners and loads saved configuration as soon as page renders.
 */
document.addEventListener('DOMContentLoaded', () => {
  const apiKeyInput = document.getElementById('apiKeyInput');
  const toggleKeyBtn = document.getElementById('toggleKeyBtn');
  const modelSelect = document.getElementById('modelSelect');
  const loadModelsBtn = document.getElementById('loadModelsBtn');
  const modelsLoadingSpinner = document.getElementById('modelsLoadingSpinner');
  const modelsError = document.getElementById('modelsError');
  const toggleCustomModelBtn = document.getElementById('toggleCustomModelBtn');
  const customModelInput = document.getElementById('customModelInput');
  const customModelHint = document.getElementById('customModelHint');
  const maxCharsInput = document.getElementById('maxCharsInput');
  const saveBtn = document.getElementById('saveBtn');
  const saveToast = document.getElementById('saveToast');

  /**
   * STEP 2: Load saved configuration from storage
   * Why: Populates stored API key, model preference, and max character limits.
   */
  loadSettings({
    apiKeyInput,
    modelSelect,
    customModelInput,
    maxCharsInput,
    toggleCustomModelBtn,
    customModelHint
  });

  /**
   * STEP 3: Attach API key show/hide password toggle handler
   * Why: Allows user to inspect typed API key characters temporarily.
   */
  toggleKeyBtn.addEventListener('click', () => {
    const isPassword = apiKeyInput.type === 'password';
    apiKeyInput.type = isPassword ? 'text' : 'password';
    toggleKeyBtn.textContent = isPassword ? '🙈' : '👁️';
  });

  /**
   * STEP 4: Attach "Load models" button click handler
   * Why: Fetches live model list from background worker for the currently entered API key.
   */
  loadModelsBtn.addEventListener('click', () => {
    const apiKey = apiKeyInput.value.trim();
    fetchAndPopulateModels(apiKey, {
      modelSelect,
      loadModelsBtn,
      modelsLoadingSpinner,
      modelsError
    });
  });

  /**
   * STEP 5: Attach custom model toggle handler
   * Why: Displays text input for users wishing to specify a model ID manually.
   */
  toggleCustomModelBtn.addEventListener('click', () => {
    const isHidden = customModelInput.classList.contains('hidden');
    if (isHidden) {
      customModelInput.classList.remove('hidden');
      customModelHint.classList.remove('hidden');
      toggleCustomModelBtn.textContent = '- Hide custom model input';
      customModelInput.focus();
    } else {
      customModelInput.classList.add('hidden');
      customModelHint.classList.add('hidden');
      toggleCustomModelBtn.textContent = '+ Use custom model name';
    }
  });

  /**
   * STEP 6: Attach Save button click handler
   * Why: Persists form inputs to chrome.storage.local and displays success toast.
   */
  saveBtn.addEventListener('click', () => {
    saveSettings({
      apiKeyInput,
      modelSelect,
      customModelInput,
      maxCharsInput,
      saveToast
    });
  });
});

/**
 * Loads current settings from chrome.storage.local and auto-loads models if API key exists.
 *
 * @param {Object} elements - UI element map.
 */
async function loadSettings(elements) {
  try {
    const settings = await chrome.storage.local.get(['geminiApiKey', 'geminiModel', 'maxChars']);
    const apiKey = settings.geminiApiKey ? settings.geminiApiKey.trim() : '';
    const savedModel = settings.geminiModel ? settings.geminiModel.trim() : DEFAULT_MODEL;
    const maxChars = settings.maxChars ? parseInt(settings.maxChars, 10) : DEFAULT_MAX_CHARS;

    currentSavedModel = savedModel;

    if (apiKey) {
      elements.apiKeyInput.value = apiKey;
    }

    elements.maxCharsInput.value = maxChars;

    // Set initial dropdown option
    elements.modelSelect.innerHTML = '';
    const defaultOption = document.createElement('option');
    defaultOption.value = savedModel;
    defaultOption.textContent = `${savedModel} (Saved)`;
    defaultOption.selected = true;
    elements.modelSelect.appendChild(defaultOption);

    /**
     * STEP 7: Auto-load models if API key is already saved
     * Why: Provides immediate list of available models upon opening options page.
     */
    if (apiKey) {
      fetchAndPopulateModels(apiKey, {
        modelSelect: elements.modelSelect,
        loadModelsBtn: document.getElementById('loadModelsBtn'),
        modelsLoadingSpinner: document.getElementById('modelsLoadingSpinner'),
        modelsError: document.getElementById('modelsError')
      });
    }
  } catch (err) {
    console.error('Failed to load settings from storage:', err);
  }
}

/**
 * Fetches available models from background worker via LIST_MODELS message.
 *
 * @param {string} apiKey - Gemini API Key.
 * @param {Object} ui - Elements object containing modelSelect, loadModelsBtn, modelsLoadingSpinner, modelsError.
 */
async function fetchAndPopulateModels(apiKey, ui) {
  if (!apiKey) {
    showModelsError(ui.modelsError, 'Please enter a Gemini API key first.');
    return;
  }

  hideModelsError(ui.modelsError);
  showModelsLoading(ui.loadModelsBtn, ui.modelsLoadingSpinner);

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'LIST_MODELS',
      payload: { apiKey }
    });

    hideModelsLoading(ui.loadModelsBtn, ui.modelsLoadingSpinner);

    if (!response || !response.ok) {
      const errorMsg = response ? (response.error || response.message) : 'Failed to connect to background service worker.';
      showModelsError(ui.modelsError, errorMsg);
      return;
    }

    const models = response.models || [];
    if (models.length === 0) {
      showModelsError(ui.modelsError, 'No models supporting text generation were found for this API key.');
      return;
    }

    populateModelDropdown(ui.modelSelect, models);
  } catch (err) {
    hideModelsLoading(ui.loadModelsBtn, ui.modelsLoadingSpinner);
    showModelsError(ui.modelsError, err.message || 'Failed to load models.');
  }
}

/**
 * Populates modelSelect dropdown with fetched models list.
 *
 * @param {HTMLSelectElement} modelSelect - Dropdown select element.
 * @param {Array<{id: string, displayName: string}>} models - List of models.
 */
function populateModelDropdown(modelSelect, models) {
  const selectedValue = currentSavedModel || modelSelect.value || DEFAULT_MODEL;
  modelSelect.innerHTML = '';

  let isSavedFound = false;

  models.forEach((m) => {
    const option = document.createElement('option');
    option.value = m.id;
    option.textContent = `${m.displayName} (${m.id})`;

    if (m.id === selectedValue) {
      option.selected = true;
      isSavedFound = true;
    }
    modelSelect.appendChild(option);
  });

  // If currently saved model is not present in fetched list, append it at the top
  if (!isSavedFound && selectedValue) {
    const customOption = document.createElement('option');
    customOption.value = selectedValue;
    customOption.textContent = `${selectedValue} (Current / Custom)`;
    customOption.selected = true;
    modelSelect.insertBefore(customOption, modelSelect.firstChild);
  }
}

/**
 * Displays loading state for Load models button.
 *
 * @param {HTMLButtonElement} btn - Load models button.
 * @param {HTMLElement} spinner - Loading spinner element.
 */
function showModelsLoading(btn, spinner) {
  btn.disabled = true;
  spinner.classList.remove('hidden');
}

/**
 * Hides loading state for Load models button.
 *
 * @param {HTMLButtonElement} btn - Load models button.
 * @param {HTMLElement} spinner - Loading spinner element.
 */
function hideModelsLoading(btn, spinner) {
  btn.disabled = false;
  spinner.classList.add('hidden');
}

/**
 * Displays friendly model loading error message.
 *
 * @param {HTMLElement} container - Models error message element.
 * @param {string} message - Human readable error string.
 */
function showModelsError(container, message) {
  container.textContent = message;
  container.classList.remove('hidden');
}

/**
 * Hides model loading error container.
 *
 * @param {HTMLElement} container - Models error message element.
 */
function hideModelsError(container) {
  container.classList.add('hidden');
  container.textContent = '';
}

/**
 * Saves configuration parameters into chrome.storage.local.
 *
 * @param {Object} params - Object containing input element references.
 */
async function saveSettings({ apiKeyInput, modelSelect, customModelInput, maxCharsInput, saveToast }) {
  const apiKey = apiKeyInput.value.trim();
  const customModel = customModelInput.value.trim();
  const selectedModel = modelSelect.value ? modelSelect.value.trim() : '';

  // Custom model input takes priority if filled
  const modelToSave = customModel || selectedModel || DEFAULT_MODEL;
  const maxChars = parseInt(maxCharsInput.value, 10) || DEFAULT_MAX_CHARS;

  try {
    await chrome.storage.local.set({
      geminiApiKey: apiKey,
      geminiModel: modelToSave,
      maxChars: maxChars
    });

    currentSavedModel = modelToSave;

    /**
     * STEP 8: Display visual save confirmation toast
     * Why: Confirms setting changes were persisted successfully.
     */
    saveToast.classList.remove('hidden');
    setTimeout(() => {
      saveToast.classList.add('hidden');
    }, 3000);
  } catch (err) {
    console.error('Failed to save settings to storage:', err);
    alert('Error saving settings. Please try again.');
  }
}
