import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// --- Minimal DOM mock ---
class MockElement {
  constructor(tag) {
    this.tagName = tag;
    this.children = [];
    this.childNodes = [];
    this.className = '';
    this.id = '';
    this.textContent = '';
    this.style = {};
    this._attrs = {};
    this._shadow = null;
  }
  appendChild(child) { this.children.push(child); this.childNodes.push(child); return child; }
  setAttribute(k, v) { this._attrs[k] = v; }
  getAttribute(k) { return this._attrs[k]; }
  attachShadow(opts) {
    this._shadow = new MockElement('shadow-root');
    this._shadow.mode = opts.mode;
    return this._shadow;
  }
  get shadowRoot() { return this._shadow; }
}

class MockTextNode {
  constructor(text) { this.textContent = text; this.nodeType = 3; }
}

class MockDocumentFragment {
  constructor() { this.children = []; this.childNodes = []; }
  appendChild(child) { this.children.push(child); this.childNodes.push(child); return child; }
}

const createdElements = [];

globalThis.document = {
  createElement: (tag) => { const el = new MockElement(tag); createdElements.push(el); return el; },
  createTextNode: (text) => new MockTextNode(text),
  createDocumentFragment: () => new MockDocumentFragment(),
  body: { appendChild: () => {}, children: [] }
};

globalThis.chrome = {
  runtime: { id: 'test-id', getURL: (p) => `chrome-extension://test-id/${p}` },
  storage: { local: { get: async () => ({}), set: async () => {} } }
};

globalThis.window = {
  __ib: { modulesLoaded: false, _loadingPromise: null, sendMessage: async () => {}, getStorage: async () => ({}) },
  matchMedia: () => ({ matches: true })
};

// Load core module
await import('../modules/core.js');

const ib = globalThis.window.__ib;

describe('core.js — createShadowHost', () => {

  beforeEach(() => { createdElements.length = 0; });

  it('exports createShadowHost', () => {
    assert.equal(typeof ib.createShadowHost, 'function');
  });

  it('creates a host element with shadow DOM', () => {
    const { host, shadow } = ib.createShadowHost('test-host');
    assert.equal(host.id, 'test-host');
    assert.ok(shadow);
    assert.equal(host.style.zIndex, '2147483647');
    assert.equal(host.style.position, 'fixed');
  });

  it('loads default CSS file', () => {
    const { shadow } = ib.createShadowHost('test-css');
    const links = shadow.children.filter(c => c.tagName === 'link');
    assert.equal(links.length, 1);
    // chrome.runtime.getURL sets .href directly as a property, not via setAttribute
    assert.ok(links[0].href?.includes('styles/content.css') || links[0]._attrs.href?.includes('styles/content.css'));
  });

  it('loads custom CSS files', () => {
    const { shadow } = ib.createShadowHost('test-multi-css', ['overlay/overlay.css']);
    const links = shadow.children.filter(c => c.tagName === 'link');
    assert.equal(links.length, 1);
    assert.ok(links[0].href?.includes('overlay/overlay.css') || links[0]._attrs.href?.includes('overlay/overlay.css'));
  });

  it('loads multiple CSS files', () => {
    const { shadow } = ib.createShadowHost('test-both-css', ['styles/content.css', 'overlay/overlay.css']);
    const links = shadow.children.filter(c => c.tagName === 'link');
    assert.equal(links.length, 2);
  });
});

describe('core.js — smartHighlight', () => {

  it('exports smartHighlight', () => {
    assert.equal(typeof ib.smartHighlight, 'function');
  });

  it('returns text node for empty input', () => {
    const result = ib.smartHighlight('');
    assert.ok(result instanceof MockTextNode);
  });

  it('returns text node for null', () => {
    const result = ib.smartHighlight(null);
    assert.ok(result instanceof MockTextNode);
  });

  it('highlights AI in text', () => {
    const frag = ib.smartHighlight('Using AI for tasks');
    const spans = frag.children.filter(c => c.className === 'ib-highlight');
    assert.equal(spans.length, 1);
    assert.equal(spans[0].textContent, 'AI');
  });

  it('highlights multiple different acronyms', () => {
    const frag = ib.smartHighlight('The API uses JSON over HTTP');
    const spans = frag.children.filter(c => c.className === 'ib-highlight');
    const terms = spans.map(s => s.textContent);
    assert.ok(terms.includes('API'));
    assert.ok(terms.includes('JSON'));
    assert.ok(terms.includes('HTTP'));
  });

  it('only highlights first occurrence of each term', () => {
    const frag = ib.smartHighlight('AI is great. AI is powerful.');
    const spans = frag.children.filter(c => c.className === 'ib-highlight');
    assert.equal(spans.length, 1, 'Should only highlight AI once');
  });

  it('does not highlight regular words', () => {
    const frag = ib.smartHighlight('The cat sat on the mat');
    const spans = frag.children.filter(c => c.className === 'ib-highlight');
    assert.equal(spans.length, 0);
  });

  it('highlights ML (2-char acronym)', () => {
    const frag = ib.smartHighlight('ML models are improving');
    const spans = frag.children.filter(c => c.className === 'ib-highlight');
    assert.equal(spans.length, 1);
    assert.equal(spans[0].textContent, 'ML');
  });

  it('preserves non-highlighted text', () => {
    const frag = ib.smartHighlight('hello world');
    const textNodes = frag.children.filter(c => c instanceof MockTextNode);
    const allText = textNodes.map(n => n.textContent).join('');
    assert.equal(allText, 'hello world');
  });
});

describe('core.js — BentoRenderer', () => {

  it('exports BentoRenderer', () => {
    assert.ok(ib.BentoRenderer);
    assert.equal(typeof ib.BentoRenderer.render, 'function');
  });

  it('renders single paragraph', () => {
    const container = new MockElement('div');
    ib.BentoRenderer.render('Hello world this is a test.', container);
    assert.equal(container.children.length, 1);
    assert.equal(container.children[0].className, 'ib-bento-grid');
  });

  it('splits on double newlines', () => {
    const container = new MockElement('div');
    ib.BentoRenderer.render('First paragraph here.\n\nSecond paragraph here.', container);
    const grid = container.children[0];
    const cards = grid.children.filter(c => c.className === 'ib-bento-card');
    assert.equal(cards.length, 2);
  });

  it('filters out very short fragments', () => {
    const container = new MockElement('div');
    ib.BentoRenderer.render('OK.\n\nThis is a real paragraph with content.', container);
    const grid = container.children[0];
    const cards = grid.children.filter(c => c.className === 'ib-bento-card');
    // "OK." is 3 chars, filtered by > 5 check
    assert.equal(cards.length, 1);
  });

  it('renders fallback for empty fragments', () => {
    const container = new MockElement('div');
    ib.BentoRenderer.render('Hi', container); // "Hi" is < 5 chars but becomes only item
    const grid = container.children[0];
    assert.ok(grid.children.length >= 1, 'Should still render content');
  });

  it('splits on bullet points', () => {
    const container = new MockElement('div');
    ib.BentoRenderer.render('Introduction text here.\n- First bullet point item.\n- Second bullet point item.', container);
    const grid = container.children[0];
    assert.ok(grid.children.length >= 2, 'Should split on bullet points');
  });
});
