/**
 * Definition + AI API adapters.
 * Single words: Dictionary → Datamuse → Wiktionary → Wikipedia
 * Compound terms (2+ words): Wikipedia → Wiktionary → Dictionary → Datamuse
 */
import { fetchWithTimeout } from './compat.js';

// --- LRU Definition Cache (in-memory + storage persistence) ---
const CACHE_KEY = 'ib_def_cache';
const CACHE_MAX = 200;
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days
let _memCache = null; // loaded lazily from storage on first access
let _loadPromise = null; // prevents concurrent loadCache() races
let _flushPending = false; // coalesces rapid flush calls

async function loadCache() {
  if (_memCache) return _memCache;
  if (_loadPromise) return _loadPromise;
  _loadPromise = (async () => {
    try {
      const result = await chrome.storage.local.get([CACHE_KEY]);
      _memCache = result[CACHE_KEY] || [];
    } catch {
      _memCache = [];
    }
    _loadPromise = null;
    return _memCache;
  })();
  return _loadPromise;
}

async function flushCache() {
  if (_flushPending) return;
  _flushPending = true;
  // Microtask delay coalesces multiple synchronous mutations into one write
  await Promise.resolve();
  _flushPending = false;
  try { await chrome.storage.local.set({ [CACHE_KEY]: _memCache }); }
  catch { /* storage unavailable */ }
}

async function getCachedDefinition(term) {
  const cache = await loadCache();
  const key = term.toLowerCase();
  const idx = cache.findIndex(e => e.term === key);
  if (idx < 0) return null;

  const [entry] = cache.splice(idx, 1);

  // Evict expired entries
  if (entry.ts && Date.now() - entry.ts > CACHE_TTL) {
    await flushCache();
    return null;
  }

  // Move to front (most recently used)
  cache.unshift(entry);
  await flushCache();
  return entry.data;
}

async function cacheDefinition(term, data) {
  const cache = await loadCache();
  const key = term.toLowerCase();
  const idx = cache.findIndex(e => e.term === key);
  if (idx >= 0) cache.splice(idx, 1);
  cache.unshift({ term: key, data, ts: Date.now() });
  if (cache.length > CACHE_MAX) cache.length = CACHE_MAX;
  await flushCache();
}

/** Evicts expired entries and trims cache. Called periodically from background. */
export async function cleanupCache() {
  try {
    const cache = await loadCache();
    const now = Date.now();
    const before = cache.length;
    for (let i = cache.length - 1; i >= 0; i--) {
      if (cache[i].ts && now - cache[i].ts > CACHE_TTL) cache.splice(i, 1);
    }
    if (cache.length !== before) await flushCache();
  } catch { /* non-critical maintenance task */ }
}

// --- Individual API fetchers ---

/**
 * Datamuse returns word-frequency tags like "f:23.45" — occurrences per
 * million words in a reference corpus. The CEFR mapping below is a rough
 * heuristic widely used in vocabulary tooling; it's a guide, not a guarantee.
 */
function cefrFromFrequency(f) {
  if (f == null || isNaN(f)) return null;
  if (f >= 80) return { level: 'A1', label: 'very common' };
  if (f >= 20) return { level: 'A2', label: 'common' };
  if (f >= 5)  return { level: 'B1', label: 'intermediate' };
  if (f >= 1)  return { level: 'B2', label: 'upper intermediate' };
  if (f >= 0.2) return { level: 'C1', label: 'advanced' };
  return { level: 'C2', label: 'rare' };
}

async function fetchFrequency(term) {
  try {
    const resp = await fetch(`https://api.datamuse.com/words?sp=${encodeURIComponent(term)}&qe=sp&md=f&max=1`);
    if (!resp.ok) return null;
    const data = await resp.json();
    const tags = data?.[0]?.tags || [];
    const fTag = tags.find(t => typeof t === 'string' && t.startsWith('f:'));
    if (!fTag) return null;
    const f = parseFloat(fTag.slice(2));
    return isNaN(f) ? null : f;
  } catch { return null; }
}

