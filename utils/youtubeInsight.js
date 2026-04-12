/**
 * YouTube Insight Engine
 * Extracts and processes YouTube transcripts using native endpoints.
 */

const decodeHTML = (text) => {
  // Named entities not covered by numeric replacements
  const entities = {
    '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"',
    '&apos;': "'", '&nbsp;': ' ', '&hellip;': '...', '&mdash;': '\u2014',
    '&ndash;': '\u2013', '&laquo;': '\u00AB', '&raquo;': '\u00BB'
  };
  return text
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&[a-zA-Z]+;/g, (match) => entities[match] || match);
};

/**
 * Extracts and processes YouTube transcripts from HTML source.
 * @param {string} html - The raw HTML of a YouTube watch page.
 * @returns {Promise<string>} - The flattened transcript text.
 */
const parseTranscriptFromHTML = async (html) => {
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
};

export const extractYouTubeTranscript = async (url) => {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error('YouTube unreachable. Check connection.');
    const html = await response.text();
    return await parseTranscriptFromHTML(html);
  } catch (error) {
    if (error.message.includes('Unexpected token')) {
      throw new Error('YouTube format changed. Please contact developers.');
    }
    throw error;
  }
};

export async function fetchAndProcessTrack(tracks) {
  // Priority: English -> English (Auto-generated) -> First available
  const enTrack = tracks.find(t => t.languageCode === 'en' && !t.kind) || 
                  tracks.find(t => t.languageCode === 'en') || 
                  tracks[0];
  
  if (!enTrack?.baseUrl) throw new Error('No readable transcript tracks found.');

  const xmlResponse = await fetch(enTrack.baseUrl);
  const xml = await xmlResponse.text();
  
  // Robust XML cleaning and extraction via decodeHTML
  const content = decodeHTML(
    xml
      .replace(/<text[^>]*>/g, ' ')  // Replace tags with space to preserve word separation
      .replace(/<\/text>/g, '')      // Remove closing tags
  ).replace(/\s+/g, ' ').trim();
  
  if (!content) throw new Error('Transcript data is empty.');
  return content;
}
