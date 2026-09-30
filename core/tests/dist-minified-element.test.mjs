// Smoke test for real minification (issue #600): imports a real minified dist/elements/<name>.js module -- the exact file a non-Blazor
// page's js/loader.js loads -- through a minimal, hand-rolled DOM shim (no jsdom: the root package.json's only devDependency is esbuild)
// and checks the minified output still defines its custom element and renders correctly. Nothing else exercises minified output executing;
// core/tests/budgets.test.mjs only measures its gzip size, and core/tests/browser/ (real-DOM coverage) is manual and does not run in CI.
import './needs-bootstrap.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ---- A minimal fake DOM: only what js/element.js's constructor, connectedCallback, render() and part() touch. ----

class FakeEventTarget {
    addEventListener() {}
    removeEventListener() {}
    dispatchEvent() { return true; }
}

class FakeNode extends FakeEventTarget {
    constructor(nodeType) { super(); this.nodeType = nodeType; this.childNodes = []; }
    appendChild(n) { this.childNodes.push(n); return n; }
}

class FakeText extends FakeNode {
    constructor(value) { super(3); this.nodeValue = value; }
    cloneNode() { return new FakeText(this.nodeValue); }
}

// Recursively finds the first descendant (depth-first) matching one of the tiny selector forms PkElement itself uses:
// `[part~="x"]` (part()) and `slot[name="x"]` / `slot:not([name])` (slotted()/watchSlot()).
function query(node, sel) {
    for (const child of node.childNodes) {
        if (child.nodeType === 1 && matches(child, sel)) return child;
        if (child.nodeType === 1) { const found = query(child, sel); if (found) return found; }
    }
    return null;
}
function matches(el, sel) {
    const part = sel.match(/^\[part~="([^"]+)"\]$/);
    if (part) return (el.getAttribute('part') ?? '').split(/\s+/).includes(part[1]);
    const namedSlot = sel.match(/^slot\[name="([^"]+)"\]$/);
    if (namedSlot) return el.tagName === 'SLOT' && el.getAttribute('name') === namedSlot[1];
    if (sel === 'slot:not([name])') return el.tagName === 'SLOT' && !el.hasAttribute('name');
    return false;
}

class FakeElement extends FakeNode {
    constructor(tag) { super(1); this.tagName = tag.toUpperCase(); this._attrs = new Map(); this.hidden = false; }
    get attributes() { return [...this._attrs.entries()].map(([name, value]) => ({ name, value })); }
    getAttribute(n) { return this._attrs.has(n) ? this._attrs.get(n) : null; }
    setAttribute(n, v) { this._attrs.set(n, String(v)); }
    removeAttribute(n) { this._attrs.delete(n); }
    hasAttribute(n) { return this._attrs.has(n); }
    toggleAttribute(n, force) { const has = this._attrs.has(n); const want = force === undefined ? !has : !!force; if (want) this._attrs.set(n, ''); else this._attrs.delete(n); return want; }
    set textContent(v) { this.childNodes = [new FakeText(String(v))]; }
    get textContent() { return this.childNodes.map(c => c.nodeType === 3 ? c.nodeValue : c.textContent).join(''); }
    appendChild(n) { this.childNodes.push(n); return n; }
    querySelector(sel) { return query(this, sel); }
    cloneNode(deep) { const c = new FakeElement(this.tagName); c._attrs = new Map(this._attrs); if (deep) c.childNodes = this.childNodes.map(ch => ch.cloneNode(true)); return c; }
}

class FakeFragment extends FakeNode {
    constructor() { super(11); }
    cloneNode(deep) { const c = new FakeFragment(); if (deep) c.childNodes = this.childNodes.map(ch => ch.cloneNode(true)); return c; }
}

// A tiny HTML parser: element templates are plain, well-formed markup (no doctype, no unquoted/boolean attributes without a value here).
function parseHTML(html) {
    const frag = new FakeFragment();
    const stack = [frag];
    const re = /<\/([a-zA-Z0-9-]+)>|<([a-zA-Z0-9-]+)((?:\s+[a-zA-Z-]+(?:="[^"]*")?)*)\s*\/?>|([^<]+)/g;
    let m;
    while ((m = re.exec(html))) {
        if (m[1]) { stack.pop(); continue; }
        if (m[2]) {
            const el = new FakeElement(m[2]);
            for (const am of (m[3] ?? '').matchAll(/([a-zA-Z-]+)(?:="([^"]*)")?/g)) el.setAttribute(am[1], am[2] ?? '');
            stack[stack.length - 1].appendChild(el);
            if (!/\/>$/.test(m[0])) stack.push(el);
            continue;
        }
        if (m[4] && m[4].trim() !== '') stack[stack.length - 1].appendChild(new FakeText(m[4]));
    }
    return frag;
}

class FakeShadowRoot extends FakeElement {
    constructor() { super('#shadow-root'); this.adoptedStyleSheets = []; }
    replaceChildren(node) { this.childNodes = node.nodeType === 11 ? [...node.childNodes] : [node]; }
}

class FakeHTMLElement extends FakeEventTarget {
    attachShadow() { this.shadowRoot = new FakeShadowRoot(); return this.shadowRoot; }
    attachInternals() { return {}; }
    getAttribute() { return null; }
    setAttribute() {}
    toggleAttribute() {}
    hasAttribute() { return false; }
}

class FakeTreeWalker {
    constructor(root) { this.stack = [...root.childNodes].reverse(); }
    nextNode() {
        while (this.stack.length) {
            const n = this.stack.pop();
            if (n.nodeType === 1) for (let i = n.childNodes.length - 1; i >= 0; i--) this.stack.push(n.childNodes[i]);
            if (n.nodeType === 1 || n.nodeType === 3) return n;
        }
        return null;
    }
}

globalThis.HTMLElement = FakeHTMLElement;
globalThis.CSSStyleSheet = class { replaceSync() {} };
globalThis.CustomEvent = class extends Event { constructor(type, init = {}) { super(type, init); this.detail = init.detail; } };
const registry = new Map();
globalThis.customElements = { define: (tag, cls) => registry.set(tag, cls), get: tag => registry.get(tag) };
globalThis.document = {
    createElement(tag) {
        if (tag === 'template') return { content: new FakeFragment(), set innerHTML(html) { this.content = parseHTML(html); } };
        return new FakeElement(tag);
    },
    createTreeWalker: (root) => new FakeTreeWalker(root),
};

test('a minified dist/elements/<name>.js module still defines its custom element and renders', async () => {
    const url = pathToFileURL(path.join(root, 'dist/elements/badge.js')).href;
    const mod = await import(url);
    const Badge = mod.default;
    assert.equal(Badge.tag, 'pk-badge');
    assert.equal(customElements.get('pk-badge'), Badge, 'define() registered the minified class under its tag');

    const el = new Badge();
    assert.ok(el.shadowRoot, 'the constructor attached a shadow root and cloned the (minified) template into it');
    el.count = '150';
    el.max = 99;
    el.connectedCallback();
    const countPart = el.shadowRoot.querySelector('[part~="count"]');
    assert.ok(countPart, 'the minified template still carries its part="count" node');
    assert.equal(countPart.textContent, '99+', 'the minified behaviour module still formats and renders the count');
});
