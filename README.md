# InfoBlend AI

<div align="center">
  <img src="icons/icon128.png" width="128" height="128" alt="InfoBlend AI Logo">
  <h3>A browser extension for smarter browsing</h3>
  <p>Manifest V3 · Privacy-focused · Lightweight</p>
</div>

---

InfoBlend AI is a browser extension that helps you get more out of any webpage. It can summarize articles, look up word definitions, and gives you a quick command interface so you spend less time digging and more time reading.

## What's New

### ⌘ Command Palette (`Ctrl + K`)
Hit `Ctrl + K` from any page to open the command palette. You can run commands or look up a word without touching your mouse.
- The input is focused as soon as the palette opens.
- Use the arrow keys to move through results and `Enter` to select.
- If you type something that isn't a command, it'll try to find a definition for it automatically.

### 📖 Word Definitions (with fallbacks)
Looking up a word goes through several sources in order, so you're rarely left without an answer:
1. **Free Dictionary API** — standard English definitions.
2. **Datamuse API** — good for slang and technical terms.
3. **Wiktionary API** — broader coverage including etymology.
4. **Wikipedia API** — useful for names, places, and concepts.
5. **Merriam-Webster** — a direct search link if nothing else works.

### 🗂 Bento Dashboard
The main UI lays out information as a grid of cards.
- Summaries work for both regular pages and YouTube videos, using a mix of local and AI-based extraction.
- Long text gets broken into smaller insight cards so it's easier to skim.
- There's a subtle mouse-following highlight effect on the cards.

### 🧱 Shadow DOM
The extension UI is fully isolated from the host page using Shadow DOM, which means:
- It stays readable even on pages that have dark mode extensions applied.
- The host page's CSS can't interfere with InfoBlend's styles.
- It renders on top of other page content reliably.

## Under the Hood

- **Manifest V3** — uses service workers and declarative rules instead of background scripts.
- **Multi-AI support** — you can switch between Gemini, OpenAI, or local summarization from the settings.
- **XSS-safe** — content is injected using `textContent`, not `innerHTML`, so user data can't break the UI.
- **Declarative Net Request** — ad and tracker blocking that runs at the browser level without needing to read page content.

## Installation

### Chrome, Edge, Brave, and other Chromium browsers
1. Open the extensions page (`chrome://extensions/` or `edge://extensions/`).
2. Turn on **Developer Mode**.
3. Click **Load unpacked** and point it at this folder.

### Firefox
1. Make a copy of `manifest.json`, then replace it with `manifest.firefox.json` renamed to `manifest.json`.
2. Open `about:debugging` in Firefox.
3. Click **This Firefox** → **Load Temporary Add-on...** and select the `manifest.json`.

> A build script to handle the manifest swap automatically is planned.

## Permissions

- `storage` — saves your settings and summary history locally.
- `declarativeNetRequest` — needed for ad blocking.
- `activeTab` — only requests access to the current tab when you interact with it.
- `contextMenus` — adds a right-click option to look up selected text.

---
*Built for people who read a lot online and want a little help keeping up.*