/**
 * Best-effort Wikipedia thumbnail for the term. Returns null on any failure
 * or for disambiguation pages (which would return a generic disambig image
 * unrelated to the word). The plain-text Wikipedia path already gets a
 * thumbnail directly; this is the parallel fetch for the rich-definition
 * path so dictionary words can show an image too.
 */
async function fetchWikiThumbnail(term) {
  try {
    const resp = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(term)}`);
    if (!resp.ok) return null;
    const data = await resp.json();
    if (data.type === 'disambiguation' || data.type === 'no-extract') return null;
    return data.thumbnail?.source || null;
  } catch { return null; }
}

async function tryDictionary(term) {
  // Parallel: dict definition + word frequency + Wikipedia thumbnail. The
  // last two are non-blocking — if either fails, the definition still ships.
  // Wall-clock latency = slowest of the three (usually the dict call).
  const [resp, freq, thumbnail] = await Promise.all([
    fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(term)}`),
    fetchFrequency(term),
    fetchWikiThumbnail(term)
  ]);
  if (!resp.ok) return null;
  const data = await resp.json();
  const entry = data?.[0];
  if (!entry?.meanings?.length) return null;

  const phonetic = entry.phonetic || entry.phonetics?.find(p => p.text)?.text || '';
  const audioUrl = entry.phonetics?.find(p => p.audio && p.audio.length > 0)?.audio || '';

  return {
    title: entry.word,
    phonetic,
    audioUrl,
    freq,
    cefr: cefrFromFrequency(freq),
    thumbnail,
    meanings: entry.meanings.slice(0, 4).map(m => ({
      partOfSpeech: m.partOfSpeech,
      definitions: m.definitions.slice(0, 3).map(d => ({
        text: d.definition,
        example: d.example || null
      })),
      synonyms: (m.synonyms || []).slice(0, 5)
    })),
    synonyms: entry.meanings.flatMap(m => m.synonyms || []).slice(0, 8),
    source: 'Dictionary API',
    isRich: true
  };
}

async function tryDatamuse(term) {
  // Fetch definition + synonyms in parallel (antonyms previously fetched
  // here too, but they're no longer displayed — dropping the request saves
  // one network call per definition).
  const [defResp, synResp] = await Promise.all([
    fetch(`https://api.datamuse.com/words?sp=${encodeURIComponent(term)}&qe=sp&md=d,p,f&max=1`),
    fetch(`https://api.datamuse.com/words?rel_syn=${encodeURIComponent(term)}&max=6`)
  ]);

  if (!defResp.ok) return null;
  const data = await defResp.json();
  if (!data?.[0]?.defs?.length || data[0].word?.toLowerCase() !== term.toLowerCase()) return null;

  const synData = synResp.ok ? await synResp.json() : [];

  const entry = data[0];
  const fTag = (entry.tags || []).find(t => typeof t === 'string' && t.startsWith('f:'));
  const freq = fTag ? parseFloat(fTag.slice(2)) : null;
  return {
    title: term,
    freq: isNaN(freq) ? null : freq,
    cefr: cefrFromFrequency(freq),
    meanings: entry.defs.slice(0, 4).map(d => {
      const [pos, ...rest] = d.split('\t');
      return { partOfSpeech: pos, definitions: [{ text: rest.join('\t') }] };
    }),
    synonyms: synData.map(w => w.word).slice(0, 8),
    source: 'Datamuse',
    isRich: true
  };
}

async function tryWiktionary(term) {
  const resp = await fetch(`https://en.wiktionary.org/api/rest_v1/page/summary/${encodeURIComponent(term)}`);
  if (!resp.ok) return null;
  const data = await resp.json();
  if (!data.extract) return null;
  return { title: data.title || term, content: data.extract, source: 'Wiktionary' };
}

async function tryWikipedia(term) {
  const resp = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(term)}`);
  if (!resp.ok) return null;
  const data = await resp.json();
  if (!data.extract) return null;
  // Show up to 3 sentences for richer context (not just the first)
  const sentences = data.extract.match(/[^.!?]*[.!?]+/g) || [data.extract];
  const content = sentences.slice(0, 3).join(' ').trim();
  return {
    title: data.title || term,
    content,
    thumbnail: data.thumbnail?.source || null,
    source: 'Wikipedia'
  };
}

/**
 * For multi-word phrases that fail all APIs, try searching Wikipedia
 * with the full phrase as a search query instead of a direct page lookup.
 */
async function tryWikipediaSearch(term) {
  const resp = await fetch(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(term)}&srnamespace=0&srlimit=1&format=json&origin=*`);
  if (!resp.ok) return null;
  const data = await resp.json();
  const hit = data?.query?.search?.[0];
  if (!hit) return null;
  // Get the summary for the top search result
  return await tryWikipedia(hit.title);
}

