/**
 * API utility for fetching definitions and summaries.
 * Fallback chain: Free Dictionary -> Datamuse -> Wiktionary -> Wikipedia.
 */
export const fetchDefinition = async (word) => {
  const term = word.trim();
  if (term.split(/\s+/).length > 5) {
    throw new Error('Selection too long for definition. Try summarizing instead.');
  }

  // 1. Free Dictionary API — returns rich structured data
  try {
    const resp = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(term)}`);
    if (resp.ok) {
      const data = await resp.json();
      const entry = data?.[0];
      if (entry?.meanings?.length) {
        const phonetic = entry.phonetic
          || entry.phonetics?.find(p => p.text)?.text
          || '';

        // Up to 2 meanings, 3 definitions each
        const meanings = entry.meanings.slice(0, 2).map(m => ({
          partOfSpeech: m.partOfSpeech,
          definitions: m.definitions.slice(0, 3).map(d => ({
            text: d.definition,
            example: d.example || null
          }))
        }));

        return {
          title: entry.word,
          phonetic,
          meanings,
          source: 'Dictionary API',
          isRich: true
        };
      }
    }
  } catch { /* fall through */ }

  // 2. Datamuse — exact spelling match with definition
  try {
    const resp = await fetch(`https://api.datamuse.com/words?sp=${encodeURIComponent(term)}&qe=sp&md=d&max=1`);
    if (resp.ok) {
      const data = await resp.json();
      if (data?.[0]?.word?.toLowerCase() === term.toLowerCase() && data[0].defs?.length) {
        const meanings = data[0].defs.slice(0, 3).map(d => {
          const [pos, ...rest] = d.split('\t');
          return { partOfSpeech: pos, definitions: [{ text: rest.join('\t') }] };
        });
        return { title: term, meanings, source: 'Datamuse', isRich: true };
      }
    }
  } catch { /* fall through */ }

  // 3. Wiktionary
  try {
    const resp = await fetch(`https://en.wiktionary.org/api/rest_v1/page/summary/${encodeURIComponent(term)}`);
    if (resp.ok) {
      const data = await resp.json();
      if (data.extract) {
        return { title: term, content: data.extract, source: 'Wiktionary' };
      }
    }
  } catch { /* fall through */ }

  // 4. Wikipedia — first sentence
  try {
    const resp = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(term)}`);
    if (resp.ok) {
      const data = await resp.json();
      if (data.extract) {
        return {
          title: term,
          content: data.extract.split(/[.!?]\s/)[0].trim() + '.',
          source: 'Wikipedia'
        };
      }
    }
  } catch { /* fall through */ }

  // 5. Not found
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
export const fetchAIResponse = async (text, endpoint, key, keyHeader, provider = 'gemini', promptType = 'define') => {
  if (!endpoint?.startsWith('http')) {
    throw new Error('Invalid API Endpoint. Please check your settings.');
  }

  const headers = { 'Content-Type': 'application/json' };
  let url = endpoint;

  if (provider === 'gemini' && key) {
    url += `${url.includes('?') ? '&' : '?'}key=${encodeURIComponent(key)}`;
  } else if (key) {
    headers[keyHeader || 'Authorization'] = keyHeader ? key : `Bearer ${key}`;
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
    method: 'POST',
    headers,
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
