/**
 * @file utils/prompt.js
 * @description Prompt construction utility module for DocLens AI.
 * Receives page metadata (title, URL), extracted page text, optional user selection, and optional question.
 * Returns a structured prompt formatted to force Gemini into returning concise, bulleted key points and a TL;DR summary.
 */

/**
 * Global Constants
 * Why: Enforces clear system roles and prompt boundary markers.
 */
const DEFAULT_SYSTEM_ROLE = 'You are a professional documentation analysis assistant embedded in a web browser.';

/**
 * Builds a structured prompt for the Gemini AI model.
 *
 * @param {Object} params - Prompt generation parameters.
 * @param {string} params.title - Title of the web page.
 * @param {string} params.url - URL of the web page.
 * @param {string} params.text - Clean extracted visible body text of the web page.
 * @param {string} [params.question=''] - Optional user query or focus area.
 * @param {string} [params.selectedText=''] - Optional text user highlighted on the page.
 * @returns {string} Fully formatted prompt ready for Gemini API consumption.
 */
export function buildPrompt({ title, url, text, question = '', selectedText = '' }) {
  /**
   * STEP 1: Construct system directives and formatting constraints
   * Why: Prevents verbose output and enforces strict key points with single-sentence TL;DR.
   */
  const systemDirectives = [
    DEFAULT_SYSTEM_ROLE,
    'Your task is to analyze the provided web page content and deliver clear, actionable insights.',
    'STRICT CONSTRAINTS:',
    '1. Answer ONLY using facts explicitly present in the provided page content.',
    '   If the requested information is not mentioned in the page text, state clearly: "The provided page content does not contain information about this topic."',
    '2. Output format MUST be SHORT KEY POINTS formatted as markdown bullet items ("- ").',
    '3. Each bullet point MUST be concise (maximum ~15 words per bullet point).',
    '4. Use **bold** for key terms, concepts, status codes, API methods, or parameters.',
    '5. Group bullets under short markdown subheadings (e.g., "### Key Features", "### Technical Details") when appropriate.',
    '6. Conclude your response with a final line starting with "**TL;DR:** " containing a single-sentence summary.',
    '7. DO NOT write long paragraphs, conversational filler (e.g., "Here is the summary"), or repeat the prompt question.'
  ].join('\n');

  /**
   * STEP 2: Build contextual metadata block
   * Why: Gives Gemini origin context (page title & URL) to frame the document correctly.
   */
  const metadataBlock = `PAGE TITLE: ${title || 'Untitled Page'}\nPAGE URL: ${url || 'Unknown URL'}`;

  /**
   * STEP 3: Incorporate user query or text selection focus
   * Why: Prioritizes user's explicit interest over generic page summary when specified.
   */
  let focusBlock = '';
  if (selectedText && selectedText.trim().length > 0) {
    focusBlock += `\nUSER HIGHLIGHTED TEXT:\n"""\n${selectedText.trim()}\n"""\nFocus primarily on explaining and analyzing this highlighted section in context of the page.`;
  }

  if (question && question.trim().length > 0) {
    focusBlock += `\nUSER QUESTION / FOCUS:\n"${question.trim()}"\nAnswer this specific question directly using short key points from the content.`;
  } else if (!selectedText) {
    focusBlock += `\nTASK: Summarize the main purpose, technical specifications, and key takeaways of this page.`;
  }

  /**
   * STEP 4: Assemble final prompt string
   * Why: Combines system directives, metadata, focus instructions, and page text into a unified prompt payload.
   */
  return `${systemDirectives}\n\n${metadataBlock}\n${focusBlock}\n\nPAGE CONTENT:\n"""\n${text}\n"""`;
}
