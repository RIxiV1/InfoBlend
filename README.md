# InfoBlend AI – Smart Web Augmentation Extension

InfoBlend AI is a production-ready Chrome Extension (Manifest V3) that enhances your browsing experience with intelligent tools for information retrieval, content summarization, ad blocking, and form automation.

## 🚀 Features

- **Text Selection Definition**: Select any word or short phrase to instantly see its definition in a floating, draggable overlay. Uses the Free Dictionary API with a Wikipedia fallback.
- **Page Summarizer**: Generate a concise summary of the current page using an extractive summarization algorithm.
- **Ad Blocking**: Built-in ad blocking using the `declarativeNetRequest` API to block common ad networks and tracking scripts.
- **Form Auto-fill**: Securely store your contact information and automatically fill out web forms.
- **Modern UI**: A clean, draggable overlay that supports both light and dark modes.

## 🛠 Installation

1.  **Download or Clone** this repository to your local machine.
2.  Open Google Chrome and navigate to `chrome://extensions/`.
3.  Enable **Developer mode** by toggling the switch in the top right corner.
4.  Click the **Load unpacked** button.
5.  Select the `infoblend-ai` folder.

## 📂 Project Structure

```text
infoblend-ai/
├── manifest.json         # Extension configuration (MV3)
├── background.js        # Service worker for background tasks
├── contentScript.js     # Injected script for page interaction
├── popup/               # Extension popup UI and logic
│   ├── popup.html
│   ├── popup.js
│   └── popup.css
├── overlay/             # Injected overlay UI and styles
│   ├── overlay.css
├── utils/               # Modular utility functions
│   ├── api.js           # API communication
│   ├── storage.js       # Chrome Storage wrapper
│   ├── summarizer.js    # Text summarization logic
├── rules/               # Ad-blocking rules
│   └── adblockRules.json
└── icons/               # Extension icons
```

## 🧪 Testing Instructions

### 1. Text Definition
- Navigate to any website (e.g., [Wikipedia](https://en.wikipedia.org)).
- Select a word (e.g., "Technology").
- A floating overlay will appear with the definition.
- Alternatively, right-click a selection and choose **"Define with InfoBlend"**.

### 2. Page Summarizer
- Open the extension popup by clicking the InfoBlend icon in the toolbar.
- Click the **"Summarize Current Page"** button.
- The popup will close, and a summary overlay will appear on the page.

### 3. Ad Blocking
- Visit a site known for ads.
- Open Chrome DevTools (`F12`) -> **Network** tab.
- Filter for "doubleclick" or "googlesyndication". You should see these requests blocked by the extension.

### 4. Form Auto-fill
- Open the extension popup.
- Enter your name, email, and phone number, then click **"Save Settings"**.
- Navigate to a website with a contact form.
- The extension will automatically attempt to fill in the fields.

## 🔐 Security & Permissions

- **storage**: Used to save user settings and auto-fill data locally.
- **declarativeNetRequest**: Used for high-performance, privacy-preserving ad blocking.
- **activeTab**: Allows the extension to interact with the current page when triggered.
- **contextMenus**: Adds the "Define with InfoBlend" option to the right-click menu.
- **host_permissions**: Required to fetch data from the Dictionary and Wikipedia APIs.

---
Built with ❤️ by InfoBlend AI Team.
