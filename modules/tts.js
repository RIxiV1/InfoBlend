/**
 * InfoBlend — Text-to-Speech (Web Speech API wrapper)
 *
 * Universal pronunciation fallback for when the Dictionary API doesn't return
 * an audio clip (Wiktionary/Wikipedia/Datamuse, or unrecognized words). Lives
 * on window.__ib.tts so content-script modules can call ib.tts.speak(...).
 *
 * Edge cases handled:
 *   - speechSynthesis missing entirely (unsupported browser) → speak() returns
 *     false; callers should hide the button instead of presenting dead UI.
 *   - Voices load asynchronously in Chromium; first speak() call awaits the
 *     `voiceschanged` event with a 1.5s timeout fallback.
 *   - Long selections capped at 200 chars (pronunciation, not narration).
 *   - Empty / whitespace-only text rejected.
 *   - Concurrent speak() calls cancel the previous utterance — speechSynthesis
 *     is a single global queue, not per-instance.
 *   - Watchdog timer finishes stuck utterances (Chrome occasionally drops
 *     queued speech when the tab is backgrounded).
 *   - Stale callbacks: caller-supplied onStart/onEnd only fire once.
 */
(() => {
  const ib = window.__ib = window.__ib || {};
  if (ib._ttsLoaded && ib.tts) return;
  ib._ttsLoaded = true;

  const synth = window.speechSynthesis;
  const Utter = window.SpeechSynthesisUtterance;
  const supported = !!(synth && typeof Utter === 'function');

  let _voicesReady = null;
  let _activeUtter = null;

  /**
   * Resolve with the list of available voices. Chromium fires `voiceschanged`
   * asynchronously on first access; Firefox returns voices synchronously.
   * Cached after first resolution.
   */
  function ensureVoices() {
    if (!supported) return Promise.resolve([]);
    if (_voicesReady) return _voicesReady;
    _voicesReady = new Promise((resolve) => {
      const initial = synth.getVoices();
      if (initial && initial.length) { resolve(initial); return; }
      let done = false;
      const finish = (voices) => { if (done) return; done = true; resolve(voices); };
      const onChange = () => {
        synth.removeEventListener('voiceschanged', onChange);
        finish(synth.getVoices() || []);
      };
      synth.addEventListener('voiceschanged', onChange);
      // Some environments never fire voiceschanged if no voices are installed.
      setTimeout(() => {
        synth.removeEventListener('voiceschanged', onChange);
        finish(synth.getVoices() || []);
      }, 1500);
    });
    return _voicesReady;
  }

  function pickVoice(voices, lang) {
    if (!voices.length) return null;
    const want = (lang || 'en-US').toLowerCase();
    const base = want.split('-')[0];
    return (
      voices.find(v => v.lang?.toLowerCase() === want) ||
      voices.find(v => v.lang?.toLowerCase().startsWith(base + '-')) ||
      voices.find(v => v.lang?.toLowerCase() === base) ||
      voices.find(v => v.default) ||
      voices[0]
    );
  }

  /**
   * @param {string} text
   * @param {{lang?: string, onStart?: () => void, onEnd?: () => void}} [opts]
   * @returns {boolean} true if a speak request was issued; false if unsupported,
   *   empty text, or browser blocked it. Callers should hide the speaker UI
   *   when isSupported() returns false.
   */
  function speak(text, opts = {}) {
    if (!supported) { opts.onEnd?.(); return false; }
    const clean = String(text || '').trim().replace(/\s+/g, ' ').slice(0, 200);
    if (!clean) { opts.onEnd?.(); return false; }

    // speechSynthesis is a global queue — always cancel before starting fresh.
    try { synth.cancel(); } catch { /* no-op */ }

    const lang = opts.lang || 'en-US';
    const utter = new Utter(clean);
    utter.lang = lang;
    utter.rate = 0.95;
    utter.pitch = 1;
    utter.volume = 1;
    _activeUtter = utter;

    let ended = false;
    const finish = () => {
      if (ended) return;
      ended = true;
      if (_activeUtter === utter) _activeUtter = null;
      opts.onEnd?.();
    };

    utter.onstart = () => { try { opts.onStart?.(); } catch { /* user code */ } };
    utter.onend = finish;
    utter.onerror = finish;

    ensureVoices().then(voices => {
      const v = pickVoice(voices, lang);
      if (v) utter.voice = v;
      try { synth.speak(utter); }
      catch { finish(); }
    });

    // Watchdog: 200-char cap means even slow voices finish in ~12s. Anything
    // past 15s is a dropped queue — clear the visual state regardless.
    setTimeout(() => { if (!ended && _activeUtter === utter) finish(); }, 15000);

    return true;
  }

  function cancel() {
    if (!supported) return;
    try { synth.cancel(); } catch { /* no-op */ }
    _activeUtter = null;
  }

  function isSpeaking() {
    return !!(supported && (synth.speaking || _activeUtter));
  }

  ib.tts = { speak, cancel, isSpeaking, isSupported: () => supported };
})();
