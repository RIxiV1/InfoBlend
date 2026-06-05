# InfoBlend

<div align="center">
  <img src="icons/icon128.png" width="80" height="80" alt="InfoBlend">

  **Definitions, translations, summaries, and page Q&A — without leaving the page.**

  Chrome &middot; Edge &middot; Firefox &middot; Manifest V3 &middot; Zero Dependencies &middot; BYOK
</div>

---

## Features

### Definitions
- **Double-click any word** → tooltip with structured definitions, phonetics, examples, synonyms, and a CEFR difficulty pill where available.
- **Select 2–5 words** → floating Define button looks up the phrase across Wikipedia, Wiktionary, Dictionary, and Datamuse with automatic fallback.
- **Right-click → Define** for an explicit menu entry.
- **Context-aware lookups** — the surrounding paragraph is sent to your AI provider (if configured) so polysemes resolve to the meaning that fits *how the word is used*.
- **Universal pronunciation** — recorded native-speaker audio when the source has it, Web Speech TTS for everything else. Click the speaker next to the title.
- **Optional modifier-key gate** — set to Alt / Ctrl / Shift in the popup so the lookup only fires when you're actually asking for it, not on every accidental double-click.

### Translation
- **Right-click → Translate selection** with the target language picked in the popup (17 common languages).
- **Context-aware** — the surrounding paragraph is passed to the AI provider so idioms, polysemes, and pronoun referents resolve correctly. *"Bite the bullet"* won't translate literally.
- **Free-tier fallback** — when no AI key is configured, translation routes through MyMemory's free API (~5000 anon chars/day).

### Summaries
- **Ctrl+K → Summarize Page** or **right-click → Summarize selection**.
- **Bullets or prose** style toggle in the popup.
- **Read-time estimate** of the original text shown alongside the summary.
- Works offline via a local TF-IDF extractive algorithm; AI providers (Gemini, OpenAI, or any custom endpoint) upgrade quality automatically when configured.

### Chat with the Page
- **Ctrl+K → type a question ending in `?`** (or prefix with `ask `) to query the current article.
- Strictly grounded in the page text — the prompt forbids the model from inventing or using outside knowledge.
- AI-key required for this feature; falls back with an explicit message if missing.

### Knowledge Vault
- **Bookmark icon** in every overlay saves the current definition, summary, or translation.
- **Saved panel in the popup** shows your latest items with one-click delete and links back to the original page.
- **Export to CSV or Markdown** — keep your data, take it anywhere.
- Capped at 500 items LRU; everything stays in `chrome.storage.local` (no account, no cloud).

### Command Palette (Ctrl+K)
- Summarize the current page.
- Ask the page a question.
- Define an arbitrary word without selecting it on the page.
- Recent commands and definitions are prioritized.

### Overlay Ergonomics
- **Drag** any overlay by its header to reposition it.
- **Pin** the current overlay so the next lookup opens a fresh one alongside — useful for comparing definitions or translations side by side.
- **Inline session highlights** mark every occurrence of a looked-up term on the page (cleared on reload, no storage cost).
- **Shadow DOM isolation** — InfoBlend's UI cannot break page styles, and page styles cannot break InfoBlend.

### Settings
- **Per-site disable list** — silence the extension on hostnames where you don't want it (Slack, Google Docs, etc). Subdomain-aware.
- **Custom accent color** — five swatches, applied to popup, palette, and overlay consistently.
- **Light / Dark / Auto theme** that follows your OS preference when set to Auto.
- **Cross-device sync** — preferences sync via `chrome.storage.sync`; the encrypted AI key stays local-only by design.

---

## Install

### Chrome / Edge / Brave

1. Clone the repo:
   ```bash
   git clone https://github.com/RIxiV1/InfoBlend.git
   ```
2. Open `chrome://extensions` (or `edge://extensions`, `brave://extensions`).
3. Enable **Developer mode** (toggle in top right).
4. Click **Load unpacked** and select the cloned folder.
5. Double-click any word on any page.

### Firefox

1. Open `about:debugging` → This Firefox → Load Temporary Add-on.
2. Select the `manifest.json` file from the cloned folder.
3. The extension stays active until Firefox restarts.

> Firefox support uses `browser_specific_settings.gecko.id`. Some APIs (`Intl.Segmenter` in particular) are polyfilled where missing.

---

## Optional: AI-Powered Results

InfoBlend works fully without an API key. Adding one unlocks:

- Context-aware definitions (the surrounding sentence becomes part of the prompt)
- Idiom-preserving translations
- Higher-quality summaries (your choice of bullets or prose)
- Chat with the Page

To enable AI:

1. Click the InfoBlend icon in the toolbar.
2. Expand **AI Engine** and select your provider.
3. Paste your API key and endpoint.
4. Click **Test connection** to verify it works — settings auto-save.

| Provider | Endpoint |
|----------|----------|
| **Gemini** | `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent` |
| **OpenAI** | `https://api.openai.com/v1/chat/completions` |
| **Custom** | Any endpoint that accepts `{ prompt, max_tokens }` |

If the AI call fails, InfoBlend transparently falls back to its non-AI path (with a *"falling back…"* indicator on summaries).

---

## Definition Sources

