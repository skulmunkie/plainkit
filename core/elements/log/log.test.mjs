// pk-log: the pure rules, the append / trim / follow behaviour on a stub base, and the meta, css and source held to the standards.
// Real scrolling, the resume button and the 44px target are checked in the browser suite (tests/browser/cases-data-display.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import behaviour, { atBottom, keepLast, formatTime, normalizeRow } from './log.js';

const read = ext => fs.readFileSync(fileURLToPath(new URL(`./log.${ext}`, import.meta.url)), 'utf8');
const meta = JSON.parse(read('meta.json')); const css = read('css'); const src = read('js');
const prop = name => meta.props.find(p => p.name === name);

test('atBottom allows a few pixels of slack', () => {
    assert.equal(atBottom(900, 100, 1000), true);
    assert.equal(atBottom(897, 100, 1000), true);
    assert.equal(atBottom(800, 100, 1000), false);
    assert.equal(atBottom(0, 100, 100), true, 'a log that fits is at the bottom');
});

test('keepLast keeps the newest rows, and max 0 keeps all', () => {
    assert.deepEqual(keepLast([1, 2, 3, 4], 2), [3, 4]);
    assert.deepEqual(keepLast([1, 2], 5), [1, 2]);
    assert.deepEqual(keepLast([1, 2, 3], 0), [1, 2, 3]);
});

test('formatTime shows text as it is, formats a Date or a number, and drops junk', () => {
    assert.equal(formatTime('12:00:01'), '12:00:01');
    assert.match(formatTime(0), /\d/);
    assert.match(formatTime(new Date(2026, 8, 21, 10, 5, 7)), /10.05.07/);
    assert.equal(formatTime(NaN), '');
    assert.equal(formatTime(undefined), '');
});

test('normalizeRow accepts a string or an object and drops an unknown level', () => {
    assert.deepEqual(normalizeRow('hello'), { text: 'hello', level: '', time: '' });
    assert.deepEqual(normalizeRow(null), { text: '', level: '', time: '' });
    assert.deepEqual(normalizeRow({ text: 'x', level: 'error', time: 't' }), { text: 'x', level: 'error', time: 't' });
    assert.equal(normalizeRow({ text: 'x', level: 'loud' }).level, '');
    assert.equal(normalizeRow({ text: 42 }).text, '42');
});

// A stand-in for PkElement (as splitter.test.mjs uses) with a tiny node model: enough for the list, the empty text and the scroller.
const node = () => { const n = { children: [], attrs: {}, classes: [], hidden: false, append(...n) { this.children.push(...n.flatMap(x => (x.frag ? x.children : [x]))); }, replaceChildren() { this.children = []; }, get childElementCount() { return this.children.length; }, get firstElementChild() { return { remove: () => this.children.shift() }; }, setAttribute(k, v) { this.attrs[k] = v; } }; n.classList = { add: c => n.classes.push(c) }; return n; };
const make = (props = {}) => {
    const parts = { list: node(), empty: node(), scroller: Object.assign(node(), { scrollTop: 0, scrollHeight: 500, clientHeight: 100, listeners: {}, addEventListener(t, f) { this.listeners[t] = f; } }), resume: Object.assign(node(), { listeners: {}, addEventListener(t, f) { this.listeners[t] = f; } }) };
    const proto = { cloneNode() { const n = () => Object.assign(node(), { remove() { d.children = d.children.filter(c => c !== this); } }); const d = node(); d.children = [n(), n(), n()]; d.cloneNode = undefined; return d; } };
    const doc = { createDocumentFragment: () => Object.assign(node(), { frag: true }) };
    const el = new (behaviour(class { emit(name, detail, init = {}) { this.events.push({ name, detail, cancelable: init.cancelable !== false }); return true; } }))();
    Object.assign(el, { events: [], ownerDocument: doc, shadowRoot: { querySelector: () => ({ content: { firstElementChild: proto } }) }, max: 1000, paused: false, part: n => parts[n] }, props);
    el.connected();
    return { el, parts };
};
const tick = () => new Promise(r => queueMicrotask(r));

