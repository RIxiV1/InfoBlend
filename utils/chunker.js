/**
 * Article chunking + relevance scoring for Chat-with-the-Page.
 *
 * Previously the entire article (capped at 12k chars) was shipped to the AI
 * with the user's question. That worked for short articles but was wasteful
 * on long ones (slow, expensive, and the model often answered from the
 * wrong section). Now: split into ~800-char sentence-bounded chunks, score
 * against the question with BM25-lite, and send only the top-K chunks plus
 * numbered indices the model can cite back. The overlay surfaces the cited
 * chunks as "Sources" so the user can verify the answer.
 *
 * Pure JS, no deps. Safe to call from a service worker.
 */

const STOP = new Set([
  'a','an','and','are','as','at','be','by','for','from','has','have','he','in','is','it',
  'its','of','on','or','that','the','this','to','was','were','will','with','what','which',
  'who','why','how','do','does','did','can','could','should','would','about','into','than',
  'then','them','their','there','here','i','you','your','we','our','my','me'
]);

function tokenize(s) {
  const out = [];
  for (const m of String(s || '').toLowerCase().matchAll(/[\p{L}\p{N}]+/gu)) {
    const w = m[0];
    if (w.length >= 2 && !STOP.has(w)) out.push(w);
  }
  return out;
}

/**
 * Split text into chunks of roughly `targetChars` characters, respecting
 * sentence boundaries so the model never sees a chunk that starts mid-sentence.
 * Falls back to hard slicing if a single "sentence" exceeds the target by 2x
 * (defensive against badly-extracted articles with no punctuation).
 */
export function chunk(text, { targetChars = 800, maxChunks = 40 } = {}) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  // Sentence-ish split. Keeps the terminator. Multi-language safe enough for now.
  const sentences = clean.match(/[^.!?。！？]+[.!?。！？]*/g) || [clean];

  const chunks = [];
  let buf = '';
  for (const raw of sentences) {
    const s = raw.trim();
    if (!s) continue;
    if (s.length > targetChars * 2) {
      // Defensive: a "sentence" wildly larger than the target means the
      // splitter failed (no punctuation, dumped HTML). Hard-slice it.
      if (buf) { chunks.push(buf); buf = ''; }
      for (let i = 0; i < s.length; i += targetChars) {
        chunks.push(s.slice(i, i + targetChars));
        if (chunks.length >= maxChunks) return chunks;
      }
      continue;
    }
    if ((buf + ' ' + s).length > targetChars && buf) {
      chunks.push(buf);
      buf = s;
    } else {
      buf = buf ? `${buf} ${s}` : s;
    }
    if (chunks.length >= maxChunks) break;
  }
  if (buf && chunks.length < maxChunks) chunks.push(buf);
  return chunks;
}

/**
 * BM25-lite scoring. Picks the top-K chunks most relevant to the question.
 * Returns an array of { index, score, text } sorted by score descending,
 * filtered to score > 0 (a zero-score result means no query term hit it
 * and including it would just be noise).
 *
 * BM25 params k1=1.5, b=0.75 are the standard defaults; tweaking them for
 * this scale (10-40 chunks) doesn't meaningfully change the ranking.
 */
export function scoreChunks(chunks, question, { topK = 5 } = {}) {
  if (!chunks?.length) return [];
  const qTerms = Array.from(new Set(tokenize(question)));
  if (!qTerms.length) {
    // No usable query terms (e.g. "what?") — return the first K chunks so the
    // answer is at least grounded in the start of the article.
    return chunks.slice(0, topK).map((text, index) => ({ index, score: 0, text }));
  }

  const tokenized = chunks.map(c => tokenize(c));
  const lengths = tokenized.map(t => t.length || 1);
  const avgLen = lengths.reduce((a, b) => a + b, 0) / lengths.length;

  // Document frequencies for IDF.
  const df = new Map();
  for (const term of qTerms) {
    let count = 0;
    for (const doc of tokenized) if (doc.includes(term)) count++;
    df.set(term, count);
  }

  const k1 = 1.5, b = 0.75;
  const N = tokenized.length;

  const scored = tokenized.map((doc, i) => {
    let score = 0;
    const tf = new Map();
    for (const w of doc) tf.set(w, (tf.get(w) || 0) + 1);
    for (const term of qTerms) {
      const dfT = df.get(term) || 0;
      if (dfT === 0) continue;
      const tfT = tf.get(term) || 0;
      if (tfT === 0) continue;
      const idf = Math.log(1 + (N - dfT + 0.5) / (dfT + 0.5));
      const norm = tfT * (k1 + 1) / (tfT + k1 * (1 - b + b * lengths[i] / avgLen));
      score += idf * norm;
    }
    return { index: i, score, text: chunks[i] };
  });

  return scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

/**
 * Pull `[N]` citation markers out of the model's answer. Returns a Set of
 * 1-based indices the model referenced. Defensive against the model writing
 * `[1, 2]`, `[1][2]`, or `[1-3]` ranges.
 */
export function parseCitations(answer) {
  const out = new Set();
  if (!answer) return out;
  // Match [N], [N, M], [N-M], [N][M]
  for (const m of String(answer).matchAll(/\[(\d+(?:\s*[-,\s]\s*\d+)*)\]/g)) {
    const inside = m[1];
    // Expand ranges like "1-3"
    for (const part of inside.split(/[,\s]+/)) {
      const range = part.match(/^(\d+)-(\d+)$/);
      if (range) {
        const lo = +range[1], hi = +range[2];
        for (let i = lo; i <= hi; i++) out.add(i);
      } else if (/^\d+$/.test(part)) {
        out.add(+part);
      }
    }
  }
  return out;
}