Each source is tried in order until one succeeds. Single words and multi-word phrases use different orderings; Urban Dictionary is the universal slang catch-all at the end of every chain.

| Source | What it provides | Best for |
|--------|------------------|----------|
| **Dictionary API** | Phonetics, audio, parts of speech, definitions, examples, synonyms | Common English words |
| **Datamuse** | Definitions + parallel synonyms + word frequency | Technical terms, fills in CEFR badges |
| **Wiktionary** | Encyclopedic definitions | Rare words, multi-language |
| **Wikipedia** | Three-sentence summary + thumbnail | Proper nouns, concepts |
| **Wikipedia Search** | Full-text search fallback for phrases | Phrases that aren't exact page titles |
| **Urban Dictionary** | Top community-rated definition | Slang, memes, neologisms |

Single-word lookups also fetch Wikipedia thumbnails and Datamuse frequency in parallel so the overlay can show an image and difficulty badge alongside the dictionary entry.

---

## Project Structure

```
infoblend/
├── manifest.json                  MV3 manifest (Chrome + Firefox)
├── contentScript.js               Bootstrap: events, context extraction, per-site disable
├── background.js                  Service worker: routing, validation, AI dispatch
│
├── modules/
│   ├── core.js                    Shadow DOM host, text highlighting, BentoRenderer
│   ├── article.js                 Readability-inspired page-prose extraction
│   ├── tts.js                     Web Speech API wrapper (universal pronunciation)
│   ├── highlights.js              Session-persistent in-page term highlights
│   ├── toast.js                   One-time discoverability toasts (e.g. Ctrl+K hint)
│   ├── overlay.js                 Tooltip + panel: definitions, summaries, vault, pin, drag
│   └── palette.js                 Ctrl+K command palette (summarize, define, ask)
│
├── utils/
│   ├── api.js                     Definition chain + AI + MyMemory translation
│   ├── summarizer.js              Local extractive summarizer (TF-IDF + U-curve)
│   ├── constants.js               Shared message-type constants
│   ├── encryption.js              AES-GCM encryption for the API key
│   ├── storage.js                 Split storage helper (sync for prefs, local for secrets)
│   ├── accent.js                  Hex → CSS variable derivation for custom accents
│   ├── compat.js                  Cross-browser shims (browser → chrome)
│   └── errors.js                  Error → user-friendly message translation
│
├── styles/content.css             Overlay, tooltip, tags, animations
├── overlay/overlay.css            Command palette styles
│
├── popup/
│   ├── popup.html                 Settings UI + Saved Vault + onboarding modal
│   ├── popup.js                   Settings logic, vault rendering, exports
│   └── popup.css                  Popup styles (light + dark via body.ib-light)
│
├── _locales/en/messages.json      i18n string catalog
├── icons/                         16/48/128 px PNG icons
│
├── tests/                         52 tests (Node.js built-in runner)
├── eslint.config.js               ESLint flat config
├── .github/
│   ├── ISSUE_TEMPLATE/feedback.md
│   └── workflows/ci.yml           CI: lint + test on Node 20 & 22
└── package.json                   Scripts only, zero dependencies
```

---

## Permissions

| Permission | Why |
|------------|-----|
| `storage` | Settings, definition cache, encrypted API key, saved vault |
| `activeTab` | Read the current tab for page summarization and Q&A |
| `contextMenus` | Right-click menu items (Define / Translate / Summarize) |
| `alarms` | Periodic cache cleanup (every 6 hours) |

Host permissions are **not** declared — InfoBlend uses `activeTab` only, which is granted per-interaction. Outbound network requests go to the public APIs above and (optionally) your configured AI endpoint.

---

## Browser Compatibility

| Feature | Chrome | Edge | Firefox |
|---------|--------|------|---------|
| Definitions, translations, summaries | ✅ | ✅ | ✅ |
| Ctrl+K palette + Chat with the Page | ✅ | ✅ | ✅ |
| TTS pronunciation | ✅ | ✅ | ✅ |
| Shadow DOM isolation | ✅ | ✅ | ✅ |
| `chrome.storage.sync` | ✅ | ✅ | ✅ |
| AES-GCM encryption | ✅ | ✅ | ✅ |
| `Intl.Segmenter` (summarizer) | ✅ (87+) | ✅ (87+) | ⚠️ regex fallback |

---

## Tests

```bash
npm test         # 52 tests, Node 20+
npm run lint     # ESLint flat config
```

CI runs both on every push/PR via GitHub Actions (Node 20 + 22).

---

## Privacy

- **No telemetry.** Nothing is reported back to any server we control. The only network requests are to the dictionary/translation APIs and (if configured) your AI endpoint.
- **API keys are encrypted** at rest with AES-GCM (PBKDF2-derived key, 600k iterations). The encryption salt is generated per-device and never syncs.
- **The Saved Vault stays local** — `chrome.storage.local` only, never `sync`, no account, no export unless you click Export.
- **Per-site disable list** lets you silence InfoBlend on sensitive hostnames entirely.

---

## Feedback

Found a bug? Have a feature request? Hit the **Feedback** link in the popup footer or [open an issue](https://github.com/RIxiV1/InfoBlend/issues/new?template=feedback.md) directly.

---

## License

MIT
