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
    if (!response.ok) throw new Error('Wikipedia entry not found');
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
 * Custom AI Fetcher (Placeholder for future LLM integration)
 */
export const fetchAIResponse = async (text, template, key, keyHeader) => {
  if (!template) throw new Error('No template URL configured');
  
  const headers = { 'Content-Type': 'application/json' };
  if (key) {
    if (keyHeader) headers[keyHeader] = key;
    else { headers['Authorization'] = 'Bearer ' + key; }
  }

  const promptText = text.includes(' ') 
    ? `Explain this in one short, simple line: '${text}'`
    : `What is "${text}"? Give a very short, simple definition.`;

  const body = { contents: [{ parts: [{ text: promptText }] }] };

  const resp = await fetch(template, { method: 'POST', headers, body: JSON.stringify(body) });
  const json = await resp.json();
  
  // Basic extraction for Gemini-like response
  if (json.candidates?.[0]?.content?.parts?.[0]?.text) {
    return json.candidates[0].content.parts[0].text.trim();
  }
  return 'No AI response received.';
};
