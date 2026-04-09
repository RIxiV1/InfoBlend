/**
 * API utility for fetching definitions and summaries.
 * Support for standard Dictionary API and custom AI Adapters.
 */

/**
 * Fetches a word definition from the Free Dictionary API.
 * @param {string} word - The term to define.
 * @returns {Promise<Object>} Title, content, and source.
 */
/**
 * Fetches a word definition with a multi-stage fallback chain.
 * Priority: Free Dictionary -> Datamuse -> Wiktionary -> Wikipedia
 * @param {string} word - The term to define.
 * @returns {Promise<Object>} Title, content, source and optional link.
 */
export const fetchDefinition = async (word) => {
  const term = word.trim();
  const wordCount = term.split(/\s+/).length;
  if (wordCount > 5) {
    throw new Error('Selection too long for definition. Try summarizing instead.');
  }

  // 1. Free Dictionary API (Primary)
  try {
    const resp = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(term)}`);
    if (resp.ok) {
      const data = await resp.json();
      if (data?.[0]?.meanings?.[0]?.definitions?.[0]?.definition) {
        return {
          title: data[0].word,
          content: data[0].meanings[0].definitions[0].definition,
          source: 'Dictionary API'
        };
      }
    }
  } catch (e) { console.warn('[InfoBlend] Dictionary API failed, trying Datamuse...'); }

  // 2. Datamuse API (Technical/Slang)
  try {
    const resp = await fetch(`https://api.datamuse.com/words?sp=${encodeURIComponent(term)}&md=d&max=1`);
    if (resp.ok) {
      const data = await resp.json();
      if (data?.[0]?.defs?.[0]) {
        return {
          title: term,
          content: data[0].defs[0].replace(/^[a-z]+\t/, ''), // Remove part of speech prefix
          source: 'Datamuse'
        };
      }
    }
  } catch (e) { console.warn('[InfoBlend] Datamuse failed, trying Wiktionary...'); }

  // 3. Wiktionary API (Restful Summary)
  try {
    const resp = await fetch(`https://en.wiktionary.org/api/rest_v1/page/summary/${encodeURIComponent(term)}`);
    if (resp.ok) {
      const data = await resp.json();
      if (data.extract) {
        return {
          title: term,
          content: data.extract,
          source: 'Wiktionary'
        };
      }
    }
  } catch (e) { console.warn('[InfoBlend] Wiktionary failed, trying Wikipedia...'); }

  // 4. Wikipedia (Last Resort - First Sentence Only)
  try {
    const resp = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(term)}`);
    if (resp.ok) {
      const data = await resp.json();
      if (data.extract) {
        const firstSentence = data.extract.split(/[.!?]\s/)[0].trim() + '.';
        return {
          title: term,
          content: firstSentence,
          source: 'Wikipedia'
        };
      }
    }
  } catch (e) { console.warn('[InfoBlend] Wikipedia failed.'); }

  // 5. Absolute Failure - Merriam-Webster Link
  return {
    title: 'Definition Not Found',
    content: `We couldn't find a local definition for "${term}".`,
    source: 'Search Merriam-Webster',
    isNotFound: true,
    url: `https://www.merriam-webster.com/dictionary/${encodeURIComponent(term)}`
  };
};


/**
 * Orchestrates AI requests with multi-provider adapter support.
 * @param {string} text - Input text.
 * @param {string} template - API Endpoint URL.
 * @param {string} key - API Key.
 * @param {string} keyHeader - Optional custom header for the key.
 * @param {string} provider - 'gemini', 'openai', or 'generic'.
 * @param {string} promptType - 'define' or 'summarize'.
 */
export const fetchAIResponse = async (text, template, key, keyHeader, provider = 'gemini', promptType = 'define') => {
  if (!template || !template.startsWith('http')) {
    throw new Error('Invalid API Endpoint. Please check your settings.');
  }
  
  const headers = { 'Content-Type': 'application/json' };

  // Gemini uses query-param auth, not header-based
  let endpoint = template;
  if (provider === 'gemini' && key) {
    const sep = endpoint.includes('?') ? '&' : '?';
    endpoint = `${endpoint}${sep}key=${encodeURIComponent(key)}`;
  } else if (key) {
    if (keyHeader) headers[keyHeader] = key;
    else headers['Authorization'] = `Bearer ${key}`;
  }

  // Optimized Prompt Engineering
  const promptText = promptType === 'summarize'
    ? `Summarize the following text in 3-4 professional bullet points. Focus on key insights: "${text.substring(0, 8000)}"`
    : `Define "${text}" in one concise, insightful sentence. Use simple language.`;

  const bodyMap = {
    gemini: { contents: [{ parts: [{ text: promptText }] }] },
    openai: {
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: promptText }],
      max_tokens: promptType === 'summarize' ? 300 : 100
    },
    generic: { prompt: promptText, max_tokens: promptType === 'summarize' ? 300 : 100 }
  };

  const resp = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(bodyMap[provider] || bodyMap.generic),
    signal: AbortSignal.timeout(15000)
  });

  if (!resp.ok) {
    const errorData = await resp.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `API Error: ${resp.status}`);
  }

  const json = await resp.json();
  
  // Unified Adapter Response Extraction
  let result;
  switch (provider) {
    case 'gemini': result = json.candidates?.[0]?.content?.parts?.[0]?.text; break;
    case 'openai': result = json.choices?.[0]?.message?.content; break;
    default: result = json.text || json.response || json.choices?.[0]?.text; break;
  }
  
  if (!result) throw new Error('Could not parse AI response. Check Provider settings.');
  return result.trim();
};

