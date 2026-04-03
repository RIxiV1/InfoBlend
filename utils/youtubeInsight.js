/**
 * YouTube Insight Engine
 * Extracts and processes YouTube transcripts using native endpoints.
 */

export const extractYouTubeTranscript = async (url) => {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Failed to fetch YouTube page.');
    const html = await response.text();
    
    // Find captions tracks in the HTML
    const captionsRegex = /"captionTracks":\[(.*?)\]/;
    const match = html.match(captionsRegex);
    if (!match || match.length < 2) {
      throw new Error('No captions available for this video.');
    }
    
    // Parse the JSON string for caption tracks
    const tracksRaw = `[${match[1]}]`;
    const tracks = JSON.parse(tracksRaw);
    
    // Find English track or just pick the first one
    const enTrack = tracks.find(t => t.languageCode === 'en' || t.name?.simpleText?.includes('English')) || tracks[0];
    
    if (!enTrack || !enTrack.baseUrl) {
      throw new Error('No valid caption track found.');
    }
    
    const xmlResponse = await fetch(enTrack.baseUrl);
    if (!xmlResponse.ok) throw new Error('Failed to fetch caption XML.');
    const xml = await xmlResponse.text();
    
    // Simple XML parsing to extract text
    const textMatches = xml.match(/<text.*?>(.*?)<\/text>/gi);
    if (!textMatches) throw new Error('No text found in captions.');
    
    // Decode HTML entities and join
    const fullTranscript = textMatches.map(tag => {
        const contentMatch = tag.match(/<text.*?>(.*?)<\/text>/i);
        if (!contentMatch) return '';
        let text = contentMatch[1];
        // Decode common entities
        text = text.replace(/&amp;/g, '&')
                   .replace(/&lt;/g, '<')
                   .replace(/&gt;/g, '>')
                   .replace(/&quot;/g, '"')
                   .replace(/&#39;/g, "'");
        return text;
    }).join(' ');

    return fullTranscript;
  } catch (error) {
    console.error('YouTube Transcript Extraction Error:', error);
    throw error;
  }
};
