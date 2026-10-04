/**
 * @file utils/markdown.js
 * @description Safe minimal markdown renderer for DocLens AI.
 * Receives raw markdown text returned from Gemini API, escapes HTML entities to prevent XSS vulnerabilities,
 * and converts headings, bullets, bold, and code blocks into safe HTML elements.
 */

/**
 * Escapes special HTML characters in a string to prevent XSS script injection.
 *
 * @param {string} str - Raw text input.
 * @returns {string} Sanitized string safe for HTML interpolation.
 */
function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Formats inline markdown syntax (**bold** and `inline code`).
 *
 * @param {string} text - HTML-escaped string.
 * @returns {string} Formatted string with safe inline HTML tags applied.
 */
function formatInline(text) {
  // Convert **bold** -> <strong>bold</strong>
  let formatted = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  // Convert `code` -> <code>code</code>
  formatted = formatted.replace(/`([^`]+)`/g, '<code>$1</code>');
  return formatted;
}

/**
 * Converts raw markdown text into safe HTML markup.
 *
 * @param {string} markdownText - Raw markdown text received from Gemini API.
 * @returns {string} Safe HTML string ready to render inside DOM container.
 */
export function renderMarkdown(markdownText) {
  /**
   * STEP 1: Handle missing or invalid input
   * Why: Prevents runtime exceptions when rendering empty responses.
   */
  if (!markdownText || typeof markdownText !== 'string') {
    return '';
  }

  /**
   * STEP 2: Escape raw HTML entities upfront
   * Why: Guarantees zero script injection capability before any formatting transformation occurs.
   */
  const escapedText = escapeHtml(markdownText.trim());

  /**
   * STEP 3: Process text line-by-line for block level elements
   * Why: Line-based parsing enforces clean structural markup for lists, headings, and paragraphs.
   */
  const lines = escapedText.split(/\r?\n/);
  const htmlElements = [];
  let inList = false;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const line = rawLine.trim();

    if (!line) {
      if (inList) {
        htmlElements.push('</ul>');
        inList = false;
      }
      continue;
    }

    // Check for Headings: # Heading, ## Heading, ### Heading
    const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      if (inList) {
        htmlElements.push('</ul>');
        inList = false;
      }
      const level = headingMatch[1].length;
      const titleText = formatInline(headingMatch[2]);
      const tag = level === 1 ? 'h3' : level === 2 ? 'h4' : 'h5';
      htmlElements.push(`<${tag} class="md-heading">${titleText}</${tag}>`);
      continue;
    }

    // Check for Bullet Items: - item or * item
    const bulletMatch = line.match(/^[\-\*]\s+(.+)$/);
    if (bulletMatch) {
      if (!inList) {
        htmlElements.push('<ul class="md-list">');
        inList = true;
      }
      const itemText = formatInline(bulletMatch[1]);
      htmlElements.push(`<li>${itemText}</li>`);
      continue;
    }

    // Close open list if a non-list line is encountered
    if (inList) {
      htmlElements.push('</ul>');
      inList = false;
    }

    // Check for TL;DR callout line
    if (line.startsWith('<strong>TL;DR:</strong>') || line.startsWith('TL;DR:')) {
      const formattedLine = formatInline(line);
      htmlElements.push(`<div class="md-tldr">${formattedLine}</div>`);
      continue;
    }

    // Standard paragraph line
    const formattedParagraph = formatInline(line);
    htmlElements.push(`<p class="md-paragraph">${formattedParagraph}</p>`);
  }

  if (inList) {
    htmlElements.push('</ul>');
  }

  /**
   * STEP 4: Return compiled HTML markup string
   * Why: Delivers clean, safe HTML ready to be injected into side panel container.
   */
  return htmlElements.join('\n');
}
