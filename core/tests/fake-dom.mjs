// A tiny DOM for testing the SDK's wiring under Node without a dependency. It supports what the modules use: classes,
// attributes, hidden, a small selector language (tag, .class, [attr], [attr="v"], descendant and > combinators, :scope >),
// bubbling events, click() and focus(). It is a test double, not a browser: layout properties are plain fields tests set.

export class FakeEvent {
    constructor(type, init = {}) { this.type = type; this.bubbles = init.bubbles ?? true; this.cancelable = init.cancelable ?? true; this.detail = init.detail; this.key = init.key; this.defaultPrevented = false; this.target = null; }
    preventDefault() { if (this.cancelable) this.defaultPrevented = true; }
    stopPropagation() { this.stopped = true; }
}

const parseCompound = s => {
    const c = { tag: null, classes: [], attrs: [] };
    for (const m of s.matchAll(/([.#]?[\w-]+)|\[([\w-]+)(?:="([^"]*)")?\]/g)) {
        if (m[2]) c.attrs.push([m[2], m[3]]);
        else if (m[1].startsWith('.')) c.classes.push(m[1].slice(1));
        else c.tag = m[1].toUpperCase();
    }
    return c;
};

const parseSelector = sel => {
    const tokens = sel.replace(/:scope\s*>/, '>').replace(/>/g, ' > ').split(/\s+/).filter(Boolean);
    const parts = []; let comb = ' ';
    for (const t of tokens) {
        if (t === '>') { comb = '>'; continue; }
        if (t === '') { parts.push({ scope: true, comb: ' ' }); continue; }
        parts.push({ ...parseCompound(t), comb }); comb = ' ';
    }
    return parts;
};

export class FakeElement {
    constructor(tag, doc) {
        this.tagName = tag.toUpperCase(); this.ownerDocument = doc; this.children = []; this.parentElement = null; this._attrs = new Map(); this._listeners = new Map();
        this._classes = new Set(); this.hidden = false; this.tabIndex = -1; this.scrollLeft = 0; this.offsetLeft = 0; this.offsetWidth = 0; this.clientWidth = 0;
        const self = this;
        this.classList = {
            add: (...c) => c.forEach(x => self._classes.add(x)), remove: (...c) => c.forEach(x => self._classes.delete(x)),
            contains: c => self._classes.has(c),
            toggle: (c, force) => { const on = force ?? !self._classes.has(c); on ? self._classes.add(c) : self._classes.delete(c); return on; },
        };
    }
    get isConnected() { return true; }
    append(...kids) { for (const k of kids) { k.parentElement = this; this.children.push(k); } return this; }
    remove() { if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(c => c !== this); this.parentElement = null; }
    get previousElementSibling() { const s = this.parentElement?.children ?? []; return s[s.indexOf(this) - 1] ?? null; }
    setAttribute(n, v) { this._attrs.set(n, String(v)); if (n === 'class') this._classes = new Set(String(v).split(/\s+/).filter(Boolean)); if (n === 'hidden') this.hidden = true; }
    getAttribute(n) { return n === 'class' ? [...this._classes].join(' ') : this._attrs.has(n) ? this._attrs.get(n) : null; }
    hasAttribute(n) { return this._attrs.has(n); }
    removeAttribute(n) { this._attrs.delete(n); }
    addEventListener(t, fn) { (this._listeners.get(t) ?? this._listeners.set(t, []).get(t)).push(fn); }
    dispatchEvent(e) {
        e.target ??= this;
        for (let n = this; n && !e.stopped; n = e.bubbles ? n.parentElement ?? (n === this.ownerDocument.documentElement ? this.ownerDocument : null) : null) for (const fn of n._listeners?.get(e.type) ?? []) fn(e);
        return !e.defaultPrevented;
    }
    click() { this.dispatchEvent(new FakeEvent('click')); }
    focus() { this.ownerDocument.activeElement = this; }
    matches(sel) { return sel.split(',').some(s => matchChain(this, parseSelector(s.trim()), null)); }
    closest(sel) { for (let n = this; n; n = n.parentElement) if (n.matches?.(sel)) return n; return null; }
    querySelectorAll(sel) {
        const chain = parseSelector(sel.split(',')[0].trim());
        const out = [];
        const walk = n => { for (const c of n.children) { if (matchChain(c, chain, this)) out.push(c); walk(c); } };
        walk(this);
        return out;
    }
    querySelector(sel) { return this.querySelectorAll(sel)[0] ?? null; }
}

function matchOne(el, c) {
    if (c.tag && el.tagName !== c.tag) return false;
    if (!c.classes.every(x => el._classes.has(x))) return false;
    return c.attrs.every(([n, v]) => (v === undefined ? el.hasAttribute(n) : el.getAttribute(n) === v));
}

function matchChain(el, parts, scope, i = parts.length - 1) {
    if (i < 0) return true;
    const p = parts[i];
    if (p.scope) return el === scope;
    if (!matchOne(el, p)) return false;
    const prev = parts[i - 1];
    if (!prev) return true;
    if (prev.scope) return p.comb === '>' ? el.parentElement === scope : true;
    if (p.comb === '>') return !!el.parentElement && matchChain(el.parentElement, parts, scope, i - 1);
    for (let n = el.parentElement; n; n = n.parentElement) if (matchChain(n, parts, scope, i - 1)) return true;
    return false;
}

export function createDocument() {
    const doc = { activeElement: null, defaultView: { CustomEvent: FakeEvent }, _listeners: new Map() };
    doc.createElement = tag => new FakeElement(tag, doc);
    doc.documentElement = doc.createElement('html');
    doc.addEventListener = (t, fn) => (doc._listeners.get(t) ?? doc._listeners.set(t, []).get(t)).push(fn);
    doc.removeEventListener = () => {};
    doc.querySelectorAll = s => doc.documentElement.querySelectorAll(s);
    doc.querySelector = s => doc.documentElement.querySelector(s);
    doc.getElementById = () => null;
    return doc;
}

// element(doc, 'button.tab.active', { 'aria-selected': 'true' }, ...children)
export function el(doc, spec, attrs = {}, ...kids) {
    const c = parseCompound(spec);
    const e = doc.createElement((c.tag ?? 'div').toLowerCase());
    e.classList.add(...c.classes);
    for (const [n, v] of Object.entries(attrs)) e.setAttribute(n, v);
    e.append(...kids);
    return e;
}
