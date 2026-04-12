import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// --- DOM mock (extend from core.test.js pattern) ---
class MockElement {
  constructor(tag) {
    this.tagName = tag;
    this.children = [];
    this.className = '';
    this.classList = {
      _classes: new Set(),
      add(c) { this._classes.add(c); },
      remove(c) { this._classes.delete(c); },
      contains(c) { return this._classes.has(c); },
      toggle(c, force) { if (force) this._classes.add(c); else this._classes.delete(c); }
    };
    this.id = '';
    this.textContent = '';
    this.innerHTML = '';
    this.style = {};
    this._attrs = {};
    this._shadow = null;
    this._listeners = {};
    this.parentNode = null;
    this.onclick = null;
  }
  appendChild(child) { this.children.push(child); if (child && typeof child === 'object') child.parentNode = this; return child; }
  insertBefore(child, ref) { const i = this.children.indexOf(ref); if (i >= 0) this.children.splice(i, 0, child); else this.children.push(child); return child; }
  setAttribute(k, v) { this._attrs[k] = v; }
  getAttribute(k) { return this._attrs[k]; }
  querySelector(sel) {
    const cls = sel.startsWith('.') ? sel.slice(1) : null;
    for (const c of this.children) {
      if (cls && (c.className?.includes(cls) || c.classList?._classes?.has(cls))) return c;
      if (c.querySelector) { const found = c.querySelector(sel); if (found) return found; }
    }
    return null;
  }
  remove() { this.parentNode = null; }
  focus() {}
  attachShadow(opts) { this._shadow = new MockElement('shadow-root'); this._shadow.mode = opts.mode; return this._shadow; }
  get shadowRoot() { return this._shadow; }
  addEventListener(event, handler) { this._listeners[event] = this._listeners[event] || []; this._listeners[event].push(handler); }
  removeEventListener(event, handler) { if (this._listeners[event]) this._listeners[event] = this._listeners[event].filter(h => h !== handler); }
}

class MockTextNode { constructor(text) { this.textContent = text; this.nodeType = 3; } }
class MockDocumentFragment {
  constructor() { this.children = []; }
  appendChild(child) { this.children.push(child); return child; }
}

globalThis.document = {
  createElement: (tag) => new MockElement(tag),
  createTextNode: (text) => new MockTextNode(text),
  createDocumentFragment: () => new MockDocumentFragment(),
  body: Object.assign(new MockElement('body'), { querySelectorAll: () => [] }),
  scripts: [],
  addEventListener: () => {},
  removeEventListener: () => {},
  querySelector: () => null,
  querySelectorAll: () => []
};

globalThis.chrome = {
  runtime: { id: 'test-id', getURL: (p) => `chrome-extension://test-id/${p}` },
  storage: { local: { get: async () => ({}), set: async () => {} } }
};

globalThis.window = {
  __ib: {
    modulesLoaded: true,
    sendMessage: async (msg, cb) => { cb?.({ success: true }); },
    getStorage: async () => ({ theme: 'dark' }),
    // Mock BentoRenderer
    BentoRenderer: {
      render: (content, container) => {
        const card = new MockElement('div');
        card.className = 'ib-bento-card';
        card.textContent = content;
        container.appendChild(card);
      }
    },
    smartHighlight: (text) => new MockTextNode(text),
    createShadowHost: (id, cssFiles) => {
      const host = new MockElement('div');
      host.id = id;
      const shadow = host.attachShadow({ mode: 'open' });
      return { host, shadow };
    }
  },
  innerWidth: 1920,
  innerHeight: 1080,
  matchMedia: () => ({ matches: true }),
  getComputedStyle: () => ({ display: 'block', visibility: 'visible' }),
  location: { hostname: 'example.com', pathname: '/' }
};

// Load overlay
await import('../modules/overlay.js');

const ib = globalThis.window.__ib;

