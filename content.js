/**
 * @file content.js
 * @description Page text extraction content script for DocLens AI.
 * Injected on demand via chrome.scripting.executeScript into active tabs.
 * Extracts main content text, preserves headings and code blocks, filters out UI noise,
 * captures user-highlighted text, and returns a clean payload object.
 */

(function () {
  /**
   * STEP 1: Capture user selected text on page
   * Why: If user highlighted text, we prioritize it as explicit focus context.
   */
  const selectedText = window.getSelection ? window.getSelection().toString().trim() : '';

  /**
   * STEP 2: Locate primary content container
   * Why: Focuses analysis on main article body rather than site navigation or footers.
   */
  const targetContainer = document.querySelector('main') ||
                          document.querySelector('article') ||
                          document.querySelector('[role="main"]') ||
                          document.body;

  if (!targetContainer) {
    return {
      title: document.title || '',
      url: window.location.href || '',
      text: '',
      charCount: 0,
      selectedText
    };
  }

  /**
   * STEP 3: Clone node and strip noise tags
   * Why: Cloning allows node removal without affecting the active browser tab DOM.
   */
  const clone = targetContainer.cloneNode(true);
  const noiseSelectors = [
    'script', 'style', 'noscript', 'nav', 'footer', 'header', 'aside',
    'iframe', 'svg', 'form',
    '[role="navigation"]', '[role="banner"]', '[role="contentinfo"]',
    '.cookie-banner', '#cookie-banner', '.ad', '.ads', '.advertisement'
  ];

  noiseSelectors.forEach((selector) => {
    const elements = clone.querySelectorAll(selector);
    elements.forEach((el) => el.remove());
  });

  /**
   * Recursively traverses DOM nodes to extract readable text while preserving structural elements.
   *
   * @param {Node} node - The DOM node to evaluate.
   * @returns {string} Text snippet with structural markdown indicators.
   */
  function processNode(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      return '';
    }

    const tagName = node.tagName.toLowerCase();

    // Skip hidden DOM elements
    const style = window.getComputedStyle ? window.getComputedStyle(node) : null;
    if (style && (style.display === 'none' || style.visibility === 'hidden')) {
      return '';
    }

    const childText = Array.from(node.childNodes).map(processNode).join('');

    if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tagName)) {
      const level = parseInt(tagName.replace('h', ''), 10);
      const prefix = '#'.repeat(level);
      return `\n\n${prefix} ${childText.trim()}\n`;
    }

    if (tagName === 'li') {
      return `\n- ${childText.trim()}`;
    }

    if (tagName === 'pre' || tagName === 'code') {
      if (tagName === 'pre') {
        return `\n\`\`\`\n${childText.trim()}\n\`\`\`\n`;
      }
      return ` \`${childText.trim()}\` `;
    }

    if (['p', 'div', 'section', 'article', 'tr'].includes(tagName)) {
      return `\n${childText}`;
    }

    return childText;
  }

  /**
   * STEP 4: Process cloned node and normalize whitespace
   * Why: Eliminates repetitive spaces and blank lines while preserving paragraph spacing.
   */
  const rawText = processNode(clone);
  const cleanedText = rawText
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .trim();

  /**
   * STEP 5: Package extracted metadata and clean content
   * Why: Returns clean payload to background service worker via executeScript.
   */
  return {
    title: document.title || '',
    url: window.location.href || '',
    text: cleanedText,
    charCount: cleanedText.length,
    selectedText
  };
})();
