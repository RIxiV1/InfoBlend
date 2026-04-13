/**
 * Definition + AI API adapters.
 * Single words: Dictionary → Datamuse → Wiktionary → Wikipedia
 * Compound terms (2+ words): Wikipedia → Wiktionary → Dictionary → Datamuse
 */

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
  const cache = await loadCache();
  const now = Date.now();
  const before = cache.length;
  for (let i = cache.length - 1; i >= 0; i--) {
    if (cache[i].ts && now - cache[i].ts > CACHE_TTL) cache.splice(i, 1);
  }
  if (cache.length !== before) await flushCache();
}

// --- Individual API fetchers ---

async function tryDictionary(term) {
  const resp = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(term)}`);
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
    meanings: entry.meanings.slice(0, 4).map(m => ({
      partOfSpeech: m.partOfSpeech,
      definitions: m.definitions.slice(0, 3).map(d => ({
        text: d.definition,
        example: d.example || null
      })),
      synonyms: (m.synonyms || []).slice(0, 5),
      antonyms: (m.antonyms || []).slice(0, 5)
    })),
    // Collect top-level synonyms/antonyms too
    synonyms: entry.meanings.flatMap(m => m.synonyms || []).slice(0, 8),
    antonyms: entry.meanings.flatMap(m => m.antonyms || []).slice(0, 5),
    source: 'Dictionary API',
    isRich: true
  };
}

async function tryDatamuse(term) {
  // Fetch definition + synonyms + antonyms in parallel
  const [defResp, synResp, antResp] = await Promise.all([
    fetch(`https://api.datamuse.com/words?sp=${encodeURIComponent(term)}&qe=sp&md=d,p,s,f&max=1`),
    fetch(`https://api.datamuse.com/words?rel_syn=${encodeURIComponent(term)}&max=6`),
    fetch(`https://api.datamuse.com/words?rel_ant=${encodeURIComponent(term)}&max=4`)
  ]);

  if (!defResp.ok) return null;
  const data = await defResp.json();
  if (!data?.[0]?.defs?.length || data[0].word?.toLowerCase() !== term.toLowerCase()) return null;

  const synData = synResp.ok ? await synResp.json() : [];
  const antData = antResp.ok ? await antResp.json() : [];

  const entry = data[0];
  return {
    title: term,
    meanings: entry.defs.slice(0, 4).map(d => {
      const [pos, ...rest] = d.split('\t');
      return { partOfSpeech: pos, definitions: [{ text: rest.join('\t') }] };
    }),
    synonyms: synData.map(w => w.word).slice(0, 8),
    antonyms: antData.map(w => w.word).slice(0, 5),
    frequency: entry.tags?.find(t => t.startsWith('f:'))?.replace('f:', '') || null,
    syllables: entry.numSyllables || null,
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

// --- Main definition fetcher ---

export const fetchDefinition = async (word) => {
  const term = word.trim();
  const wordCount = term.split(/\s+/).length;
  if (wordCount > 5) throw new Error('Selection too long for definition. Try summarizing instead.');

  // Check cache first
  const cached = await getCachedDefinition(term);
  if (cached) return { ...cached, fromCache: true };

  // Route based on word count:
  // Single words: Dictionary (rich) → Datamuse → Wiktionary → Wikipedia
  // Compound terms: Wikipedia (handles them best) → Wiktionary → Dictionary → Datamuse → Wikipedia Search
  const chain = wordCount === 1
    ? [tryDictionary, tryDatamuse, tryWiktionary, tryWikipedia]
    : [tryWikipedia, tryWiktionary, tryDictionary, tryDatamuse, tryWikipediaSearch];

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
        await cacheDefinition(term, result);
        return result;
      }
    } catch { /* next in chain */ }
  }

  return {
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
export const fetchAIResponse = async (text, endpoint, key, provider = 'gemini', promptType = 'define', context = '') => {
  if (!endpoint?.startsWith('http')) throw new Error('Invalid API Endpoint. Please check your settings.');

  const headers = { 'Content-Type': 'application/json' };
  let url = endpoint;

  if (provider === 'gemini' && key) {
    url += `${url.includes('?') ? '&' : '?'}key=${encodeURIComponent(key)}`;
  } else if (key) {
    headers['Authorization'] = `Bearer ${key}`;
  }

  let prompt;
  if (promptType === 'summarize') {
    prompt = `Summarize the following text in 3-4 concise bullet points:\n\n${text.substring(0, 8000)}`;
  } else if (context) {
    prompt = `Define "${text}" as used in this context: "${context.substring(0, 300)}"\n\nGive the specific meaning that applies here in 1-2 clear sentences.`;
  } else {
    prompt = `Define "${text}" in one clear sentence.`;
  }

  const body = {
    gemini: { contents: [{ parts: [{ text: prompt }] }] },
    openai: { model: 'gpt-4o-mini', messages: [{ role: 'user', content: prompt }], max_tokens: promptType === 'summarize' ? 300 : 100 },
    generic: { prompt, max_tokens: promptType === 'summarize' ? 300 : 100 }
  };

  const MAX_RETRIES = 2;
  let lastError;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const ac = new AbortController();
      const timeout = setTimeout(() => ac.abort(), 15000);
      const resp = await fetch(url, {
        method: 'POST', headers,
        body: JSON.stringify(body[provider] || body.generic),
        signal: ac.signal
      });
      clearTimeout(timeout);

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
