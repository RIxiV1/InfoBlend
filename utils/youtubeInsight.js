/**
 * YouTube Insight Engine
 * Extracts and processes YouTube transcripts using native endpoints.
 */

const decodeHTML = (text) => {
  const entities = {
    '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&apos;': "'", '&#x2F;': '/'
  };
  return text.replace(/&[#\w]+;/g, (match) => entities[match] || match);
};

export const extractYouTubeTranscript = async (url) => {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error('YouTube unreachable. Check your connection.');
    const html = await response.text();
    
    // Improved regex to find caption data in different script blocks
    const captionsRegex = /"captionTracks":\s*\[(.*?)\]/;
    const match = html.match(captionsRegex);
    
    if (!match) {
      // Fallback: Check for innertrack or other common locations
      const fallbackRegex = /ytInitialPlayerResponse\s*=\s*({.*?});/s;
      const fbMatch = html.match(fallbackRegex);
      if (fbMatch) {
         try {
           const data = JSON.parse(fbMatch[1]);
           const tracks = data.captions?.playerCaptionsTracklistRenderer?.captionTracks;
           if (tracks) return await fetchAndProcessTrack(tracks);
         } catch (e) { /* ignore JSON parse error */ }
      }
      throw new Error('Captions are disabled or unavailable for this video.');
    }
    
    const tracks = JSON.parse(`[${match[1]}]`);
    return await fetchAndProcessTrack(tracks);

  } catch (error) {
    console.warn('[InfoBlend] YouTube Insight Error:', error.message);
    throw new Error(`YouTube Insight: ${error.message}`);
  }
};

async function fetchAndProcessTrack(tracks) {
  // Priority: English -> English (Auto-generated) -> First available
  const enTrack = tracks.find(t => t.languageCode === 'en' && !t.kind) || 
                  tracks.find(t => t.languageCode === 'en') || 
                  tracks[0];
  
  if (!enTrack?.baseUrl) throw new Error('No readable transcript tracks found.');

  const xmlResponse = await fetch(enTrack.baseUrl);
  const xml = await xmlResponse.text();
  
  const textMatches = xml.match(/<text.*?>(.*?)<\/text>/gi);
  if (!textMatches) throw new Error('Transcript is empty.');
  
  return textMatches
    .map(tag => {
      const content = tag.match(/<text.*?>(.*?)<\/text>/i)?.[1] || '';
      return decodeHTML(content);
    })
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}
