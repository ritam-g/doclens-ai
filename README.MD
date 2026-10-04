# DocLens AI - Browser Documentation Assistant

DocLens AI is a lightweight, privacy-focused Chrome and Brave browser extension (Manifest V3) that automates documentation analysis and web page summarization using the Google Gemini AI REST API. It extracts text directly from the current active tab and delivers concise, bulleted key points and a single-sentence TL;DR overview—eliminating manual copy-pasting.

---

## Folder Structure

```
doclens-ai/
├── manifest.json            # Manifest V3 extension configuration
├── background.js            # Service worker (tab tracking, API call, message handler)
├── content.js               # On-demand content script (DOM page text extraction)
├── sidepanel/
│   ├── sidepanel.html       # Chrome Side Panel UI markup
│   ├── sidepanel.css        # Responsive, light/dark mode stylesheet
│   └── sidepanel.js         # Side panel UI controller and event bindings
├── options/
│   ├── options.html         # Settings page HTML
│   ├── options.css          # Settings page CSS
│   └── options.js           # API key and model selection manager
├── utils/
│   ├── prompt.js            # Structured prompt generator for Gemini
│   └── markdown.js          # Safe minimal markdown renderer (XSS-safe)
├── icons/
│   ├── icon16.png           # 16x16 icon
│   ├── icon48.png           # 48x48 icon
│   └── icon128.png          # 128x128 icon
└── README.md                # Documentation and setup instructions
```

---

## How to Get a Free Gemini API Key

1. Visit [Google AI Studio](https://aistudio.google.com/app/apikey).
2. Sign in with your Google account.
3. Click **Create API Key**.
4. Copy your key. (Your key remains private and is stored locally in your browser's `chrome.storage.local`).

---

## Installation Instructions (Brave & Chrome)

1. Open your browser and navigate to the extension management page:
   - **Brave:** `brave://extensions`
   - **Chrome:** `chrome://extensions`
2. Enable **Developer mode** using the toggle in the top-right corner.
3. Click the **Load unpacked** button.
4. Select the `doclens-ai` folder (`c:\Users\swaru\OneDrive\Desktop\PROJECT\doclens-ai`).
5. The extension icon will now appear in your browser toolbar.

---

## How to Use DocLens AI

1. **Open Settings:**
   - Click the extension icon to open the side panel, then click the **Gear (⚙️)** icon in the header (or open extension Options).
   - Enter your Gemini API key and click **Save Settings**.
2. **Analyze Any Page:**
   - Navigate to any web page, documentation article, or technical blog.
   - Click the **DocLens AI** toolbar icon to open the side panel.
3. **Ask a Specific Question (Optional):**
   - Type what you are looking for in the text box (e.g., *"How does authentication work here?"*).
   - Alternatively, highlight text on the web page to focus specifically on that snippet.
   - Leave the input empty to generate a comprehensive page summary.
4. **View Key Points:**
   - Click **Analyze**.
   - Review short, bolded bullet points and the final **TL;DR** section.
   - Use the **Copy** button to copy results to your clipboard or **Clear** to start over.

---

## Troubleshooting & Common Error Messages

| Error Message | Cause & Solution |
| :--- | :--- |
| **Add your Gemini API key in Settings** | No API key has been saved yet. Click *Open Settings* to enter your Google AI Studio key. |
| **API key invalid or not allowed** | The API key is mistyped, revoked, or lacks permission for the selected model. Re-check your key in Google AI Studio. |
| **Rate limit reached, try again in a minute** | Gemini API quota exceeded (HTTP 429). Wait 60 seconds before clicking Analyze again. |
| **Gemini is having issues, try again** | Gemini API server error (HTTP 5xx). Try again shortly. |
| **Network problem or request timed out** | Internet connection issue or request exceeded 30 seconds limit. |
| **This page can't be read by extensions** | Attempted to run on restricted browser pages (`brave://`, `chrome://`, Chrome Web Store). |
| **No readable content found on this page** | Page contains no extractable text or consists solely of images/iframes. |

---

## Future Ideas & Roadmap

- **PDF Support:** Extract text from locally opened or online PDF documents.
- **Chat History:** Maintain local search history across recent sessions.
- **Custom System Prompts:** Allow users to define custom output schemas (e.g., code snippet extraction, translation).
- **Backend Proxy Option:** Support custom enterprise proxy endpoints.
