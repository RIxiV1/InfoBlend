# InfoBlend AI

<div align="center">
  <img src="icons/icon128.png" width="128" height="128" alt="InfoBlend AI Logo">
  <h3>The Ultimate Web Augmentation Extension</h3>
  <p>Manifest V3 • High Performance • Privacy First</p>
</div>

---

InfoBlend AI is a premium browser extension designed for high-speed information synthesis. It empowers users with intelligent page summarization, semantic word analysis, and a sophisticated command-driven interface, all while maintaining absolute UI isolation via Shadow DOM.

## 🚀 Recent Core Advancements

### ⌨️ Floating Command Palette (`Ctrl + K`)
The fastest way to interact with the web. Launch the palette to execute commands or define terms instantly.
- **Self-Adaptive Focus**: Input is focused immediately upon opening.
- **Interactive Navigation**: Smooth keyboard-driven selection with `↑↓` keys and `Enter`.
- **Intelligent Fallbacks**: Typing any word that isn't a command automatically offers a **Smart Definition**.

### 🧪 Advanced Definition Fallback Chain
We've implemented a robust, multi-stage fallback logic to ensure you're never without an answer:
1.  **Primary**: *Free Dictionary API* (Standard English).
2.  **Fallback 1**: *Datamuse API* (Slang and technical terms).
3.  **Fallback 2**: *Wiktionary API* (Rich etymological and dictionary data).
4.  **Fallback 3**: *Wikipedia API* (Concise first-sentence summaries for people/places).
5.  **Safety Net**: Direct search link to **Merriam-Webster** if no automated match is found.

### 🍱 Premium Bento Dashboard
Information is rendered into beautiful, hover-reactive card layouts.
- **Modular Summarization**: Hybrid local/AI extraction for page and YouTube content.
- **Insight Cards**: Break down complex text into digestible "insights".
- **Dynamic Flashlight**: Micro-animations and radial highlights that follow your mouse for a premium feel.

### 🛡️ Shadow DOM Isolation (Ironclad)
- **Theme Resilience**: Uses `color-scheme: only light` to ensure the UI remains high-contrast even on sites forced into dark mode by extensions like *Dark Reader*.
- **Style Encapsulation**: Zero bleed-through from host page CSS, ensuring InfoBlend looks perfect every time.
- **Z-Index Superiority**: Guaranteed to stay on top of any website layout.

## 🛠️ Built for Performance

- **Manifest V3 Architecture**: Lean service workers and declarative ad-blocking.
- **Multi-AI Adapter**: Seamlessly switch between Gemini, OpenAI, and local summarization.
- **XSS Protection**: All data injection is sanitized via `textContent`, making it 100% resilient to injection attacks.
- **Declarative Net Request**: Blazing fast ad and tracker blocking at the core level.

## 📂 Installation

1.  **Clone** the repository.
2.  Navigate to `chrome://extensions/` in your browser.
3.  Enable **Developer Mode**.
4.  Click **Load unpacked** and select the extension folder.

## 🔒 Permissions

- `storage`: Persistence for settings and summary history.
- `declarativeNetRequest`: High-performance ad-blocking.
- `activeTab`: Just-in-time permission for interactions.
- `contextMenus`: Right-click power tools for definitions.

---
*Created for those who value speed, privacy, and insight.*
