# InfoBlend AI

InfoBlend AI is a sophisticated Chrome Extension designed for intelligent web augmentation. Built on Manifest V3, it provides a suite of tools for information retrieval, content summarization, and task automation, all delivered through a premium, isolated user interface.

> [!NOTE]
> **What's New in V3**: Enhanced "Ultra-Glass" UI, improved extractive summarization, and privacy-focused ad blocking.

## Core Intelligence

### Intelligent Summarization
InfoBlend AI features a frequency-based extractive summarization algorithm that analyzes document density to surface the most relevant context clusters.
- **Page Summarization**: Extract key insights from an entire document with a single click.
- **Selection Summarization**: Target specific text blocks for instant summarization via the context menu.
- **AI Intelligence (Alpha)**: Supports integration with large language models (Gemini/Vertex) for human-like explanations and deep insights when an API key is provided.

### Smart Semantic Highlights
The extension automatically identifies and highlights key technical terms, proper nouns, and entities within summaries and definitions. This system uses a tag-safe parser to ensure seamless integration without interfering with host page styles.

### Instant Definitions
Select any single word to trigger an automatic information overlay. The system prioritizes high-quality dictionary entries with a Wikipedia fallback to ensure comprehensive coverage.

## Platform Features

### Privacy-First Ad Blocking
Leveraging the `declarativeNetRequest` API, InfoBlend AI blocks common ad networks and tracking scripts at the browser level, ensuring a faster and cleaner browsing experience without compromising privacy.

### Smart Form Automation
Securely manage contact profiles to automate repetitive form entries. The system intelligently maps field attributes to your encrypted local data for seamless auto-completion.

### Ultra-Glass Interface
The user interface utilizes a high-performance Shadow DOM architecture, ensuring total isolation from host page styles. The design features a premium "Ultra-Glass" aesthetic with 40px backdrop blurs, luminous borders, and smooth slide-up animations.

## Technical Foundation

- **Manifest V3**: Compliant with the latest Chrome extension standards for security and performance.
- **Shadow DOM Isolation**: Prevents style leakage between the extension UI and the host website.
- **Service Worker Architecture**: High-efficiency background processing for API communication and state management.

## Installation

1. Download or clone this repository to your local directory.
2. Navigate to `chrome://extensions/` in Google Chrome.
3. Enable Developer Mode in the top right corner.
4. Click "Load unpacked" and select the `infoblend-ai` directory.

## Project Structure

- `background.js`: Service worker for background logic and context menu management.
- `contentScript.js`: Core logic for page interaction, selection triggers, and UI injection.
- `popup/`: Extension configuration interface and settings management.
- `overlay/`: Style definitions for the isolated Shadow DOM overlay.
- `utils/`: Modular utilities for API communication, storage, and summarization.
- `rules/`: Static rulesets for the ad-blocking engine.

## Permissions

- **storage**: Local persistence of user configurations and profiles.
- **declarativeNetRequest**: High-performance ad blocking.
- **activeTab**: Permission to interact with the current document upon user trigger.
- **contextMenus**: Integration of deep-dive tools into the browser's right-click interface.
- **host_permissions**: Facilitates communication with Dictionary and Wikipedia APIs.

---
Developed by the InfoBlend AI Team.
