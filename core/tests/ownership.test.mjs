// The ownership contract (core/STANDARDS.md, "Ownership and reactivity", rule 5): a subscription that lives outside an element's own
// subtree (a document / window / matchMedia listener, a timer, an observer of another node) is one the garbage collector cannot free, so
// it must be removed in disconnected() (or destroy() for a module) and added in connected() exactly once.
//
//   1. a source guard: every such subscription in core/elements/*/*.js and core/modules/**/*.js has its removal on the teardown path,
//      or an entry in ALLOWED below that says why it is fine;
//   2. a fake-DOM check of the elements that hold them: connect, disconnect, connect again leaves exactly one live subscription, and
//      a disconnect leaves none.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SECTION = 'core/STANDARDS.md, "Ownership and reactivity"';

// ---------------------------------------------------------------------------------------------------------------------------------
// The guard
// ---------------------------------------------------------------------------------------------------------------------------------

const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');

// The text of `name(...) { ... }` (a method or a function) by brace matching; '' when there is none.
function bodyOf(text, name) {
    const re = new RegExp(`(?:^|[\\s.])(?:async\\s+)?${name.replace(/\$/g, '\\$')}\\s*\\([^)]*\\)\\s*\\{`, 'm');
    const m = re.exec(text);
    if (!m) return '';
    let depth = 0;
    for (let i = m.index + m[0].length - 1; i < text.length; i++) {
        if (text[i] === '{') depth++;
        else if (text[i] === '}' && --depth === 0) return text.slice(m.index, i + 1);
    }
    return text.slice(m.index);
}