/**
 * Urban Dictionary as a last-chance fallback for slang, neologisms, internet
 * memes, and other terms that conventional dictionaries don't index. Only
 * runs after every formal source whiffs. Top entry is the one with the best
 * thumbs ratio that also has reasonable engagement (>10 thumbs total). UD
 * definitions often contain [[wiki-link]] brackets — stripped to plain text.
 */
async function tryUrbanDictionary(term) {
  const resp = await fetch(`https://api.urbandictionary.com/v0/define?term=${encodeURIComponent(term)}`);
  if (!resp.ok) return null;
  const data = await resp.json();
  const list = Array.isArray(data?.list) ? data.list : [];
  if (!list.length) return null;
  // Filter to entries with at least minimal engagement so we don't surface
  // brand-new troll defs. Then sort by net score (up - down).
  const scored = list
    .filter(e => (e.thumbs_up + e.thumbs_down) >= 10)
    .sort((a, b) => (b.thumbs_up - b.thumbs_down) - (a.thumbs_up - a.thumbs_down));
  const pick = scored[0] || list[0]; // fall back to first if no entry meets threshold
  if (!pick?.definition) return null;
  const stripBrackets = (s) => String(s || '').replace(/\[([^\]]+)\]/g, '$1').trim();
  const definition = stripBrackets(pick.definition);
  const example = stripBrackets(pick.example);
  const content = example ? `${definition}\n\n${example}` : definition;
  return {
    title: pick.word || term,
    content,
    source: 'Urban Dictionary',
    // No CEFR for slang — frequency data is meaningless here.
  };
}

/**
 * Sentinel error thrown when MyMemory's free tier is exhausted for the day.
 * Background catches this and surfaces a clear message to the user instead
 * of failing silently. Use a custom class so AI-fallback paths can distinguish
 * "quota hit" from "service down".
 */
export class TranslationQuotaError extends Error {
  constructor(message = 'Free translation quota reached. Add an AI key for unlimited translations.') {
    super(message);
    this.name = 'TranslationQuotaError';
  }
}

/**
 * Free-tier translation fallback when the user hasn't configured an AI key.
 * MyMemory allows ~5000 anonymous chars/day per IP — fine for occasional use.
 * For idiomatic accuracy the AI path is always preferred; this exists so the
 * feature isn't dead for keyless users.
 *
 * @param {string} text - Text to translate (capped at 500 chars).
 * @param {string} targetLang - BCP-47 / ISO 639-1 code (e.g. 'es', 'fr', 'ja').
 * @param {string} [sourceLang='auto'] - Source code or 'auto' for detection.
 * @returns {Promise<{translated: string, detectedSource: string|null}|null>}
 *   The translated text + detected source language, or null when MyMemory
 *   couldn't translate. Throws TranslationQuotaError when the daily limit
 *   has been hit.
 */
