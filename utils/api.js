/**
 * API utility for fetching definitions and summaries.
 * Support for standard Dictionary API and custom AI Adapters.
 */

/**
 * Fetches a word definition from the Free Dictionary API.
 * @param {string} word - The term to define.
 * @returns {Promise<Object>} Title, content, and source.
 */
export const fetchDefinition = async (word) => {
  const wordCount = word.trim().split(/\s+/).length;
  if (wordCount > 5) {
    throw new Error('Selection too long for definition. Try summarizing instead.');
  }
  
  try {
    const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
    if (!response.ok) {
      throw new Error(`Encyclopedia: No entry found for '${word}'.`);
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
    console.error('[InfoBlend] Dictionary API error:', error);
    throw error;
  }
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
  if (key) {
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
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: promptText }],
      max_tokens: promptType === 'summarize' ? 300 : 100
    },
    generic: { prompt: promptText, max_tokens: promptType === 'summarize' ? 300 : 100 }
  };

  const resp = await fetch(template, { 
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