// disconnected() plus everything it calls on this, up to three calls deep (disconnected() { this.stop(); } and stop() { ... }).
function teardownText(text, names) {
    const seen = new Set(); let out = ''; let frontier = names;
    for (let depth = 0; depth < 3 && frontier.length; depth++) {
        const next = [];
        for (const n of frontier) {
            if (seen.has(n)) continue; seen.add(n);
            const b = bodyOf(text, n); out += `\n${b}`;
            for (const m of b.matchAll(/this\.([\w$]+)\(/g)) next.push(m[1]);
        }
        frontier = next;
    }
    return out;
}

const OUTSIDE = new Set(['document', 'window', 'globalThis', 'doc', 'win', 'ownerDocument', '$mq', 'mq', 'media', '$t']);

// The kinds of subscription a source holds that the garbage collector cannot free, with what they need on the teardown path.
export function findings(file, source, kind) {
    const text = strip(source);
    const teardownNames = kind === 'element' ? ['disconnected'] : ['destroy', 'disconnectedCallback'];
    const teardown = teardownText(text, teardownNames);
    const hasTeardown = teardown.trim() !== '';
    const wholeFile = text;
    const found = []; // { category, detail, ok, need }

    for (const m of text.matchAll(/(.{0,70})\baddEventListener\(\s*(['"])([\w-]+)\2/g)) {
        const before = m[1];
        let outside;
        if (!/\.\s*$/.test(before)) outside = true; // a bare addEventListener(...) is the global one
        else { const t = /([\w$]+)\s*\)?\s*\.\s*$/.exec(before); outside = Boolean(t && OUTSIDE.has(t[1])); }
        if (!outside) continue;
        const scope = kind === 'element' ? teardown : wholeFile;
        found.push({ category: 'listener', detail: `addEventListener('${m[3]}') on an outside target`, ok: hasTeardown && new RegExp(`removeEventListener\\(\\s*['"]${m[3]}['"]`).test(scope), need: `a removeEventListener('${m[3]}') reachable from ${teardownNames[0]}()` });
    }
    if (/\b(autoUpdate|onOutside)\(/.test(text)) found.push({ category: 'positioning', detail: 'autoUpdate / onOutside (document and window listeners)', ok: hasTeardown && /\$[uo]\?\.\(\)/.test(teardown), need: `its cleanup function called from ${teardownNames[0]}()` });
    if (/\bsetInterval\(/.test(text)) found.push({ category: 'interval', detail: 'setInterval', ok: /\bclearInterval\(/.test(kind === 'element' ? teardown : wholeFile) && (kind === 'module' || hasTeardown), need: `clearInterval reachable from ${teardownNames[0]}()` });
    for (const m of text.matchAll(/new\s+(?:\w+\.)?(ResizeObserver|IntersectionObserver|MutationObserver|PerformanceObserver)\b/g)) {
        found.push({ category: 'observer', detail: `new ${m[1]}`, ok: /\.disconnect\(\)/.test(kind === 'element' ? teardown : wholeFile), need: `.disconnect() reachable from ${teardownNames[0]}()` });
    }
    if (/\bsetTimeout\(/.test(text)) found.push({ category: 'timeout', detail: 'setTimeout', ok: /\bclearTimeout\(/.test(wholeFile), need: 'a clearTimeout' });
    return found.map(f => ({ ...f, file }));
}

// Subscriptions verified fine although nothing on the teardown path removes them. Every entry says why; an entry that no longer matches
// anything fails the test, so this list cannot rot.
const ALLOWED = {
    'elements/chart/chart.js': { observer: 'a ResizeObserver on the element\'s own shadow part: it lives and dies with the element' },
    'elements/tabs/tabs.js': { observer: 'a ResizeObserver on the element\'s own shadow part: it lives and dies with the element' },
    'elements/select/select.js': { observer: 'a MutationObserver of the element\'s own children, made once per instance and kept for its life: it is freed with the element' },
    'elements/radio-group/radio-group.js': { observer: 'a MutationObserver of the element\'s own children, made once per instance and kept for its life: it is freed with the element' },
    'elements/combobox/combobox.js': { observer: 'a MutationObserver of the element\'s own children, made once per instance and kept for its life: it is freed with the element' },
    'elements/select-menu/select-menu.js': { observer: 'a MutationObserver of the element\'s own children, created once per instance: it is freed with the element' },
    'modules/scorecard/measure.js': { observer: 'a PerformanceObserver inside the measured frame\'s window; the frame is removed after each measurement' },
    'modules/scorecard/scorecard.js': { timeout: 'a bounded settle delay before a measured frame resolves' },
};

function sources() {
    const out = [];
    for (const d of fs.readdirSync(path.join(root, 'elements'))) {
        const p = path.join(root, 'elements', d, `${d}.js`);
        if (fs.existsSync(p)) out.push({ file: `elements/${d}/${d}.js`, kind: 'element', source: fs.readFileSync(p, 'utf8') });
    }
    const walk = dir => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) walk(p); else if (/\.(js|mjs)$/.test(e.name) && !/\.(test|element)\./.test(e.name)) out.push({ file: path.relative(root, p).replace(/\\/g, '/'), kind: 'module', source: fs.readFileSync(p, 'utf8') }); } };
    walk(path.join(root, 'modules'));
    return out;
}

test('every subscription the garbage collector cannot free is removed on the teardown path (or allow-listed with a reason)', () => {
    const problems = []; const used = new Set();
    for (const s of sources()) {
        for (const f of findings(s.file, s.source, s.kind)) {
            if (f.ok) continue;
            if (ALLOWED[s.file]?.[f.category]) { used.add(`${s.file}|${f.category}`); continue; }
            problems.push(`${s.file}: ${f.detail} has no ${f.need}`);
        }
    }
    assert.deepEqual(problems, [], `\n${problems.join('\n')}\n\nAn element removes every subscription outside its own subtree in disconnected() and adds it in connected() (a module does so in destroy()). See ${SECTION}, rule 5. If it is truly fine, add it to ALLOWED in core/tests/ownership.test.mjs with the reason.`);
    const stale = [];
    for (const [file, cats] of Object.entries(ALLOWED)) for (const c of Object.keys(cats)) if (!used.has(`${file}|${c}`)) stale.push(`${file} (${c})`);
    assert.deepEqual(stale, [], `these ALLOWED entries no longer match an unremoved subscription: remove them\n${stale.join('\n')}`);
});

test('the guard itself flags what it should and passes what it should', () => {
    const bad = `export default Base => class extends Base { connected() { document.addEventListener('keydown', this.$k); } }`;
    assert.equal(findings('x', bad, 'element').filter(f => !f.ok).length, 1);
    const good = `export default Base => class extends Base {
        connected() { document.addEventListener('keydown', this.$k); }
        disconnected() { this.stop(); }
        stop() { document.removeEventListener('keydown', this.$k); }
    }`;
    assert.equal(findings('x', good, 'element').filter(f => !f.ok).length, 0);
    const timers = `export default Base => class extends Base { updated() { this.$t = setInterval(() => 0, 5); const o = new ResizeObserver(() => 0); o.observe(document.body); } }`;
    assert.deepEqual(findings('x', timers, 'element').filter(f => !f.ok).map(f => f.category).sort(), ['interval', 'observer']);
    const mql = `export default Base => class extends Base { connected() { this.$mq = matchMedia('(x)'); this.$mq.addEventListener('change', this.$f); } }`;
    assert.equal(findings('x', mql, 'element').filter(f => !f.ok).length, 1);
    const own = `export default Base => class extends Base { connected() { this.part('a').addEventListener('click', () => 0); this.shadowRoot.addEventListener('input', () => 0); this.addEventListener('x', () => 0); } }`;
    assert.equal(findings('x', own, 'element').length, 0);
    const mod = `export function mountX() { const t = setInterval(f, 5); return { destroy() { clearInterval(t); } }; }`;
    assert.equal(findings('m', mod, 'module').filter(f => !f.ok).length, 0);
});

// ---------------------------------------------------------------------------------------------------------------------------------
// The lifecycle check, on a fake DOM
// ---------------------------------------------------------------------------------------------------------------------------------

const live = new Map(); // "target|type|capture" -> Set of listeners: what a real DOM would still call
const key = (name, type, o) => `${name}|${type}|${typeof o === 'boolean' ? o : Boolean(o?.capture)}`;
const targetFor = name => ({
    name,
    addEventListener(type, fn, o) { const k = key(name, type, o); (live.get(k) ?? live.set(k, new Set()).get(k)).add(fn); },
    removeEventListener(type, fn, o) { live.get(key(name, type, o))?.delete(fn); },
});
const liveCount = (prefix = '') => [...live].filter(([k]) => k.startsWith(prefix)).reduce((n, [, s]) => n + s.size, 0);

const timers = new Set();
const observers = new Set();
const mqls = new Map();
const noop = () => {};

const doc = { ...targetFor('document'), querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, scrollingElement: { scrollTop: 0, scrollHeight: 100, clientHeight: 50 }, activeElement: null, documentElement: { clientWidth: 1000, clientHeight: 800 }, createElement: () => new Proxy(noop, { get: (t, k) => (k === 'then' ? undefined : t), apply: () => undefined }) };
const win = targetFor('window');
const patch = {
    document: doc, window: win, innerWidth: 1000, innerHeight: 800,
    addEventListener: win.addEventListener, removeEventListener: win.removeEventListener,
    requestAnimationFrame: () => 1, cancelAnimationFrame: noop,
    customElements: { whenDefined: () => Promise.resolve(), get: () => undefined },
    matchMedia: q => mqls.get(q) ?? mqls.set(q, { matches: false, ...targetFor(`mq:${q}`) }).get(q),
    ResizeObserver: class { constructor(f) { this.f = f; } observe() { observers.add(this); } disconnect() { observers.delete(this); } },
    MutationObserver: class { constructor(f) { this.f = f; } observe() { observers.add(this); } disconnect() { observers.delete(this); } },
    setInterval: () => { const t = { id: timers.size + 1 }; timers.add(t); return t; }, clearInterval: t => timers.delete(t),
};
const saved = {};
for (const [k, v] of Object.entries(patch)) { saved[k] = Object.getOwnPropertyDescriptor(globalThis, k); Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true }); }
globalThis.HTMLElement ??= class {};
after(() => { for (const [k, d] of Object.entries(saved)) { if (d) Object.defineProperty(globalThis, k, d); else delete globalThis[k]; } });

// A part of the shadow tree: it records listeners and swallows everything else.
const parts = new Map();
const partFor = name => {
    if (!parts.has(name)) {
        const rec = targetFor(`part:${name}`);
        const p = new Proxy(function part() {}, {
            get: (t, k) => (k in rec ? rec[k] : k === 'then' || k === Symbol.toPrimitive ? undefined : k === 'matches' || k === 'open' || k === 'checked' ? false : p),
            set: () => true, apply: () => p,
        });
        parts.set(name, p);
    }
    return parts.get(name);
};

class Stub {
    constructor(props = {}) {
        Object.assign(this, props);
        this.style = { setProperty: noop, removeProperty: noop };
        this.$connected = false;
        this.shadowRoot = { addEventListener: noop, querySelector: () => partFor('root'), contains: () => false };
        this.children = [];
        this.log = { debug: noop, warn: noop };
    }
    get isConnected() { return this.$connected; }
    part(n) { return partFor(n); }
    slotted() { return []; }
    watchSlot() { }
    requestUpdate() { }
    update() { }
    emit() { return true; }
    aria() { }
    debug() { }
    warnOnce() { }
    setFormValue() { }
    setValidity() { }
    addEventListener() { }
    removeEventListener() { }
    querySelector() { return null; }
    querySelectorAll() { return []; }
    contains() { return false; }
    matches() { return false; }
    toggleAttribute() { }
    hasAttribute() { return false; }
    getAttribute() { return null; }
    setAttribute() { }
    removeAttribute() { }
    dispatchEvent() { return true; }
    closest() { return null; }
    focus() { }
}

async function make(name, props) {
    const mixin = (await import(`../elements/${name}/${name}.js`)).default;
    const el = new (mixin(Stub))(props);
    const call = (fn, ...a) => el[fn]?.(...a);
    return {
        el,
        connect() { el.$connected = true; call('connected'); },
        disconnect() { el.$connected = false; call('disconnected'); },
    };
}

const reset = () => { live.clear(); timers.clear(); observers.clear(); mqls.clear(); parts.clear(); };

// element, the props to give it, and how many outside subscriptions it must hold while connected (0 = it holds them only when open, etc.)
const OUTSIDE_CASES = [
    ['back-to-top', {}, 1],
    ['scroll-progress', {}, 2],
    ['toc', {}, 2],
    ['breadcrumb', {}, 1],
    ['side-nav', {}, 1],
    ['workspace', {}, 1],
    ['command-palette', {}, 1],
    ['gallery', {}, 1],
    ['split-button', { open: true }, 1],
];
for (const [name, props, expected] of OUTSIDE_CASES) {
    test(`<pk-${name}>: connect, disconnect, connect holds exactly ${expected} outside subscription${expected === 1 ? '' : 's'}, and a disconnect holds none`, async () => {
        reset();
        const { connect, disconnect } = await make(name, props);
        const outside = () => liveCount('document|') + liveCount('window|') + liveCount('mq:');
        connect();
        assert.equal(outside(), expected, `after the first connect`);
        disconnect();
        assert.equal(outside(), 0, `after disconnect: ${[...live].filter(([, s]) => s.size).map(([k]) => k).join(', ')}`);
        connect();
        assert.equal(outside(), expected, 'after reconnecting: a listener was added twice or not at all');
        disconnect();
        assert.equal(outside(), 0, 'after the last disconnect');
    });
}

test('<pk-tooltip>: a shown tooltip drops its scroll listener when it is disconnected', async () => {
    reset();
    const { el, connect, disconnect } = await make('tooltip', { text: 'hi', placement: 'top', delay: 0 });
    Object.defineProperty(el, 'slotted', { value: () => [], configurable: true });
    connect();
    el.shown = true; window.addEventListener('scroll', el.$hide, true); // what show() does after placing the tip
    assert.equal(liveCount('window|scroll'), 1);
    disconnect();
    assert.equal(liveCount('window|scroll'), 0);
});

test('<pk-local-time>: a detached element does not start its refresh timer, an attached one does, and disconnecting stops it', async () => {
    reset();
    const { el, connect, disconnect } = await make('local-time', { format: 'relative', datetime: new Date().toISOString(), length: 'medium', locale: 'en', timeZone: '' });
    el.part = n => (n === 'text' ? { set textContent(v) { this.t = v; } } : partFor(n));
    el.shadowRoot.querySelector = () => ({});
    el.updated();
    assert.equal(timers.size, 0, 'updated() on a detached element started a timer');
    connect(); el.updated();
    assert.equal(timers.size, 1);
    disconnect();
    assert.equal(timers.size, 0);
});

test('select, radio-group and combobox wire their own listeners once, however many times they are reconnected', async () => {
    for (const name of ['select', 'radio-group', 'combobox']) {
        reset();
        const { connect, disconnect } = await make(name, { value: '' });
        connect();
        const own = () => liveCount('part:');
        const first = own();
        assert.ok(first > 0, `${name}: expected listeners on its parts`);
        disconnect(); connect(); disconnect(); connect();
        assert.equal(own(), first, `${name}: reconnecting added listeners on its own parts again (each change would fire twice)`);
        assert.equal(observers.size, 1, `${name}: exactly one MutationObserver of its own children, however often it is moved`);
        disconnect();
    }
});

// ---------------------------------------------------------------------------------------------------------------------------------
// Two-way props name their commit event (rule 4)
// ---------------------------------------------------------------------------------------------------------------------------------

// A prop with one of these names holds state the user can change. Its meta names the event that announces the change (`commit`, one event or
// a list), and that event must be one the element declares. A prop that is not changed by the user itself is listed in NOT_TWO_WAY with why.
const TWO_WAY = new Set(['value', 'open', 'checked', 'selected', 'current', 'expanded', 'page', 'collapsed', 'index', 'pressed', 'wrap']);
const NOT_TWO_WAY = {
    'button.value': 'the value the button submits and reports, not state',
    'checkbox.value': 'the value the checkbox submits when checked; checked is the state',
    'switch.value': 'the value the switch submits when on; checked is the state',
    'tag.value': 'the identifier pk-remove reports, not state',
    'menu-item.value': 'the item\'s identifier, reported by pk-select',
    'nav-item.current': 'the route marker the host sets; the element never changes it',
    'progress.value': 'output only: nothing the user can change',
    'sortable-item.value': 'the row\'s identifier, reported in pk-sortable\'s pk-reorder event; the user moves the row, not this',
    'step.index': 'the step\'s position, set by its stepper',
    'stat.value': 'output only: a figure the host supplies',
    'stat.values': 'output only: the series the host supplies',
    'tab.value': 'the tab\'s identifier, paired with a pk-tab-panel; the tab strip raises pk-tab-change',
    'tab.selected': 'pushed down by pk-tabs, which raises pk-tab-change (selfAssigned coupling)',
    'tab-panel.value': 'the panel\'s identifier, paired with a pk-tab',
    'tab-panel.selected': 'pushed down by pk-tabs, which raises pk-tab-change (selfAssigned coupling)',
    'tree-item.value': 'the item\'s identifier, reported by pk-select',
};

const readMeta = () => {
    const out = {};
    for (const d of fs.readdirSync(path.join(root, 'elements'))) {
        const p = path.join(root, 'elements', d, `${d}.meta.json`);
        if (fs.existsSync(p)) out[d] = JSON.parse(fs.readFileSync(p, 'utf8'));
    }
    return out;
};

test('every two-way prop names the event that announces a user change, or is on the documented exception list', () => {
    const problems = []; const metas = readMeta();
    for (const [el, meta] of Object.entries(metas)) {
        for (const p of meta.props) {
            if (!TWO_WAY.has(p.name)) continue;
            const key = `${el}.${p.name}`;
            if (p.commit !== undefined) {
                const named = [].concat(p.commit);
                const bad = named.filter(n => !meta.events.some(e => e.name === n));
                if (!named.length || bad.length) problems.push(`${key}: commit ${JSON.stringify(p.commit)} names an event the element does not declare`);
                if (NOT_TWO_WAY[key]) problems.push(`${key}: has a commit event and is also on the exception list: remove it from NOT_TWO_WAY`);
            } else if (!NOT_TWO_WAY[key]) problems.push(`${key}: no commit event named in the meta`);
        }
    }
    const stale = Object.keys(NOT_TWO_WAY).filter(k => { const [el, prop] = k.split('.'); return !metas[el]?.props.some(p => p.name === prop); });
    assert.deepEqual(problems, [], `\n${problems.join('\n')}\n\nA two-way prop has "commit": "<event>" in its meta (a list when it takes two, pk-open and pk-close); ${SECTION}, rule 4. A prop the user never changes goes on NOT_TWO_WAY in core/tests/ownership.test.mjs with the reason.`);
    assert.deepEqual(stale, [], `these NOT_TWO_WAY entries name no such prop: remove them\n${stale.join('\n')}`);
});

test('the elements that change a two-way prop themselves raise its commit event (the cases the ownership audit found)', () => {
    const src = n => fs.readFileSync(path.join(root, 'elements', n, `${n}.js`), 'utf8');
    assert.match(src('tabs'), /this\.value = [^;]*;[^}]*emit\('pk-tab-change'/, 'pk-tabs: the fallback to the first tab raises pk-tab-change');
    assert.match(src('side-nav'), /this\.collapsed = s\.collapsed;[^}]*emit\('pk-nav-toggle'/, 'pk-side-nav: a restored collapsed state raises pk-nav-toggle');
    assert.match(src('combobox'), /setOpen\(open\) \{[^}]*emit\('pk-combo-toggle'/, 'pk-combobox: opening and closing raise pk-combo-toggle');
    assert.doesNotMatch(strip(src('combobox')), /this\.open = (true|false)/, 'pk-combobox: open changes through setOpen() only');
    assert.match(src('command-palette'), /hide\('shortcut'\)/, 'pk-command-palette: the shortcut closes through hide(), which raises pk-close');
    assert.match(src('command-palette'), /emit\('pk-close', \{ reason: 'select' \}/, 'pk-command-palette: choosing a command raises pk-close');
    assert.match(src('code-block'), /this\.wrap = !this\.wrap; this\.emit\('pk-wrap-change'/, 'pk-code-block: the wrap toggle raises pk-wrap-change');
});

// ---------------------------------------------------------------------------------------------------------------------------------
// Rule 3: writes to nodes an element does not own are declared in the meta (`writes`)
// ---------------------------------------------------------------------------------------------------------------------------------
// A conservative static check, not a proof: it finds `x.setAttribute('name'`, `.removeAttribute`, `.toggleAttribute`, `.dataset.x =`, `.aria(` and an
// assignment of one of the props below (`x.hidden = `, `x.tabIndex = `, ...) whose receiver is not the element itself, its shadow tree or a node the
// file creates. The attribute or prop must then be named in an `attributes` list of the element's `writes`. Receivers it cannot classify (a shadow node
// reached through a helper) go in ALLOWED_WRITES with the reason.

const WRITE_PROPS = 'hidden|tabIndex|id|role|slot|selected|expanded|open|checked|indeterminate|rail|flyout|error|invalid|valid|warning|required|description|label|state|index|last|clickable|orientation|disabled';
const OWN_RHS = /^(?:this\.part\(|this\.shadowRoot|(?:this\.)?(?:ownerDocument|document|doc)\.createElement|make\(|el\(|h\(|button\(|[\w.$]*cloneNode|tpl\b)/;

export function writesOf(source) {
    const text = strip(source);
    const own = new Set();
    const decl = [...text.matchAll(/\b(?:const|let|var)\s+([\w$]+)\s*=\s*([^;\n]*)/g), ...text.matchAll(/,\s*([\w$]+)\s*=\s*([^;\n]*)/g)];
    for (let pass = 0; pass < 2; pass++) for (const m of decl) { const rhs = m[2].trim(); if (OWN_RHS.test(rhs) || [...own].some(o => rhs.startsWith(`${o}.`))) own.add(m[1]); }
    const chain = String.raw`([\w$]+(?:\??\.[\w$]+|\([^()]*\)|\[\d+\])*)`;
    const found = [];
    const add = (receiver, attr) => {
        const root = /^[\w$]+/.exec(receiver)[0], rest = receiver.slice(root.length);
        const mine = /^(?:\.dataset|\.style)?$/.test(rest) && (root === 'this' || own.has(root)) || (root === 'this' && /^\.(?:part\(|shadowRoot)/.test(rest));
        if (!mine) found.push({ receiver, attr: attr.toLowerCase() });
    };
    const quote = '[\'"`]';
    for (const m of text.matchAll(new RegExp(`${chain}\\??\\.(?:setAttribute|removeAttribute|toggleAttribute)\\(\\s*(${quote})([^'"\`]*)\\2`, 'g'))) add(m[1], m[3]);
    for (const m of text.matchAll(new RegExp(`${chain}\\??\\.(${WRITE_PROPS})\\s*(?:\\|\\|)?=(?!=)`, 'g'))) if (!m[1].endsWith('.dataset')) add(m[1], m[2]);
    for (const m of text.matchAll(new RegExp(`${chain}\\.dataset\\.([\\w$]+)\\s*=(?!=)`, 'g'))) add(m[1], `data-${m[2]}`);
    for (const m of text.matchAll(new RegExp(`${chain}\\??\\.aria\\(`, 'g'))) add(m[1], 'aria()');
    return found;
}

// Receivers the check cannot classify, per source: { receiver: why it is not a node the host owns }.
const OWN_SHADOW = 'a node in the element\'s own shadow tree (or one it builds for it)';
const ALLOWED_WRITES = {
    'elements/app-bar-search/app-bar-search.js': { e: 'a node the el() helper creates' },
    'elements/chart/chart.js': { li: 'a legend item the chart builds itself, inside its shadow tree' },
    'elements/combobox/combobox.js': { 'this.ctl()': OWN_SHADOW + ': ctl() returns the shadow trigger or control', o: 'an option of the popup the element renders in its shadow tree', c: OWN_SHADOW + ' (the control or the trigger)' },
    'elements/command-palette/command-palette.js': { e: 'a node the el() helper creates', r: 'a row of the list the element renders in its shadow tree' },
    'elements/dialog/dialog.js': { input: 'the field of the prompt dialog the helper creates itself', error: 'the error line of the prompt dialog the helper creates itself' },
    'elements/dropzone/dropzone.js': { b: 'the remove button of a row the element renders in its shadow tree' },
    'elements/image-gallery/image-gallery.js': { make: 'a button inside a tile the element renders in its shadow tree', remove: 'a button inside a tile the element renders in its shadow tree' },
    'elements/nav-item/nav-item.js': { row: 'the row (the anchor) in the element\'s own shadow tree' },
    'elements/pagination/pagination.js': { more: OWN_SHADOW },
    'elements/select/select.js': { o: 'an option of the native select in the element\'s shadow tree' },
    'elements/select-menu/select-menu.js': { o: 'an option of the list the element renders in its shadow tree' },
    'elements/tag-input/tag-input.js': { "p.querySelector('.px')": 'the remove button of a chip the element renders in its shadow tree' },
    'elements/toast-stack/toast-stack.js': { stack: 'a pk-toast-stack the show() helper creates for the caller (rule 3: an element it makes and fills for the caller)' },
    'elements/toc/toc.js': { 'x.a': 'the link of an entry the element renders in its shadow tree' },
};

const declaredWrites = meta => new Set((meta.writes ?? []).flatMap(w => w.attributes).map(a => a.trim().split(/\s+/)[0].toLowerCase()));

test('every write to a node the element does not own is declared in its meta writes (or allow-listed with a reason)', () => {
    const problems = []; const used = new Set(); const metas = readMeta();
    for (const s of sources().filter(x => x.kind === 'element')) {
        const el = s.file.split('/')[1]; const declared = declaredWrites(metas[el] ?? {});
        for (const w of writesOf(s.source)) {
            if (ALLOWED_WRITES[s.file]?.[w.receiver]) { used.add(`${s.file}|${w.receiver}`); continue; }
            if (!declared.has(w.attr)) problems.push(`${s.file}: writes ${w.attr} on ${w.receiver} but ${el}.meta.json writes does not list it`);
        }
    }
    assert.deepEqual([...new Set(problems)], [], `\n${[...new Set(problems)].join('\n')}\n\nAn element that writes an attribute or prop on a node it does not own (a light-DOM child, a trigger, a heading elsewhere) declares it in "writes": [{ target, attributes, why }] in its meta; ${SECTION}, rule 3. A receiver that is really the element's own shadow node goes in ALLOWED_WRITES with the reason.`);
    const stale = [];
    for (const [file, rs] of Object.entries(ALLOWED_WRITES)) for (const r of Object.keys(rs)) if (!used.has(`${file}|${r}`)) stale.push(`${file} (${r})`);
    assert.deepEqual(stale, [], `these ALLOWED_WRITES entries no longer match a write: remove them\n${stale.join('\n')}`);
});

test('every declared writes entry is well formed and names an attribute the source really writes', () => {
    const problems = []; const metas = readMeta();
    for (const s of sources().filter(x => x.kind === 'element')) {
        const el = s.file.split('/')[1]; const meta = metas[el];
        if (!meta?.writes) continue;
        const seen = new Set(writesOf(s.source).map(w => w.attr));
        for (const w of meta.writes) for (const a of w.attributes) if (!seen.has(a.trim().split(/\s+/)[0].toLowerCase()) && !ALLOWED_DECLARED[`${el}.${a}`]) problems.push(`${el}: writes lists "${a}" (${w.target}) but the source does not write it`);
    }
    assert.deepEqual(problems, [], `\n${problems.join('\n')}\n\nA writes entry lists what the source really writes; remove the name, or (a write the check cannot see, such as a computed name) add it to ALLOWED_DECLARED with the reason.`);
});

// Declared writes the static check cannot see.
const ALLOWED_DECLARED = {
    'toast-stack.hidden': 'the receiver t is also a local of another function in the file, so the check treats every t as a node it made',
    'field.warning': 'set through flag(c, name, on) with a computed property name',
    'field.invalid': 'set through flag(c, name, on) with a computed property name',
};

test('the writes guard itself flags what it should and passes what it should', () => {
    const bad = `export default Base => class extends Base { updated() { for (const c of this.slotted()) { c.setAttribute('role', 'x'); c.hidden = true; } this.slotted()[0].aria({ role: 'y' }); } }`;
    assert.deepEqual(writesOf(bad).map(w => w.attr).sort(), ['aria()', 'hidden', 'role']);
    const fine = `export default Base => class extends Base { updated() { this.setAttribute('a', ''); this.part('x').hidden = true; const r = this.shadowRoot; r.setAttribute('b', ''); const e = document.createElement('i'); e.setAttribute('c', ''); e.dataset.d = ''; this.dataset.z = ''; } }`;
    assert.deepEqual(writesOf(fine), []);
    assert.deepEqual(writesOf(`x.t.setAttribute('aria-current', 'page'); delete y.dataset.k; if (a.hidden === b) {}`).map(w => w.attr), ['aria-current']);
});
