/**
 * YouTube Insight Engine
 * Extracts and processes YouTube transcripts using native endpoints.
 */
import { fetchWithTimeout } from './compat.js';

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
 * Uses multiple extraction strategies to handle YouTube's evolving page format.
 * @param {string} html - The raw HTML of a YouTube watch page.
 * @returns {Promise<string>} - The flattened transcript text.
 */
const parseTranscriptFromHTML = async (html) => {
  const extractionStrategies = [
    // Strategy 1: ytInitialPlayerResponse variable assignment
    () => {
      const match = html.match(/ytInitialPlayerResponse\s*=\s*({.+?});\s*(?:var|<\/script)/s);
      if (!match) return null;
      return JSON.parse(match[1]);
    },
    // Strategy 2: ytInitialPlayerResponse embedded in ytInitialData
    () => {
      const match = html.match(/ytInitialPlayerResponse\s*=\s*({.+?})\s*;/s);
      if (!match) return null;
      return JSON.parse(match[1]);
    },
    // Strategy 3: Player response embedded in script with different wrapper
    () => {
      const match = html.match(/var\s+meta\s*=.*?playerResponse\s*[:=]\s*({.+?})\s*[;,]/s);
      if (!match) return null;
      return JSON.parse(match[1]);
    }
  ];

  // Try full player response parsing first
  let playerResponse = null;
  for (const strategy of extractionStrategies) {
    try {
      playerResponse = strategy();
      if (playerResponse?.captions) break;
      playerResponse = null;
    } catch { /* try next strategy */ }
  }

  if (playerResponse) {
    const tracks = playerResponse.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    if (tracks?.length) return await fetchAndProcessTrack(tracks);
  }

  // Fallback: extract just the captionTracks array directly
  const captionPatterns = [
    /"captionTracks":\s*(\[.*?\])/s,
    /captionTracks\\?":\s*(\[.*?\])/s
  ];

  for (const pattern of captionPatterns) {
    const match = html.match(pattern);
    if (!match) continue;
    try {
      // Unescape if the JSON was inside a string literal
      const raw = match[1].includes('\\u') ? JSON.parse(`"${match[1].replace(/"/g, '\\"')}"`) : match[1];
      const tracks = JSON.parse(raw);
      if (tracks?.length) return await fetchAndProcessTrack(tracks);
    } catch { /* try next pattern */ }
  }

  throw new Error('This video has no transcript available.');
};

export const extractYouTubeTranscript = async (url) => {
  try {
    const response = await fetchWithTimeout(url, {}, 15000);
    if (!response.ok) throw new Error('YouTube unreachable. Check connection.');
    const html = await response.text();
    return await parseTranscriptFromHTML(html);
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('YouTube request timed out. Check connection.');
    if (error.message.includes('Unexpected token') || error.message.includes('JSON')) {
      throw new Error('YouTube format changed. Please report this issue.');
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

  const xmlResponse = await fetchWithTimeout(enTrack.baseUrl, {}, 10000);
  if (!xmlResponse.ok) throw new Error('Failed to fetch transcript data.');
  const xml = await xmlResponse.text();

  // Extract text content from <text> tags, then decode HTML entities
  const segments = [];
  const tagRegex = /<text[^>]*>([\s\S]*?)<\/text>/g;
  let tagMatch;
  while ((tagMatch = tagRegex.exec(xml)) !== null) {
    const decoded = decodeHTML(tagMatch[1]).trim();
    if (decoded) segments.push(decoded);
  }

  // Fallback: strip all tags if regex finds nothing (format changed)
  const content = segments.length > 0
    ? segments.join(' ')
    : decodeHTML(xml.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

  if (!content) throw new Error('Transcript data is empty.');
  return content;
}
