/**
 * Local Extractive Summarizer
 * Offloaded to the background script to bypass Content Security Policy constraints.
 */

export function generateIntelligentSummary(text, manualText = null, maxSentences = 4) {
  const raw = manualText || text || '';
  
  // Truncate at the last sentence boundary within the 20,000 char safety limit
  const truncated = raw.length > 20000 
    ? raw.substring(0, 20000).replace(/[^.!?]*$/, '') 
    : raw;
    
  if (!truncated.trim()) return '';

  // Improved sentence splitting to avoid mangling abbreviations (e.g., Mr., Dr., U.S.A.)
  // We temporarily replace dots in common abbreviations with a placeholder
  const abbrs = /\b(Mr|Mrs|Ms|Dr|St|Prof|Jr|Sr|vs|min|max|etc|eg|ie|U\.S|U\.K|U\.N)\./gi;
  const preProcessed = truncated.replace(abbrs, (match) => match.replace('.', '[[DOT]]'));
  
  const sentencesRaw = preProcessed.match(/[^.!?]+[.!?]+/g) || [preProcessed];
  const sentences = sentencesRaw.map(s => s.replace(/\[\[DOT\]\]/g, '.').trim());

  if (sentences.length <= maxSentences) return sentences.join(' ');

  // Expanded Stop Words list to improve frequency accuracy
  const stopWords = new Set([
     'the', 'and', 'for', 'was', 'with', 'that', 'this', 'but', 'from', 'have', 'were', 
     'not', 'will', 'your', 'their', 'when', 'which', 'than', 'more', 'about', 'some', 
     'could', 'should', 'would', 'into', 'these', 'those', 'also', 'only', 'very',
     'are', 'has', 'its', 'all', 'one', 'can', 'who', 'how', 'they', 'our', 'out', 'she'
  ]);

  // Score sentences based on word frequency (minimum word length 3)
  const rawWords = truncated.toLowerCase().match(/\b\w{3,}\b/g) || [];
  const freq = {};
  rawWords.forEach(w => {
    if (!stopWords.has(w)) freq[w] = (freq[w] || 0) + 1;
  });

  const scores = sentences.map((s, idx) => {
    const sWords = s.toLowerCase().match(/\b\w{3,}\b/g) || [];
    let wordScore = sWords.reduce((acc, w) => acc + (freq[w] || 0), 0);
    
    // Position-based boosting: Mild U-curve (boost first and last sentences)
    // The first and last sections are typically most relevant in structured documents.
    const startBoost = (sentences.length - idx) / sentences.length * 1.2;
    const endBoost = (idx + 1) / sentences.length * 0.5;
    
    // Normalize by length using sqrt to avoid over-weighting extremely long sentences
    // (sWords.length || 1) guard ensures we don't divide by zero for punctuation-only strings.
    return (wordScore / (Math.sqrt(sWords.length) || 1)) + startBoost + endBoost;
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
