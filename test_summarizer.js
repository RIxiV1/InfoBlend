
// Mocking the function from summarizer.worker.js
function generateIntelligentSummary(text, manualText = null, maxSentences = 4) {
  const raw = manualText || text || '';
  
  const truncated = raw.length > 20000 
    ? raw.substring(0, 20000).replace(/[^.!?]*$/, '') 
    : raw;
    
  if (!truncated.trim()) return '';

  const abbrs = /\b(Mr|Mrs|Ms|Dr|St|Prof|Jr|Sr|vs|min|max|etc|eg|ie|U\.S|U\.K|U\.N)\./gi;
  const preProcessed = truncated.replace(abbrs, (match) => match.replace('.', '[[DOT]]'));
  
  const sentencesRaw = preProcessed.match(/[^.!?]+[.!?]+/g) || [preProcessed];
  const sentences = sentencesRaw.map(s => s.replace(/\[\[DOT\]\]/g, '.').trim());

  if (sentences.length <= maxSentences) return sentences.join(' ');

  const stopWords = new Set([
     'the', 'and', 'for', 'was', 'with', 'that', 'this', 'but', 'from', 'have', 'were', 
     'not', 'will', 'your', 'their', 'when', 'which', 'than', 'more', 'about', 'some', 
     'could', 'should', 'would', 'into', 'these', 'those', 'also', 'only', 'very',
     'are', 'has', 'its', 'all', 'one', 'can', 'who', 'how', 'they', 'our', 'out', 'she'
  ]);

  const rawWords = truncated.toLowerCase().match(/\b\w{3,}\b/g) || [];
  const freq = {};
  rawWords.forEach(w => {
    if (!stopWords.has(w)) freq[w] = (freq[w] || 0) + 1;
  });

  const scores = sentences.map((s, idx) => {
    const sWords = s.toLowerCase().match(/\b\w{3,}\b/g) || [];
    let wordScore = sWords.reduce((acc, w) => acc + (freq[w] || 0), 0);
    const startBoost = (sentences.length - idx) / sentences.length * 1.2;
    const endBoost = (idx + 1) / sentences.length * 0.5;
    return (wordScore / (Math.sqrt(sWords.length) || 1)) + startBoost + endBoost;
  });

  const topIndices = scores
    .map((score, index) => ({ score, index }))
    .sort((a, b) => b.score - a.score)
    .slice(0, maxSentences)
    .map(item => item.index)
    .sort((a, b) => a - b);

  return topIndices.map(i => sentences[i]).join(' ');
}

// Test Data
const testText = "Mr. Smith went to the U.S.A. for a vacation. He enjoyed the sun and the beach. The U.S.A. is a large country with many sights. However, Dr. Jones stayed home. It was a very productive week for Dr. Jones. In conclusion, both had a good time.";
console.log("SHORT_SUMMARY_START");
console.log(generateIntelligentSummary(testText, null, 2));
console.log("SHORT_SUMMARY_END");

const longText = "The artificial intelligence field is growing rapidly. AI systems are being integrated into daily life. This integration brings both benefits and challenges. Ethical considerations are paramount when designing AI. " + 
  "Many researchers focus on natural language processing. NLP allows machines to understand human speech. This is a complex task involving linguistics and computer science. " +
  "Deep learning has revolutionized the field. Neural networks are used to model complex patterns. Large datasets are required for training these models. " +
  "In the future, AI will be even more autonomous. We must ensure that these systems remain aligned with human values. This alignment problem is a key area of current research.";

console.log("LONG_SUMMARY_START");
console.log(generateIntelligentSummary(longText, null, 3));
console.log("LONG_SUMMARY_END");
