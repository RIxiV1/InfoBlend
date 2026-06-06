# InfoBlend — Privacy Policy

InfoBlend is a browser extension that helps users understand web content via definitions, translations, summaries, and a Saved Vault.

## What we collect

**Nothing.** InfoBlend has no servers we operate, no analytics, no telemetry, and no user accounts. We never see your browsing history, the text you select, or the words you save.

## What InfoBlend sends, and to whom

- **Definitions:** the word or phrase you look up is sent to one or more of these public APIs: [Dictionary API](https://dictionaryapi.dev/), [Datamuse](https://www.datamuse.com/api/), [Wiktionary](https://en.wiktionary.org/api/rest_v1/), [Wikipedia](https://en.wikipedia.org/api/rest_v1/), and [Urban Dictionary](https://api.urbandictionary.com/). These services log API requests per their own privacy policies; InfoBlend does not add identifiers.
- **Translation:** when no AI key is configured, selections are sent to [MyMemory](https://mymemory.translated.net/) for translation, subject to their privacy policy.
- **AI features (optional):** if you configure an AI key in the popup, your selections and questions are sent directly from your browser to the endpoint you specified — Google's Generative Language API, OpenAI's Chat Completions API, or a custom endpoint of your choosing. InfoBlend is not a relay or middleman.
- **No third-party advertising, fingerprinting, or analytics SDKs.**

## What InfoBlend stores locally

- **Your settings** (theme, accent color, target language, etc.) in `chrome.storage.sync`, which Chrome replicates across your signed-in browsers.
- **Your Saved Vault, definition cache, and AI key** in `chrome.storage.local`, which stays on the device. Your AI key is encrypted at rest with AES-GCM (PBKDF2-derived key, 600k iterations).

## Per-site disable

You can list hostnames in the popup to silence InfoBlend on those sites entirely — no scripts run, no requests are made.

## Data export and deletion

The Saved Vault includes a one-click CSV and Markdown export. Removing the extension deletes everything stored locally.

## Contact

Open an issue at [github.com/RIxiV1/InfoBlend/issues](https://github.com/RIxiV1/InfoBlend/issues).
