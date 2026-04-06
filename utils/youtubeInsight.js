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
    if (!response.ok) throw new Error('YouTube unreachable. Check connection.');
    const html = await response.text();
    
    let playerResponse = null;
    
    // 1. Primary Strategy: Parse ytInitialPlayerResponse directly
    const playerResponseRegex = /ytInitialPlayerResponse\s*=\s*({.+?});\s*(?:var|<\/script)/s;
    const playerMatch = html.match(playerResponseRegex);
    
    if (playerMatch) {
      try {
        playerResponse = JSON.parse(playerMatch[1]);
      } catch (e) {
        console.warn('[InfoBlend] Failed to parse ytInitialPlayerResponse JSON.');
      }
    }
    
    // 2. Secondary Strategy: Extract just the captions array if the full object parse failed
    if (!playerResponse) {
      const captionsRegex = /"captionTracks":\s*\[(.*?)\]/;
      const capMatch = html.match(captionsRegex);
      if (capMatch) {
        try {
          const tracks = JSON.parse(`[${capMatch[1]}]`);
          return await fetchAndProcessTrack(tracks);
        } catch (e) { /* fallback to error below */ }
      }
    }

    const tracks = playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    
    if (!tracks || tracks.length === 0) {
      throw new Error('This video has no transcript available.');
    }
    
    return await fetchAndProcessTrack(tracks);

  } catch (error) {
    if (error.message.includes('Unexpected token')) {
      throw new Error('YouTube format changed. Please contact developers.');
    }
    throw error;
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
  
  // Robust XML cleaning and extraction
  const content = xml
    .replace(/<text[^>]*>/g, ' ') // Replace tags with space to preserve word separation
    .replace(/<\/text>/g, '')     // Remove closing tags
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
  
  if (!content) throw new Error('Transcript data is empty.');
  return content;
}
