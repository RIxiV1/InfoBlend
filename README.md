# InfoBlend AI v2.0

InfoBlend AI is a high-performance Chrome Extension for intelligent web augmentation. Built on Manifest V3, it delivers a suite of tools for content summarization, semantic analysis, and privacy-focused browsing through a premium, isolated Shadow DOM interface.

> [!IMPORTANT]
> **Latest Update**: Introduced the **Modular Bento Dashboard** with interactive "Flashlight" effects, Ironclad XSS protection, and optimized CSS caching.

## 🚀 Key Features

### 🍱 Modular Bento Dashboard
The extension UI is now composed of a modular Bento-style layout. Each summary fragment is isolated into high-contrast cards for maximum readability.
- **Flashlight Interaction**: Hover-reactive radial highlights on bento cards.
- **Glassmorphism**: 12px backdrop blur with obsidian-dark and warm-light themes.
- **Total Isolation**: Shadow DOM architecture prevents host-page style leakage.

### 🧠 Intelligent Summarization
A hybrid engine that combines local density-based extraction with multi-provider AI support (Gemini, OpenAI, etc.).
- **Page Context Extraction**: Sophisticated article scraping with boilerplate removal.
- **YouTube Insight**: Instant transcript summarization for video content.
- **Local Fallback**: High-speed extractive summarization when AI is unavailable.

### 🛡️ Ironclad Security & Performance
- **XSS Protection**: All dynamic content is injected via `textContent` and safe DOM manipulation, eliminating the risk of injection attacks.
- **Performance Caching**: Stylesheets are cached in memory after the first load to ensure instantaneous UI response.
- **Lean Architecture**: Zero-bloat codebase with decoupled site-specific logic (Fully site-agnostic).

### 🔇 Privacy-First Ad Blocking
Leveraging the `declarativeNetRequest` API to block ad networks and trackers at the browser level for a faster, cleaner experience.

## 🛠️ Technical Foundation

- **Manifest V3**: Compliant with the latest security and performance standards.
- **Modular JS**: Decoupled helpers for storage, API, and summarization.
- **Shadow DOM**: Encapsulated UI state using inlined `SHADOW_STYLES` for CSP resilience.
- **Multi-AI Adapter**: Built-in support for multiple LLM providers with customizable prompt engineering.

## 📦 Installation

1. Clone or download this repository.
2. Open `chrome://extensions/` in your browser.
3. Enable **Developer Mode**.
4. Click **Load unpacked** and select the project root folder.

## 📂 Project Structure

- `background.js`: Service worker for background coordination and messaging.
- `contentScript.js`: Core logic for scraping, UI injection, and event handling.
- `popup/`: Settings interface and summary history management.
- `utils/`: 
  - `api.js`: Unified AI/Dictionary adapter.
  - `storage.js`: Secure storage wrappers.
  - `summarizer.js`: Local extraction engine.
  - `youtubeInsight.js`: Transcript processing logic.
- `overlay/`: Style definitions and UI tokens.

## 🔐 Permissions

- `storage`: Local persistence for settings and history.
- `declarativeNetRequest`: High-performance ad-blocking engine.
- `activeTab`: Just-in-time permission for current page interaction.
- `contextMenus`: Right-click integration for definitions and summaries.
- `scripting`: Dynamic content script injection for UI overlays.

---
*Developed for performance, privacy, and insight.*

