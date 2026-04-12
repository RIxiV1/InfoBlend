/**
 * Local Extractive Summarizer
 * Offloaded to the background script to bypass Content Security Policy constraints.
 */

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'was', 'with', 'that', 'this', 'but', 'from', 'have', 'were',
  'not', 'will', 'your', 'their', 'when', 'which', 'than', 'more', 'about', 'some',
  'could', 'should', 'would', 'into', 'these', 'those', 'also', 'only', 'very',
  'are', 'has', 'its', 'all', 'one', 'can', 'who', 'how', 'they', 'our', 'out', 'she',
  'been', 'being', 'had', 'does', 'did', 'doing', 'each', 'other', 'such', 'what',
  'where', 'there', 'here', 'just', 'over', 'under', 'again', 'then', 'once', 'both',
  'same', 'own', 'most', 'many', 'much', 'any', 'few', 'get', 'got', 'made', 'make',
  'may', 'might', 'must', 'need', 'like', 'even', 'still', 'way', 'well', 'back',
  'his', 'her', 'him', 'them', 'you', 'said', 'say', 'says', 'new', 'use', 'used',
  'first', 'two', 'now', 'come', 'take', 'know', 'see', 'time', 'year', 'people'
]);

export function generateIntelligentSummary(text, maxSentences = 4) {
  const raw = text || '';

  let truncated = raw.length > 20000 ? raw.substring(0, 20000) : raw;
  if (raw.length > 20000 && /[.!?]/.test(truncated)) {
    truncated = truncated.replace(/[^.!?]*$/, '');
  }

  if (!truncated.trim()) return '';

  let sentences = [];
  try {
    const segmenter = new Intl.Segmenter('en', { granularity: 'sentence' });
    sentences = Array.from(segmenter.segment(truncated))
      .map(s => s.segment.trim())
      .filter(s => s.length > 0);
  } catch {
    const abbrs = /\b(Mr|Mrs|Ms|Dr|St|Prof|Jr|Sr|vs|min|max|etc|eg|ie|U\.S|U\.K|U\.N)\./gi;
    const preProcessed = truncated.replace(abbrs, (m) => m.replace('.', '[[DOT]]'));
    const raw = preProcessed.match(/[^.!?]+[.!?]+/g) || [preProcessed];
    sentences = raw.map(s => s.replace(/\[\[DOT\]\]/g, '.').trim());
  }

  if (sentences.length <= maxSentences) return sentences.join(' ');

  // Score sentences based on word frequency (minimum word length 3)
  const rawWords = truncated.toLowerCase().match(/\b\w{3,}\b/g) || [];
  const freq = {};
  rawWords.forEach(w => {
    if (!STOP_WORDS.has(w)) freq[w] = (freq[w] || 0) + 1;
  });

  const scores = sentences.map((s, idx) => {
    const sWords = s.toLowerCase().match(/\b\w{3,}\b/g) || [];
    let wordScore = sWords.reduce((acc, w) => acc + (freq[w] || 0), 0);

    // U-curve position boost: reward sentences near the beginning and end
    // Normalized position 0..1, U-curve = high at edges, low in middle
    const pos = idx / (sentences.length - 1 || 1);
    const positionBoost = 1.5 * (Math.pow(pos - 0.5, 2) * 4); // peaks at 0 and 1

    // Penalize very short sentences (likely headings, labels, or fragments)
    const lengthPenalty = sWords.length < 4 ? 0.5 : 1;

    // Normalize by sqrt(length) to avoid over-weighting extremely long sentences
    return (wordScore / (Math.sqrt(sWords.length) || 1)) * lengthPenalty + positionBoost;
  });

  // Pick top sentences and sort them by original appearance order
  const topIndices = scores
    .map((score, index) => ({ score, index }))
    .sort((a, b) => b.score - a.score)
    .slice(0, maxSentences)
    .map(item => item.index)
    .sort((a, b) => a - b);

  return topIndices.map(i => sentences[i]).join(' ');
}