export async function fetchMyMemoryTranslation(text, targetLang, sourceLang = 'auto') {
  const clipped = String(text || '').slice(0, 500);
  if (!clipped) return null;
  // MyMemory's free path uses langpair like "en|es"; "auto" works as source.
  const langpair = `${sourceLang || 'auto'}|${targetLang}`;
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(clipped)}&langpair=${encodeURIComponent(langpair)}`;
  try {
    const resp = await fetchWithTimeout(url, {}, 8000);
    // 429 from MyMemory directly indicates rate-limit.
    if (resp.status === 429) throw new TranslationQuotaError();
    if (!resp.ok) return null;
    const data = await resp.json();

    // MyMemory returns 200 with a quota-exhausted message in responseDetails.
    // The actual response status can be 200 or 403 depending on which limit
    // tripped (per-IP daily vs per-minute).
    const status = data?.responseStatus;
    const details = String(data?.responseDetails || '').toLowerCase();
    if (status === 403 || details.includes('quota') || details.includes('limit')) {
      throw new TranslationQuotaError();
    }

    const translated = data?.responseData?.translatedText;
    if (!translated || typeof translated !== 'string') return null;
    // MyMemory occasionally echoes the source verbatim when it can't translate
    // — guard against pretending we did something.
    if (translated.trim().toLowerCase() === clipped.trim().toLowerCase()) return null;

    // Detected source language lives in matches[].source on a successful
    // auto-detected translation. Take the first match.
    let detectedSource = null;
    const matches = Array.isArray(data?.matches) ? data.matches : [];
    if (matches.length && typeof matches[0]?.source === 'string') {
      detectedSource = matches[0].source.split('-')[0]; // strip region (en-US -> en)
    }
    return { translated: translated.trim(), detectedSource };
  } catch (e) {
    if (e instanceof TranslationQuotaError) throw e;
    return null;
  }
}

// --- Main definition fetcher ---

export const fetchDefinition = async (word) => {
  const term = word.trim();
  const wordCount = term.split(/\s+/).length;
  if (wordCount > 5) throw new Error('Selection too long for definition. Try summarizing instead.');

  // Check cache first
  const cached = await getCachedDefinition(term);
  if (cached) return { ...cached, term, fromCache: true };

  // Route based on word count:
  // Single words: Dictionary (rich) → Datamuse → Wiktionary → Wikipedia → Urban (slang catch-all)
  // Compound terms: Wikipedia → Wiktionary → Dictionary → Datamuse → Wikipedia Search → Urban
  const chain = wordCount === 1
    ? [tryDictionary, tryDatamuse, tryWiktionary, tryWikipedia, tryUrbanDictionary]
    : [tryWikipedia, tryWiktionary, tryDictionary, tryDatamuse, tryWikipediaSearch, tryUrbanDictionary];

  for (const fetcher of chain) {
    try {
      const result = await fetcher(term);
      if (result) {
        // For single words with rich definitions, enrich with Datamuse synonyms if missing
        if (wordCount === 1 && result.isRich && !result.synonyms?.length && fetcher !== tryDatamuse) {
          try {
            const synResp = await fetch(`https://api.datamuse.com/words?rel_syn=${encodeURIComponent(term)}&max=6`);
            if (synResp.ok) {
              const synData = await synResp.json();
              result.synonyms = synData.map(w => w.word).slice(0, 8);
            }
          } catch { /* non-critical */ }
        }
        // CEFR/frequency for plain-text paths (Wikipedia, Wiktionary, AI).
        // Single-word only — frequency is meaningless for multi-word phrases.
        if (wordCount === 1 && result.freq == null && fetcher !== tryDictionary && fetcher !== tryDatamuse) {
          const f = await fetchFrequency(term);
          if (f != null) {
            result.freq = f;
            result.cefr = cefrFromFrequency(f);
          }
        }
        // Stamp the user's original selection on every result so the overlay
        // can pronounce it via TTS regardless of which fetcher won. (Some
        // sources normalize casing — e.g. Wikipedia returns "Machine learning"
        // even when the user selected "machine learning".)
        result.term = term;
        await cacheDefinition(term, result);
        return result;
      }
    } catch { /* next in chain */ }
  }

  return {
    term,
    title: 'Not Found',
    content: `No definition found for "${term}".`,
    source: 'Merriam-Webster',
    isNotFound: true,
    url: `https://www.merriam-webster.com/dictionary/${encodeURIComponent(term)}`
  };
};

/**
 * AI request adapter. Supports Gemini, OpenAI, and generic endpoints.
 * Retries transient failures (429, 5xx, network errors) up to 2 times with exponential backoff.
 * @param {string} context - Optional surrounding text for context-aware definitions.
 */
