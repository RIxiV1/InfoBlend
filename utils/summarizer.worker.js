/**
 * Summarizer Web Worker.
 * Offloads text-heavy processing from the main thread.
 */

self.onmessage = function(e) {
  const { text, manualText } = e.data;
  const summary = generateIntelligentSummary(text, manualText);
  self.postMessage(summary);
};

function generateIntelligentSummary(text, manualText = null) {
  const content = (manualText || text || '').substring(0, 20000);
  if (!content) return '';

  const sentences = content.match(/[^.!?]+[.!?]+/g) || [content];
  if (sentences.length <= 4) return sentences.join(' ');

  // Standard English Stop Words
  const stopWords = new Set(['the', 'and', 'for', 'was', 'with', 'that', 'this', 'but', 'from', 'have', 'were', 'not', 'will', 'your', 'their', 'when', 'which', 'than', 'more', 'about', 'some', 'could', 'should', 'would', 'into', 'these', 'those', 'also', 'only', 'very']);

  // Score sentences based on word frequency
  const rawWords = content.toLowerCase().match(/\b\w{3,}\b/g) || [];
  const freq = {};
  rawWords.forEach(w => {
    if (!stopWords.has(w)) freq[w] = (freq[w] || 0) + 1;
  });

  const scores = sentences.map((s, idx) => {
    const sWords = s.toLowerCase().match(/\b\w{3,}\b/g) || [];
    let wordScore = sWords.reduce((acc, w) => acc + (freq[w] || 0), 0);
    
    // Position-based boosting (early sentences usually more important)
    const positionBoost = (sentences.length - idx) / sentences.length * 2.0;
    
    return (wordScore / (Math.sqrt(sWords.length) || 1)) + positionBoost; // Length normalization
  });

  // Pick top 4 sentences and sort by appearance order
  const topIndices = scores
    .map((score, index) => ({ score, index }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map(item => item.index)
    .sort((a, b) => a - b);

  return topIndices.map(i => sentences[i].trim()).join(' ');
}
