/**
 * API utility for fetching definitions and summaries.
 */

export const fetchDefinition = async (word) => {
  try {
    const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
    if (!response.ok) {
      return await fetchWikipediaSummary(word);
    }
    const data = await response.json();
    if (data && data[0]) {
      const entry = data[0];
      const definition = entry.meanings[0].definitions[0].definition;
      return {
        title: entry.word,
        content: definition,
        source: 'Dictionary API'
      };
    }
    throw new Error('No definition found');
  } catch (error) {
    console.error('Dictionary API error:', error);
    return await fetchWikipediaSummary(word);
  }
};

export const fetchWikipediaSummary = async (term) => {
  try {
    const response = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(term)}`);
    if (!response.ok) throw new Error(`Encyclopedia: No entry found for '${term}'.`);
    const data = await response.json();
    return {
      title: data.title,
      content: data.extract,
      source: 'Wikipedia'
    };
  } catch (error) {
    console.error('Wikipedia API error:', error);
    throw error;
  }
};

/**
 * Custom AI Fetcher with Adapter Support
 * @param {string} text - The input text (word or long passage)
 * @param {string} template - The API URL
 * @param {string} key - The API Key
 * @param {string} keyHeader - Custom header for key (optional)
 * @param {string} provider - 'gemini', 'openai', or 'generic'
 * @param {string} promptType - 'define' (default) or 'summarize'
 */
export const fetchAIResponse = async (text, template, key, keyHeader, provider = 'gemini', promptType = 'define') => {
  if (!template || !template.startsWith('http')) {
    throw new Error('Invalid API Endpoint. Please check your settings.');
  }
  
  const headers = { 'Content-Type': 'application/json' };
  if (key) {
    if (keyHeader) headers[keyHeader] = key;
    else { headers['Authorization'] = 'Bearer ' + key; }
  }

  let promptText;
  if (promptType === 'summarize') {
    promptText = `You are a professional research assistant. Provide a concise, highly insightful summary of the following text using 3-4 high-impact bullet points. Focus on key data points and the primary message: "${text.substring(0, 10000)}"`;
  } else {
    promptText = text.includes(' ') 
      ? `Explain this in one short, simple line: '${text}'`
      : `What is "${text}"? Give a very short, simple definition.`;
  }

  let body;
  if (provider === 'gemini') {
    body = { contents: [{ parts: [{ text: promptText }] }] };
  } else if (provider === 'openai') {
    body = {
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: promptText }],
      max_tokens: promptType === 'summarize' ? 300 : 100
    };
  } else {
    body = { prompt: promptText, max_tokens: promptType === 'summarize' ? 300 : 100 };
  }

  const resp = await fetch(template, { 
    method: 'POST', 
    headers, 
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000) // 15s timeout
  });

  if (!resp.ok) {
    const errorData = await resp.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `API Error: ${resp.status} ${resp.statusText}`);
  }

  const json = await resp.json();
  
  // Adapter Logic for Response Parsing
  let result;
  if (provider === 'gemini') {
    result = json.candidates?.[0]?.content?.parts?.[0]?.text;
  } else if (provider === 'openai') {
    result = json.choices?.[0]?.message?.content;
  } else {
    result = json.text || json.response || json.choices?.[0]?.text;
  }
  
  if (!result) throw new Error('Could not parse AI response. Check your Provider settings.');
  return result.trim();
};