// promptType: 'define' | 'summarize' | 'translate' | 'pageqa'
// For 'translate', pass the target language code (e.g. 'es', 'fr') in `extra`.
// For 'pageqa', pass the user's question in `extra`.
export const fetchAIResponse = async (text, endpoint, key, provider = 'gemini', promptType = 'define', context = '', summaryStyle = 'bullets', extra = '') => {
  if (!endpoint?.startsWith('http')) throw new Error('Invalid API Endpoint. Please check your settings.');

  const headers = { 'Content-Type': 'application/json' };
  let url = endpoint;

  if (provider === 'gemini' && key) {
    url += `${url.includes('?') ? '&' : '?'}key=${encodeURIComponent(key)}`;
  } else if (key) {
    headers['Authorization'] = `Bearer ${key}`;
  }

  let prompt;
  let maxTokens = 100;
  if (promptType === 'summarize') {
    // Bullets read fine for technical/listy content; prose flows better for
    // narrative articles. User picks via the popup; default is bullets.
    prompt = summaryStyle === 'prose'
      ? `Summarize the following text in a single concise paragraph of 3-4 sentences. Use flowing prose, not bullets or lists:\n\n${text.substring(0, 8000)}`
      : `Summarize the following text in 3-4 concise bullet points:\n\n${text.substring(0, 8000)}`;
    maxTokens = 300;
  } else if (promptType === 'translate') {
    // Context-aware translation: passing the surrounding paragraph lets the
    // model resolve idioms, polysemes ("bank" = riverbank vs financial), and
    // pronoun referents that context-free translators get wrong.
    const targetLang = String(extra || 'en');
    if (context) {
      prompt = `Translate "${text}" to ${targetLang}. The text appears in this context (do not translate the context, just use it to disambiguate): "${context.substring(0, 500)}". Preserve idioms and contextual meaning. Reply with ONLY the translation, no quotes or commentary.`;
    } else {
      prompt = `Translate "${text}" to ${targetLang}. Reply with ONLY the translation, no quotes or commentary.`;
    }
    maxTokens = 200;
  } else if (promptType === 'pageqa') {
    // Q&A over the current page. `text` is now PRE-CHUNKED and numbered by
    // the caller (background.js), so each passage carries an [N] marker the
    // model can cite back. Strict instruction to answer only from the
    // provided passages and to mark every claim with the source chunk index.
    const question = String(extra || '').trim();
    prompt = `Answer the question using ONLY the numbered passages below. Cite the passage you used by appending its number in square brackets, e.g. "...as the article notes [2]." If the answer isn't in the passages, say "The page doesn't address that" — do not invent or use outside knowledge.\n\nPASSAGES:\n${text}\n\nQUESTION: ${question}`;
    maxTokens = 500;
  } else if (context) {
    prompt = `Define "${text}" as used in this context: "${context.substring(0, 300)}"\n\nGive the specific meaning that applies here in 1-2 clear sentences.`;
  } else {
    prompt = `Define "${text}" in one clear sentence.`;
  }

  const body = {
    gemini: { contents: [{ parts: [{ text: prompt }] }] },
    openai: { model: 'gpt-4o-mini', messages: [{ role: 'user', content: prompt }], max_tokens: maxTokens },
    generic: { prompt, max_tokens: maxTokens }
  };

  const MAX_RETRIES = 2;
  let lastError;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const resp = await fetchWithTimeout(url, {
        method: 'POST', headers,
        body: JSON.stringify(body[provider] || body.generic)
      }, 15000);

      // Retry on rate-limit or server errors
      if ((resp.status === 429 || resp.status >= 500) && attempt < MAX_RETRIES) {
        await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
        continue;
      }

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error?.message || `API Error: ${resp.status}`);
      }

      const json = await resp.json();
      const result = provider === 'gemini' ? json.candidates?.[0]?.content?.parts?.[0]?.text
        : provider === 'openai' ? json.choices?.[0]?.message?.content
        : json.text || json.response || json.choices?.[0]?.text;

      if (!result) throw new Error('Could not parse AI response.');
      return result.trim();
    } catch (e) {
      lastError = e;
      // Retry on network/timeout errors, but not on validation errors
      const isRetryable = e.name === 'AbortError' || e.name === 'TimeoutError' || e.name === 'TypeError' || e.message === 'Failed to fetch';
      if (!isRetryable || attempt >= MAX_RETRIES) throw e;
      await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
    }
  }

  throw lastError;
};

// End of file
