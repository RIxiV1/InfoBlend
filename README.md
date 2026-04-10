# InfoBlend AI

<div align="center">
  <img src="icons/icon128.png" width="80" height="80" alt="InfoBlend AI">

  **Double-click any word. Get the definition instantly.**

  Chrome Extension · Manifest V3 · No dependencies
</div>

---

## What it does

- **Double-click a word** → definition tooltip appears right next to it
- **Ctrl+K** → command palette to summarize the page or define a word
- **YouTube** → extracts and summarizes video transcripts
- Works with or without an AI API key

## Install

1. Clone this repo
   ```
   git clone https://github.com/YOUR_USERNAME/infoblend-ai-v3-modern-ui.git
   ```
2. Open `chrome://extensions` in Chrome (or `edge://extensions`, `brave://extensions`)
3. Enable **Developer mode** (toggle in top right)
4. Click **Load unpacked** → select the cloned folder
5. Done. Double-click any word on any page.

> Firefox: go to `about:debugging` → This Firefox → Load Temporary Add-on → select `manifest.json`

## Optional: AI-powered summaries

Without an API key, page summaries use a local extractive algorithm. To use AI:

1. Click the InfoBlend icon in the toolbar
2. Under **AI Engine**, select your provider (Gemini, OpenAI, or Custom)
3. Enter your API key and endpoint URL
4. Click **Save**

**Gemini endpoint example:**
```
https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent
```

**OpenAI endpoint:**
```
https://api.openai.com/v1/chat/completions
```

## How it works

```
contentScript.js (87 lines)          ← runs on every page, just event listeners
    │
    │  double-click or Ctrl+K
    │
    ▼
background.js                        ← injects modules on first interaction
    │
    ├── modules/core.js              ← shadow DOM, text highlighting
    ├── modules/overlay.js           ← tooltip + panel rendering
    └── modules/palette.js           ← Ctrl+K command palette
    │
    │  fetches definition / summary
    │
    ├── utils/api.js                 ← Dictionary API → Datamuse → Wiktionary → Wikipedia
    ├── utils/summarizer.js          ← local extractive summarizer
    ├── utils/youtubeInsight.js      ← YouTube transcript extraction
    ├── utils/encryption.js          ← AES-GCM for API key storage
    ├── utils/storage.js             ← chrome.storage wrapper
    └── utils/errors.js              ← error message translation
```

**Key design decisions:**
- Content script is 87 lines. Heavy modules load only when the user interacts.
- Definitions appear as a **tooltip near the word**, not a fixed corner panel.
- Summaries appear in a **side panel** (top-right) since they're longer content.
- Shadow DOM isolates all UI from page styles.
- API key is encrypted at rest with AES-GCM (key derived via PBKDF2).

## Definition fallback chain

When you double-click a word, it tries these sources in order:

1. **Free Dictionary API** — structured data with phonetics, parts of speech, examples
2. **Datamuse** — technical and slang terms
3. **Wiktionary** — detailed definitions
4. **Wikipedia** — first sentence for proper nouns / concepts
5. **Merriam-Webster link** — if all else fails

## Project structure

```
infoblend-ai-v3-modern-ui/
├── manifest.json              # Chrome extension manifest (v3)
├── contentScript.js           # Bootstrap — event listeners only
├── background.js              # Service worker — API routing, module injection
├── modules/
│   ├── core.js                # Shadow DOM, highlighting, BentoRenderer
│   ├── overlay.js             # Definition tooltip + summary panel
│   └── palette.js             # Ctrl+K command palette
├── utils/
│   ├── api.js                 # Definition + AI API adapters
│   ├── summarizer.js          # Local extractive summarizer
│   ├── youtubeInsight.js      # YouTube transcript parser
│   ├── encryption.js          # AES-GCM encryption
│   ├── storage.js             # chrome.storage wrapper
│   └── errors.js              # Error message mapping
├── styles/
│   └── content.css            # Overlay + tooltip styles
├── overlay/
│   └── overlay.css            # Command palette styles
├── popup/
│   ├── popup.html             # Settings page
│   ├── popup.js               # Settings logic
│   └── popup.css              # Settings styles
└── icons/                     # Extension icons
```

## Permissions

| Permission | Why |
|------------|-----|
| `storage` | Save settings and encrypted API key |
| `activeTab` | Access current tab for summarization |
| `contextMenus` | Right-click "Define" and "Summarize" |
| `scripting` | Inject UI modules on first interaction |
| `<all_urls>` | Content script needs to run on any page |

## Troubleshooting

**Extension doesn't work on a page?**
Refresh the tab. Content scripts only inject on pages loaded after installation.

**Nothing happens on double-click?**
Check the popup — make sure "Auto-Definitions" is toggled on.

**Works on some pages but not others?**
Extensions can't run on `chrome://`, `edge://`, `about:`, or browser store pages.

**Definitions are wrong or weird?**
The primary Dictionary API may not have the word. It falls back through 4 other sources.

## License

MIT
