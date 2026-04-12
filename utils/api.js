/**
 * Definition + AI API adapters.
 * Single words: Dictionary → Datamuse → Wiktionary → Wikipedia
 * Compound terms (2+ words): Wikipedia → Wiktionary → Dictionary → Datamuse
 */

// --- LRU Definition Cache ---
const CACHE_KEY = 'ib_def_cache';
const CACHE_MAX = 200;

async function getCachedDefinition(term) {
  try {
    const result = await chrome.storage.local.get([CACHE_KEY]);
    const cache = result[CACHE_KEY] || [];
    const entry = cache.find(e => e.term === term.toLowerCase());
    if (entry) {
      // Move to front (most recently used)
      const idx = cache.indexOf(entry);
      cache.splice(idx, 1);
      cache.unshift(entry);
      await chrome.storage.local.set({ [CACHE_KEY]: cache });
      return entry.data;
    }
  } catch { /* storage unavailable */ }
  return null;
}

async function cacheDefinition(term, data) {
  try {
    const result = await chrome.storage.local.get([CACHE_KEY]);
    const cache = result[CACHE_KEY] || [];
    // Remove existing entry for this term
    const idx = cache.findIndex(e => e.term === term.toLowerCase());
    if (idx >= 0) cache.splice(idx, 1);
    // Add to front
    cache.unshift({ term: term.toLowerCase(), data, ts: Date.now() });
    // Evict oldest if over limit
    if (cache.length > CACHE_MAX) cache.length = CACHE_MAX;
    await chrome.storage.local.set({ [CACHE_KEY]: cache });
  } catch { /* storage unavailable */ }
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
    meanings: entry.meanings.slice(0, 2).map(m => ({
      partOfSpeech: m.partOfSpeech,
      definitions: m.definitions.slice(0, 3).map(d => ({
        text: d.definition,
        example: d.example || null
      }))
    })),
    source: 'Dictionary API',
    isRich: true
  };
}

async function tryDatamuse(term) {
  const resp = await fetch(`https://api.datamuse.com/words?sp=${encodeURIComponent(term)}&qe=sp&md=d&max=1`);
  if (!resp.ok) return null;
  const data = await resp.json();
  if (!data?.[0]?.defs?.length || data[0].word?.toLowerCase() !== term.toLowerCase()) return null;

  return {
    title: term,
    meanings: data[0].defs.slice(0, 3).map(d => {
      const [pos, ...rest] = d.split('\t');
      return { partOfSpeech: pos, definitions: [{ text: rest.join('\t') }] };
    }),
    source: 'Datamuse',
    isRich: true
  };
}

async function tryWiktionary(term) {
  const resp = await fetch(`https://en.wiktionary.org/api/rest_v1/page/summary/${encodeURIComponent(term)}`);
  if (!resp.ok) return null;
  const data = await resp.json();
  if (!data.extract) return null;
  return { title: term, content: data.extract, source: 'Wiktionary' };
}

async function tryWikipedia(term) {
  const resp = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(term)}`);
  if (!resp.ok) return null;
  const data = await resp.json();
  if (!data.extract) return null;
  return {
    title: data.title || term,
    content: data.extract.split(/[.!?]\s/)[0].trim() + '.',
    source: 'Wikipedia'
  };
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
  // Compound terms: Wikipedia (handles them best) → Wiktionary → Dictionary → Datamuse
  const chain = wordCount === 1
    ? [tryDictionary, tryDatamuse, tryWiktionary, tryWikipedia]
    : [tryWikipedia, tryWiktionary, tryDictionary, tryDatamuse];

  for (const fetcher of chain) {
    try {
      const result = await fetcher(term);
      if (result) {
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
 */
export const fetchAIResponse = async (text, endpoint, key, provider = 'gemini', promptType = 'define') => {
  if (!endpoint?.startsWith('http')) throw new Error('Invalid API Endpoint. Please check your settings.');

  const headers = { 'Content-Type': 'application/json' };
  let url = endpoint;

  if (provider === 'gemini' && key) {
    url += `${url.includes('?') ? '&' : '?'}key=${encodeURIComponent(key)}`;
  } else if (key) {
    headers['Authorization'] = `Bearer ${key}`;
  }

  const prompt = promptType === 'summarize'
    ? `Summarize the following text in 3-4 concise bullet points:\n\n${text.substring(0, 8000)}`
    : `Define "${text}" in one clear sentence.`;

  const body = {
    gemini: { contents: [{ parts: [{ text: prompt }] }] },
    openai: { model: 'gpt-4o-mini', messages: [{ role: 'user', content: prompt }], max_tokens: promptType === 'summarize' ? 300 : 100 },
    generic: { prompt, max_tokens: promptType === 'summarize' ? 300 : 100 }
  };

  const resp = await fetch(url, {
    method: 'POST', headers,
    body: JSON.stringify(body[provider] || body.generic),
    signal: AbortSignal.timeout(15000)
  });

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
};

// Exported for testing
export { getCachedDefinition, cacheDefinition, tryDictionary, tryDatamuse, tryWiktionary, tryWikipedia };
