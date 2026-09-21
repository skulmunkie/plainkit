// The sections a host adds to the gallery's inspector: the descriptor's cleaning, the message contract in both directions, and the inspector drawing
// a descriptor as text in SDK components (on a fake DOM). js/gallery-sections.js, js/element-inspector.js (sectionFromData).
import test from 'node:test';
import assert from 'node:assert/strict';
import { READY_MESSAGE, SECTIONS_MESSAGE, LIMITS, normalizeSections, sectionsFor, acceptedSections, sectionsMessage } from '../js/gallery-sections.js';

test('a section keeps its title, tag (with the pk- prefix), open flag, lines, table and code, all as text', () => {
    const [s] = normalizeSections([{ tag: 'Button', title: 'Blazor', open: true, lines: ['Component PkButton', '', 42], columns: ['Parameter', 'Type'], rows: [['Variant', 'ButtonVariant'], [1, null]], code: '<PkButton />' }]);
    assert.deepEqual(s, { title: 'Blazor', tag: 'pk-button', open: true, lines: ['Component PkButton', '42'], rows: [['Variant', 'ButtonVariant'], ['1', '']], columns: ['Parameter', 'Type'], code: '<PkButton />' });
});

test('a table without columns gets Name and Value; empty parts are left out', () => {
    const [s] = normalizeSections([{ title: 'T', rows: [['a', 'b']], lines: [], code: '' }]);
    assert.deepEqual(s.columns, ['Name', 'Value']);
    assert.ok(!('lines' in s) && !('code' in s) && !('tag' in s) && !('open' in s));
});

test('anything that is not a section with a title is dropped, and garbage never throws', () => {
    for (const bad of [null, undefined, 'x', 7, {}, { title: '' }, { title: '   ' }, { tag: 'pk-a' }]) assert.deepEqual(normalizeSections([bad]), [], String(bad));
    for (const notAList of [null, undefined, 'x', {}, 5]) assert.deepEqual(normalizeSections(notAList), []);
    assert.deepEqual(normalizeSections([{ title: 'ok', rows: 'x', lines: 'y', columns: { a: 1 } }]), [{ title: 'ok' }]);
});

test('markup is kept as inert text and every value is cut to its limit', () => {
    const [s] = normalizeSections([{ title: '<img src=x onerror=alert(1)>'.padEnd(200, 'x'), lines: ['<b>hi</b>'.padEnd(900, 'x')], code: 'c'.repeat(9000), rows: Array.from({ length: 200 }, () => Array(20).fill('v'.repeat(999))) }]);
    assert.equal(s.title.length, LIMITS.title);
    assert.ok(s.title.startsWith('<img'), 'text, not parsed or stripped: the inspector only ever sets textContent');
    assert.equal(s.lines[0].length, LIMITS.text);
    assert.equal(s.code.length, LIMITS.code);
    assert.equal(s.rows.length, LIMITS.rows);
    assert.equal(s.rows[0].length, LIMITS.columns);
    assert.equal(s.rows[0][0].length, LIMITS.text);
    assert.equal(normalizeSections(Array.from({ length: 500 }, (_, i) => ({ title: `s${i}` }))).length, LIMITS.sections);
});

test('sectionsFor picks the sections naming the tag and those naming none', () => {
    const all = normalizeSections([{ title: 'a', tag: 'pk-button' }, { title: 'b', tag: 'pk-input' }, { title: 'c' }]);
    assert.deepEqual(sectionsFor(all, 'pk-button').map(s => s.title), ['a', 'c']);
    assert.deepEqual(sectionsFor(all, 'input').map(s => s.title), ['b', 'c']);
    assert.deepEqual(sectionsFor([], 'pk-button'), []);
});

