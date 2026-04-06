/**
 * Local Extractive Summarizer
 * Optimised for low-latency, cross-platform performance.
 */

export function generateIntelligentSummary(text, maxSentences = 4) {
  const raw = text || '';
  let truncated = raw.length > 20000 ? raw.substring(0, 20000).replace(/[^.!?]*$/, '') : raw;
  if (!truncated.trim()) return '';

  let sentences = [];
  try {
    const segmenter = new Intl.Segmenter('en', { granularity: 'sentence' });
    sentences = Array.from(segmenter.segment(truncated))
      .map(s => s.segment.trim())
      .filter(s => s.length > 10);
  } catch (e) {
    const abbrs = /\b(Mr|Mrs|Ms|Dr|St|Prof|Jr|Sr|vs|min|max|etc|eg|ie|U\.S|U\.K|U\.N)\./gi;
    const sentencesRaw = truncated.replace(abbrs, m => m.replace('.', '[[DOT]]')).match(/[^.!?]+[.!?]+/g) || [truncated];
    sentences = sentencesRaw.map(s => s.replace(/\[\[DOT\]\]/g, '.').trim());
  }

  if (sentences.length <= maxSentences) return sentences.join(' ');

  const stopWords = new Set(['the', 'and', 'for', 'was', 'with', 'that', 'this', 'but', 'from', 'have', 'were', 'not', 'will', 'your', 'their', 'when', 'which', 'than', 'more', 'about', 'some', 'could', 'should', 'would', 'into', 'these', 'those', 'also', 'only', 'very', 'are', 'has', 'its', 'all', 'one', 'can', 'who', 'how', 'they', 'our', 'out', 'she']);
  const freq = {};
  (truncated.toLowerCase().match(/\b\w{3,}\b/g) || []).forEach(w => { if (!stopWords.has(w)) freq[w] = (freq[w] || 0) + 1; });

  const scores = sentences.map((s, idx) => {
    const sWords = s.toLowerCase().match(/\b\w{3,}\b/g) || [];
    const wordScore = sWords.reduce((acc, w) => acc + (freq[w] || 0), 0);
    const posBoost = ((sentences.length - idx) / sentences.length * 1.2) + ((idx + 1) / sentences.length * 0.5);
    return (wordScore / (Math.sqrt(sWords.length) || 1)) + posBoost;
  });

  return scores.map((score, index) => ({ score, index }))
    .sort((a, b) => b.score - a.score)
    .slice(0, maxSentences)
    .sort((a, b) => a.index - b.index)
    .map(item => sentences[item.index]).join(' ');
}
