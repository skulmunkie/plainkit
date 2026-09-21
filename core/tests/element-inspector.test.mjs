// The element inspector's pure logic (js/element-inspector-logic.js) and the DOM part (js/element-inspector.js) on a fake DOM.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { kebab, cleanMarkup, isElementMeta, describeElement } from '../js/element-inspector-logic.js';
import { addLogSink, setLogLevel } from '../js/log.js';

const api = JSON.parse(fs.readFileSync(new URL('../dist/elements/api.json', import.meta.url), 'utf8'));

test('kebab turns a prop name into its attribute', () => {
    assert.equal(kebab('maxLength'), 'max-length');
    assert.equal(kebab('kind'), 'kind');
});

test('cleanMarkup drops the data-* attributes the SDK adds and an empty hidden', () => {
    assert.equal(cleanMarkup('<pk-alert data-pk-ready="" kind="info" hidden="">x</pk-alert>'), '<pk-alert kind="info">x</pk-alert>');
    assert.equal(cleanMarkup(null), '');
});

test('describeElement lists every API section of a real element as display rows', () => {
    const meta = api.find(m => m.tag === 'pk-alert');
    assert.ok(isElementMeta(meta));
    const d = describeElement(meta);
    assert.equal(d.tag, 'pk-alert');
    assert.equal(d.props.length, meta.props.length);
    assert.match(d.props.find(p => p.name === 'kind').type, / \| /, 'an enum shows its values');
    assert.deepEqual(d.events.map(e => e.name), meta.events.map(e => e.name));
    assert.equal(d.parts.every(p => p.selector.startsWith('pk-alert::part(')), true);
    assert.equal(d.slots.every(s => s.name), true, 'the default slot is named');
});

test('describeElement is null for anything that is not element meta', () => {
    for (const bad of [null, undefined, {}, { tag: '' }, 'pk-alert']) assert.equal(describeElement(bad), null);
});

// ---- the DOM part, on a minimal fake document
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

const liveAlert = El => Object.assign(new El('pk-alert'), { outerHTML: '<pk-alert kind="info" data-pk-ready="">Hi</pk-alert>' });

test('the inspector shows an empty state with nothing selected, then the element and its live markup, then follows a change', async () => {
    const El = fakeDom();
    const { createElementInspector } = await import('../js/element-inspector.js');
    const box = new El('div');
    const inspector = createElementInspector(box);
    assert.equal(box.find('pk-empty-state').length, 1);
    assert.match(box.find('pk-empty-state')[0].getAttribute('description'), /properties, slots, events/);

    const meta = api.find(m => m.tag === 'pk-alert');
    const live = liveAlert(El);
    inspector.show({ meta, element: live });
    assert.equal(box.find('pk-empty-state').length, 0);
    assert.equal(inspector.tag, 'pk-alert');
    const [markup] = box.find('pk-code-block');
    assert.equal(box.find('pk-code-block').length, 1);
    assert.equal(markup.textContent, '<pk-alert kind="info">Hi</pk-alert>');
    assert.ok(box.find('pk-table').length >= 3, 'the API tables are pk-table');
    assert.doesNotMatch(box.textContent, /Blazor/, 'the SDK inspector knows nothing about Blazor');

    live.outerHTML = '<pk-alert kind="danger">Hi</pk-alert>';
    inspector.refresh();
    assert.equal(markup.textContent, '<pk-alert kind="danger">Hi</pk-alert>');

    inspector.show(null);
    assert.equal(box.find('pk-empty-state').length, 1);
    assert.equal(inspector.tag, null);
    inspector.destroy();
    assert.equal(box.children.length, 0);
});

test('setElement follows a replaced live element without redrawing the tables, so a host that redraws its canvas keeps the accordion state', async () => {
    const El = fakeDom();
    const { createElementInspector } = await import('../js/element-inspector.js');
    const box = new El('div');
    const inspector = createElementInspector(box);
    inspector.show({ meta: api.find(m => m.tag === 'pk-alert'), element: liveAlert(El) });
    const tables = box.find('pk-table');
    const [markup] = box.find('pk-code-block');
    inspector.setElement(Object.assign(new El('pk-alert'), { outerHTML: '<pk-alert kind="danger">New</pk-alert>' }));
    assert.equal(markup.textContent, '<pk-alert kind="danger">New</pk-alert>');
    assert.deepEqual(box.find('pk-table'), tables, 'the same tables: nothing was redrawn');
    inspector.destroy();
    inspector.setElement(liveAlert(El));
    assert.equal(box.children.length, 0, 'after destroy it does nothing');
});

test('extraSections: each becomes an accordion item that renders with the meta and the element, and refreshes with it', async () => {
    const El = fakeDom();
    const { createElementInspector } = await import('../js/element-inspector.js');
    const box = new El('div');
    const meta = api.find(m => m.tag === 'pk-alert');
    const live = liveAlert(El);
    const calls = [];
    const section = { title: 'Host notes', render(container, ctx) { calls.push(ctx); const p = document.createElement('p'); p.textContent = `${ctx.meta.tag} / ${ctx.element.outerHTML}`; container.append(p); } };
    const inspector = createElementInspector(box);
    inspector.show({ meta, element: live, extraSections: [section] });
    const items = box.find('pk-accordion-item');
    assert.equal(items.at(-1).getAttribute('heading'), 'Host notes', 'it follows the built-in sections');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].meta, meta);
    assert.equal(calls[0].element, live);
    assert.match(items.at(-1).textContent, /^pk-alert \/ <pk-alert/);
    live.outerHTML = '<pk-alert kind="danger"></pk-alert>';
    inspector.refresh();
    assert.equal(calls.length, 2, 'refresh renders it again');
    assert.match(items.at(-1).textContent, /kind="danger"/);
    assert.equal(box.find('pk-accordion-item').filter(i => i.getAttribute('heading') === 'Host notes').length, 1, 'no duplicate after a refresh');
    inspector.show({ meta });
    assert.ok(!box.find('pk-accordion-item').some(i => i.getAttribute('heading') === 'Host notes'), 'a show without extraSections drops them');
});

test('an extra section that throws is logged and skipped; the others and the built-in sections still draw', async () => {
    const El = fakeDom();
    const { createElementInspector } = await import('../js/element-inspector.js');
    setLogLevel('error');
    const seen = [];
    addLogSink(e => seen.push(e));
    const box = new El('div');
    const inspector = createElementInspector(box);
    const ok = { title: 'Fine', render(c) { c.append(Object.assign(document.createElement('p'), { text: 'fine' })); } };
    const boom = { title: 'Broken', render() { throw new Error('boom'); } };
    inspector.show({ meta: api.find(m => m.tag === 'pk-alert'), extraSections: [boom, ok, { title: 'No render' }, 'nope'] });
    const headings = box.find('pk-accordion-item').map(i => i.getAttribute('heading'));
    assert.ok(headings.includes('Broken') && headings.includes('Fine') && headings.some(x => x.startsWith('Properties')));
    assert.ok(!headings.includes('No render'), 'an entry without a render function is skipped');
    assert.match(box.textContent, /"Broken" section could not be drawn/);
    assert.match(box.textContent, /fine/);
    const errors = seen.filter(e => e.scope === 'element-inspector' && e.level === 'error');
    assert.equal(errors.length, 1);
    assert.match(errors[0].message, /Broken/);
    setLogLevel('warn');
});

test('a missing container fails loudly', async () => {
    fakeDom();
    const { createElementInspector } = await import('../js/element-inspector.js');
    assert.throws(() => createElementInspector(null), /container is required/);
});