test('a burst of appends is drawn once, in order, and the view goes to the bottom', async () => {
    const { el, parts } = make();
    el.append('a'); el.append('b', { text: 'c', level: 'warn' });
    assert.equal(parts.list.children.length, 0, 'nothing is drawn until the microtask');
    await tick();
    assert.equal(parts.list.children.length, 3);
    assert.equal(parts.list.children[2].classes.join(), 'warn');
    assert.equal(parts.empty.hidden, true);
    assert.equal(parts.scroller.scrollTop, 500);
    assert.equal(el.events.length, 0, 'a host append raises no event');
});

test('rows past max are dropped from the top, and a batch bigger than max keeps only its newest rows', async () => {
    const { el, parts } = make({ max: 3 });
    el.append(1, 2, 3, 4, 5); await tick();
    assert.equal(parts.list.children.length, 3);
    assert.equal(parts.list.children[0].children.at(-1).textContent, '3');
    el.append(6); await tick();
    assert.equal(parts.list.children.length, 3);
    assert.equal(parts.list.children[2].children.at(-1).textContent, '6');
});

test('while paused new rows are added but the view stays where it is', async () => {
    const { el, parts } = make({ paused: true });
    parts.scroller.scrollTop = 40;
    el.append('a'); await tick();
    assert.equal(parts.list.children.length, 1);
    assert.equal(parts.scroller.scrollTop, 40);
});

test('scrolling up pauses and raises pk-pause once; scrolling back to the bottom resumes; a host change raises nothing', () => {
    const { el, parts } = make();
    const s = parts.scroller;
    s.scrollTop = 100; s.listeners.scroll(); s.listeners.scroll();
    assert.equal(el.paused, true);
    assert.deepEqual(el.events, [{ name: 'pk-pause', detail: { paused: true }, cancelable: false }]);
    s.scrollTop = 400; s.listeners.scroll();
    assert.equal(el.paused, false);
    assert.deepEqual(el.events.at(-1), { name: 'pk-pause', detail: { paused: false }, cancelable: false });
    const n = el.events.length; el.paused = true; assert.equal(el.events.length, n);
});

test('the resume button clears paused and says so; clear() empties the list and shows the empty text', async () => {
    const { el, parts } = make({ paused: true });
    parts.resume.listeners.click();
    assert.equal(el.paused, false);
    assert.deepEqual(el.events, [{ name: 'pk-pause', detail: { paused: false }, cancelable: false }]);
    el.append('a'); await tick(); el.clear();
    assert.equal(parts.list.children.length, 0); assert.equal(parts.empty.hidden, false);
    el.append('b'); el.clear(); await tick();
    assert.equal(parts.list.children.length, 0, 'clear() also drops rows still waiting to be drawn');
});

test('the meta names its commit event, documents the methods and the roles', () => {
    assert.equal(prop('paused').commit, 'pk-pause');
    assert.ok(meta.events.some(e => e.name === 'pk-pause' && e.detailProps.paused === 'boolean'));
    assert.deepEqual(meta.methods.map(m => m.name), ['append(...rows)', 'clear()']);
    assert.equal(prop('max').default, 1000);
    assert.match(meta.a11y, /role=log/);
    assert.ok(read('html').includes('role="log"'));
});

test('the css uses tokens only, logical properties and the 44px token for the resume button', () => {
    assert.ok(!/#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(/i.test(css), 'literal colour');
    assert.ok(!/\b(margin|padding|border)-(left|right|top|bottom)\b|(?<![-\w])(width|height)\s*:/.test(css), 'physical properties');
    assert.ok(css.includes('var(--touch-target)') && css.includes('monospace'));
    const tokens = fs.readFileSync(fileURLToPath(new URL('../../tokens/tokens.css', import.meta.url)), 'utf8');
    for (const [, tok] of css.matchAll(/var\((--(?:space|color|touch|cv|field|radius|shadow|text)[\w-]*)[,)]/g)) assert.ok(tokens.includes(`${tok}:`), `${tok} exists`);
});

test('the source keeps every listener on its own shadow parts and never touches the light DOM', () => {
    assert.ok(!/\b(document|window|ownerDocument)\s*\.\s*addEventListener|setInterval|setTimeout|Observer\(|innerHTML/.test(src));
    assert.ok(!/\bthis\.children\b|\bslotted\(/.test(src));
});
