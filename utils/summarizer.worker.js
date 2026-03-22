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
  // Limit text size to 20,000 chars for safety
  const content = (manualText || text || '').substring(0, 20000);
  
  if (!content) return '';

  const sentences = content.match(/[^.!?]+[.!?]+/g) || [content];
  if (sentences.length <= 4) return sentences.join(' ');

  // Score sentences based on word frequency
  const words = content.toLowerCase().match(/\b\w{4,}\b/g) || [];
  const freq = {};
  words.forEach(w => freq[w] = (freq[w] || 0) + 1);

  const scores = sentences.map(s => {
    const sWords = s.toLowerCase().match(/\b\w{4,}\b/g) || [];
    const wordScore = sWords.reduce((acc, w) => acc + (freq[w] || 0), 0);
    return wordScore / (Math.sqrt(sWords.length) || 1); // Normalize by length
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