describe('overlay.js — showLoadingOverlay', () => {

  it('exports showLoadingOverlay', () => {
    assert.equal(typeof ib.showLoadingOverlay, 'function');
  });

  it('creates overlay in panel mode by default', () => {
    const container = ib.showLoadingOverlay();
    assert.ok(container);
    // className is set as string, classList is used for mode classes
    assert.ok(container.className.includes('infoblend-overlay') || container.classList._classes.has('infoblend-overlay'));
  });

  it('creates overlay in tooltip mode with anchor', () => {
    const container = ib.showLoadingOverlay({ x: 500, y: 300, mode: 'tooltip' });
    assert.ok(container.classList._classes.has('ib-mode-tooltip'));
    assert.equal(container.style.width, '320px');
  });

  it('positions tooltip at anchor coordinates', () => {
    const container = ib.showLoadingOverlay({ x: 500, y: 300, mode: 'tooltip' });
    assert.equal(container.style.top, '300px');
    assert.ok(container.style.left);
  });

  it('flips tooltip up when near bottom of viewport', () => {
    const container = ib.showLoadingOverlay({ x: 500, y: 950, mode: 'tooltip' });
    assert.ok(container.classList._classes.has('ib-flip-up'));
  });

  it('clamps tooltip to left edge', () => {
    const container = ib.showLoadingOverlay({ x: 10, y: 300, mode: 'tooltip' });
    const left = parseInt(container.style.left);
    assert.ok(left >= 8, `Left should be >= 8, got ${left}`);
  });

  it('clamps tooltip to right edge', () => {
    const container = ib.showLoadingOverlay({ x: 1910, y: 300, mode: 'tooltip' });
    const left = parseInt(container.style.left);
    assert.ok(left <= 1920 - 320 - 8, `Left should not overflow right edge, got ${left}`);
  });

  it('creates header with close button', () => {
    const container = ib.showLoadingOverlay();
    const header = container.querySelector('.infoblend-header');
    assert.ok(header, 'Should have header');
  });

  it('creates skeleton loading state', () => {
    const container = ib.showLoadingOverlay();
    const loading = container.querySelector('.infoblend-loading');
    assert.ok(loading, 'Should have loading skeleton');
  });

  it('removes previous overlay when called again', () => {
    const first = ib.showLoadingOverlay();
    const second = ib.showLoadingOverlay();
    assert.notEqual(first, second);
  });
});

describe('overlay.js — updateOverlay', () => {

  it('exports updateOverlay', () => {
    assert.equal(typeof ib.updateOverlay, 'function');
  });

  it('renders rich definition data', () => {
    ib.showLoadingOverlay();
    ib.updateOverlay('test', '', 'Dictionary API', {
      isRich: true,
      meanings: [
        { partOfSpeech: 'noun', definitions: [{ text: 'A trial', example: 'Take a test.' }] }
      ],
      phonetic: '/tɛst/'
    });
    // Should not throw
  });

  it('renders notice state for errors', () => {
    ib.showLoadingOverlay();
    ib.updateOverlay('Notice', 'Something went wrong.', 'InfoBlend');
    // Should not throw
  });

  it('renders plain text through BentoRenderer', () => {
    ib.showLoadingOverlay();
    ib.updateOverlay('Summary', 'This is a summary of the page.', 'InfoBlend Local');
    // Should not throw
  });

  it('renders not-found with Merriam-Webster link', () => {
    ib.showLoadingOverlay();
    ib.updateOverlay('Not Found', 'No definition.', 'Merriam-Webster', {
      isNotFound: true,
      url: 'https://www.merriam-webster.com/dictionary/test'
    });
    // Should not throw
  });
});

describe('overlay.js — handleMessage', () => {

  it('exports handleMessage', () => {
    assert.equal(typeof ib.handleMessage, 'function');
  });

  it('handles SHOW_DEFINITION', () => {
    ib.handleMessage({
      type: 'SHOW_DEFINITION',
      data: { title: 'word', content: 'A definition.', source: 'Test' }
    });
    // Should not throw
  });

  it('handles SHOW_ERROR', () => {
    ib.handleMessage({ type: 'SHOW_ERROR', message: 'Something broke' });
  });

  it('handles SHOW_LOADING', () => {
    ib.handleMessage({ type: 'SHOW_LOADING' });
  });

  it('handles SUMMARIZE_PAGE', () => {
    ib.handleMessage({ type: 'SUMMARIZE_PAGE' });
  });

  it('handles SUMMARIZE_SELECTION', () => {
    ib.handleMessage({ type: 'SUMMARIZE_SELECTION', text: 'Some text to summarize.' });
  });
});