test('the frame believes only the embedding window (and its origin, when known), and only the sections message', () => {
    const parent = {}; const origin = 'https://app.example';
    const ok = { source: parent, origin, data: { type: SECTIONS_MESSAGE, sections: [{ title: 'A' }] } };
    assert.deepEqual(acceptedSections(ok, parent, origin), [{ title: 'A' }]);
    assert.deepEqual(acceptedSections(ok, parent, '*'), [{ title: 'A' }], 'origin unknown: the window still has to be the parent');
    assert.deepEqual(acceptedSections({ ...ok, data: { type: SECTIONS_MESSAGE, sections: [] } }, parent, origin), [], 'an empty list clears');
    assert.equal(acceptedSections({ ...ok, source: {} }, parent, origin), null, 'another window');
    assert.equal(acceptedSections({ ...ok, origin: 'https://evil.example' }, parent, origin), null, 'another origin');
    assert.equal(acceptedSections({ ...ok, data: { type: READY_MESSAGE, sections: [] } }, parent, origin), null, 'another message type');
    for (const sections of [undefined, null, 'x', {}]) assert.equal(acceptedSections({ ...ok, data: { type: SECTIONS_MESSAGE, sections } }, parent, origin), null, String(sections));
    assert.equal(acceptedSections({ ...ok, data: null }, parent, origin), null);
    assert.equal(acceptedSections(null, parent, origin), null);
});

test('the element sends the attribute text as a sections message: JSON list only', () => {
    assert.deepEqual(sectionsMessage('[{"title":"A"}]'), { type: SECTIONS_MESSAGE, sections: [{ title: 'A' }] });
    assert.deepEqual(sectionsMessage(''), { type: SECTIONS_MESSAGE, sections: [] });
    assert.deepEqual(sectionsMessage(undefined), { type: SECTIONS_MESSAGE, sections: [] });
    assert.equal(sectionsMessage('{"title":"A"}'), null, 'JSON that is not a list');
    assert.throws(() => sectionsMessage('[{'), SyntaxError);
});

// ---- the inspector draws a descriptor
function fakeDom() {
    class El {
        constructor(tag) { this.localName = tag; this.attrs = new Map(); this.children = []; this.text = ''; }
        setAttribute(k, v) { this.attrs.set(k, String(v)); }
        getAttribute(k) { return this.attrs.get(k) ?? null; }
        append(...kids) { for (const k of kids) this.children.push(typeof k === 'string' ? Object.assign(new El('#text'), { text: k }) : k); }
        replaceChildren(...kids) { this.children = []; this.append(...kids); }
        get textContent() { return this.text || this.children.map(c => c.textContent).join(''); }
        set textContent(v) { this.text = v; this.children = []; }
        find(tag) { return [...(this.localName === tag ? [this] : []), ...this.children.flatMap(c => (c.find ? c.find(tag) : []))]; }
    }
    globalThis.document = { createElement: t => new El(t) };
    return El;
}

test('the inspector draws a descriptor with p, pk-table and pk-code-block, and its markup stays text', async () => {
    const El = fakeDom();
    const { createElementInspector, sectionFromData } = await import('../js/element-inspector.js');
    const meta = { tag: 'pk-button', title: 'Button', group: 'Actions', summary: 's', props: [], slots: [], events: [], parts: [], cssProperties: [], methods: [] };
    const [data] = normalizeSections([{ tag: 'pk-button', title: 'Blazor', open: true, lines: ['<script>bad()</script>'], columns: ['A', 'B'], rows: [['1', '<b>2</b>']], code: '<PkButton />' }]);
    const box = new El('div');
    createElementInspector(box).show({ meta, extraSections: [sectionFromData(data)] });
    const item = box.find('pk-accordion-item').at(-1);
    assert.equal(item.getAttribute('heading'), 'Blazor');
    assert.equal(item.getAttribute('open'), '', 'open: true opens it');
    assert.equal(item.find('p')[0].textContent, '<script>bad()</script>');
    assert.deepEqual(item.find('th').map(t => t.textContent), ['A', 'B']);
    assert.deepEqual(item.find('td').map(t => t.textContent), ['1', '<b>2</b>']);
    assert.equal(item.find('pk-code-block')[0].textContent, '<PkButton />');
    assert.deepEqual(item.find('script'), [], 'no element is ever made from the text');
    assert.deepEqual(item.find('b'), []);
});
