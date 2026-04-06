# 🌌 InfoBlend AI

<div align="center">
  <img src="icons/icon128.png" width="128" height="128" alt="InfoBlend AI Logo">
  <h3>Smart Web Augmentation</h3>
  <p>Manifest V3 • High Performance • Privacy First</p>
  
  [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
  [![Platform: Chrome](https://img.shields.io/badge/Platform-Chrome-blue.svg)](https://google.com/chrome)
</div>

---

**InfoBlend AI** is a premium browser extension designed for high-speed information synthesis. It empowers users with intelligent page summarization, semantic word analysis, and a sophisticated command-driven interface, all while maintaining absolute UI isolation via Shadow DOM.

## ✨ Core Features

### ⌨️ Command Palette (`Ctrl + K`)
The fastest way to interact with the web. Launch the palette to execute commands or define terms instantly.
- **Self-Adaptive Focus**: Input is focused immediately upon opening.
- **Interactive Navigation**: Keyboard-driven selection with `↑↓` and `Enter`.
- **Intelligent Fallbacks**: Automatic **Smart Definitions** for any term.

### 🍱 Bento Dashboard
Information is rendered into beautiful, hover-reactive card layouts.
- **Modular Summarization**: Hybrid local/AI extraction for page and YouTube content.
- **Insight Cards**: Break down complex text into digestible "insights".
- **Dynamic Flashlight**: Micro-animations and radial highlights that follow your mouse.

### 🧪 Smart Fallback Chain
We ensure you're never without an answer with our multi-stage definition logic:
1. **Dictionary API** (Standard)
2. **Datamuse** (Technical/Slang)
3. **Wiktionary** (Detailed)
4. **Wikipedia** (Contextual)

## 📦 Installation & Browser Support

### **Universal Browser Support (Chrome, Firefox, Brave, etc.)**
- InfoBlend AI now uses a single, unified `manifest.json` for all modern browsers.
1.  **Direct Load**:
    - Open your browser's extensions page (`chrome://extensions/` or `about:debugging`).
    - Enable **Developer Mode**.
    - Click **Load unpacked** and select this repository folder.

### ⚙️ Bring Your Own Key (BYOK)
To unlock AI-summaries and deep insights:
1. Click the InfoBlend icon -> Select your provider (**Google Gemini**, **OpenAI**, etc.).
2. Enter your **API Key** and **Endpoint URL**.
3. Click **Save Changes**.

> [!TIP]
> **Recommended Gemini Endpoint**: `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=YOUR_KEY`

## 🛡️ Privacy & Isolation
- **Shadow DOM**: Zero style bleed-through from host pages.
- **Local-First**: Summaries are processed locally if no AI key is provided.
- **Security**: Data injection is sanitized via `textContent` to prevent XSS.

## 🐛 Troubleshooting
- **Refresh Required**: Refresh any tabs opened *before* extension installation.
- **Restricted Pages**: Browsers block extensions on internal pages (`chrome://`) and stores.

---
*Crafted for those who value speed, privacy, and insight.*
