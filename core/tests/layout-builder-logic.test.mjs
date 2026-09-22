// The layout builder's pure logic (js/layout-builder-logic.js): the palette, where a new element goes, what the keys do, the inspector fields.
import './needs-bootstrap.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRegistry, emptyDoc, insertNode, moveNode, validateDoc, errorsOf, findNode, flatten } from '../js/layout-model.js';
import { paletteGroups, seedSpec, insertionCandidates, moveTarget, nextSelection, selectionAfterRemove, fieldsFor, propFromControl, nodeLabel, nativeMeta, NATIVE_GROUP } from '../js/layout-builder-logic.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const api = JSON.parse(fs.readFileSync(path.join(root, 'dist', 'elements', 'api.json'), 'utf8'));
const registry = createRegistry(api);

// stack > [h2, card > [p, footer: button], alert]
function page() {
    let doc = emptyDoc();
    const add = (args) => { const r = insertNode(doc, args, registry); doc = r.doc; return r.id; };
    const stack = add({ node: { tag: 'pk-stack' } });
    const h2 = add({ parent: stack, node: { tag: 'h2', text: 'Title' } });
    const card = add({ parent: stack, node: { tag: 'pk-card', props: { heading: 'Open' } } });
    const p = add({ parent: card, node: { tag: 'p', text: 'Waiting' } });
    const button = add({ parent: card, slot: 'footer', node: { tag: 'pk-button', text: 'Review' } });
    const alert = add({ parent: stack, node: { tag: 'pk-alert', text: 'Note' } });
    return { doc, stack, h2, card, p, button, alert };
}

test('the palette lists every element of the API once, grouped like the gallery, plus the native content group first', () => {
    const groups = paletteGroups(api);
    assert.equal(groups[0].group, NATIVE_GROUP);
    const tags = groups.flatMap(g => g.items.map(i => i.tag));
    for (const e of api) assert.ok(tags.includes(e.tag), `${e.tag} is in the palette: a new element appears without a builder change`);
    assert.equal(new Set(tags).size, tags.length);
    assert.deepEqual(groups.slice(1).map(g => g.group), [...new Set(api.map(e => e.group))], 'the API order of groups');
    for (const g of groups) assert.ok(g.items.length > 0);
});

test('palette search matches the tag, title, summary and group, case-insensitively, and drops empty groups', () => {
    const tabs = paletteGroups(api, 'TABS').flatMap(g => g.items.map(i => i.tag));
    assert.ok(tabs.includes('pk-tabs') && tabs.includes('pk-tab'));
    assert.ok(paletteGroups(api, 'nothing-matches-this-xyz').length === 0);
    assert.deepEqual(paletteGroups(api, 'overlays').map(g => g.group).includes('Overlays'), true);
    assert.equal(paletteGroups(api, '  heading ')[0].items[0].tag, 'h2');
});

test('a new element starts with something to see: a heading or label, text for a text-like element, nothing for a container', () => {
    const meta = tag => api.find(e => e.tag === tag);
    assert.deepEqual(seedSpec('pk-card', meta('pk-card')), { tag: 'pk-card', props: { heading: 'Card' } });
    assert.deepEqual(seedSpec('pk-input', meta('pk-input')), { tag: 'pk-input', props: { label: 'Input' } });
    assert.equal(seedSpec('pk-badge', meta('pk-badge')).text, 'Badge');
    assert.deepEqual(seedSpec('pk-stack', meta('pk-stack')), { tag: 'pk-stack' });
    assert.deepEqual(seedSpec('h2'), { tag: 'h2', text: 'Heading' });
    assert.equal(seedSpec('ul').children[0].tag, 'li');
    for (const e of api) {
        const { doc } = insertNode(emptyDoc(), { node: seedSpec(e.tag, e) }, registry);
        assert.deepEqual(errorsOf(validateDoc(doc, registry)), [], `the seed of ${e.tag} is a valid document`);
    }
});

test('insertion goes inside a container, after a leaf, and at the end of the page with no selection', () => {
    const { doc, stack, p, alert } = page();
    assert.deepEqual(insertionCandidates(doc, null, registry).map(c => c.where), ['at the end of the page']);
    const inStack = insertionCandidates(doc, stack, registry);
    assert.deepEqual(inStack.map(c => c.where), ['inside <pk-stack>', 'after <pk-stack>']);
    assert.equal(inStack[0].parent, stack);
    const afterP = insertionCandidates(doc, p, registry);
    assert.equal(afterP[0].where, 'inside <p>', 'a paragraph takes content, so inside comes first');
    const afterAlert = insertionCandidates(doc, alert, registry).at(-1);
    assert.deepEqual([afterAlert.parent, afterAlert.slot, afterAlert.index], [stack, '', 3]);
    const br = insertNode(doc, { parent: stack, node: { tag: 'hr' } }, registry);
    assert.deepEqual(insertionCandidates(br.doc, br.id, registry).map(c => c.where), ['after <hr>'], 'a void element takes nothing inside');
});

test('moveTarget: up and down reorder, out goes to the parent level, in goes into the element before', () => {
    const { doc, stack, h2, card, p, alert } = page();
    assert.equal(moveTarget(doc, h2, 'up'), null, 'first child cannot go up');
    assert.deepEqual(moveTarget(doc, h2, 'down'), { id: h2, parent: stack, slot: '', index: 1 });
    assert.equal(moveTarget(doc, alert, 'down'), null);
    assert.deepEqual(moveTarget(doc, alert, 'up'), { id: alert, parent: stack, slot: '', index: 1 });
    assert.deepEqual(moveTarget(doc, p, 'out'), { id: p, parent: stack, slot: '', index: 2 }, 'p leaves the card and lands right after it');
    assert.equal(moveTarget(doc, stack, 'out'), null, 'a top-level node cannot go out');
    assert.deepEqual(moveTarget(doc, card, 'in'), { id: card, parent: h2, slot: '', index: undefined });
    assert.equal(moveTarget(doc, h2, 'in'), null, 'nothing before it');
    assert.equal(moveTarget(doc, h2, 'sideways'), null);
    assert.equal(moveTarget(doc, 'n404', 'up'), null);
    // Every target the function returns is a move the model accepts, or refuses with a model error: never a crash.
    for (const n of flatten(doc)) for (const d of ['up', 'down', 'out', 'in']) {
        const t = moveTarget(doc, n.id, d);
        if (!t) continue;
        try { assert.deepEqual(errorsOf(validateDoc(moveNode(doc, t, registry).doc, registry)), []); } catch (error) { assert.equal(error.name, 'ModelError'); }
    }
    const moved = moveNode(doc, moveTarget(doc, h2, 'down'), registry).doc;
    assert.equal(moved.nodes[0].slots[''][1].id, h2);
    const out = moveNode(doc, moveTarget(doc, p, 'out'), registry).doc;
    assert.equal(findNode(out, card).slots[''], undefined);
});

test('nextSelection walks the page in document order, up to the parent and down to the first child', () => {
    const { doc, stack, h2, card, p, button, alert } = page();
    assert.equal(nextSelection(doc, stack, 'ArrowDown'), h2);
    assert.equal(nextSelection(doc, h2, 'ArrowDown'), card);
    assert.equal(nextSelection(doc, card, 'ArrowDown'), p);
    assert.equal(nextSelection(doc, p, 'ArrowDown'), button);
    assert.equal(nextSelection(doc, alert, 'ArrowDown'), alert, 'the last stays');
    assert.equal(nextSelection(doc, stack, 'ArrowUp'), stack);
    assert.equal(nextSelection(doc, button, 'ArrowLeft'), card);
    assert.equal(nextSelection(doc, stack, 'ArrowLeft'), stack, 'a top-level node has no parent');
    assert.equal(nextSelection(doc, card, 'ArrowRight'), p);
    assert.equal(nextSelection(doc, h2, 'ArrowRight'), h2, 'a leaf stays');
    assert.equal(nextSelection(doc, p, 'Home'), stack);
    assert.equal(nextSelection(doc, p, 'End'), alert);
    assert.equal(nextSelection(doc, null, 'ArrowDown'), stack, 'with nothing selected the first node is chosen');
    assert.equal(nextSelection(emptyDoc(), null, 'ArrowDown'), null);
});

test('after a removal the selection goes to the sibling that took its place, else the one before, else the parent', () => {
    const { doc, stack, h2, card, p, alert } = page();
    assert.equal(selectionAfterRemove(doc, h2), card);
    assert.equal(selectionAfterRemove(doc, alert), card);
    assert.equal(selectionAfterRemove(doc, p), card, 'the only child of its slot: the parent');
    assert.equal(selectionAfterRemove(doc, stack), null);
    assert.equal(selectionAfterRemove(doc, 'n404'), null);
});

test('inspector fields come from the element API: a control kind per prop type, the current value, then id and class', () => {
    const { doc, card } = page();
    const fields = fieldsFor(registry.entry('pk-card'), findNode(doc, card));
    const by = Object.fromEntries(fields.map(f => [f.attr, f]));
    assert.equal(by.heading.type, 'string');
    assert.equal(by.heading.value, 'Open');
    assert.equal(by.level.type, 'number');
    assert.deepEqual([by.tone.type, by.tone.values, by.tone.default], ['enum', ['default', 'error'], 'default']);
    assert.equal(by.flush.type, 'boolean');
    assert.ok(by.id && by.class, 'global attributes are offered');
    assert.equal(fields.at(-1).attr, 'class');
    assert.equal(fieldsFor(registry.entry('pk-input'), { props: {} }).find(f => f.attr === 'show-label').type, 'boolean', 'attribute names are kebab-case');
    assert.deepEqual(fieldsFor(null, {}), []);
    assert.equal(fieldsFor(registry.entry('a'), { props: { href: '#' } })[0].value, '#');
    assert.equal(fieldsFor(registry.entry('pk-table'), { props: {} }).some(f => f.type === 'json'), true);
});

test('what a control means for setProp: empty removes, a boolean is true or removed', () => {
    assert.equal(propFromControl('string', ''), undefined);
    assert.equal(propFromControl('string', 'x'), 'x');
    assert.equal(propFromControl('number', '3'), '3');
    assert.equal(propFromControl('enum', ''), undefined);
    assert.equal(propFromControl('boolean', true), true);
    assert.equal(propFromControl('boolean', false), undefined);
});

test('labels and native metadata for the tree and the inspector', () => {
    const { doc, card, h2, stack } = page();
    assert.equal(nodeLabel(findNode(doc, card)), 'pk-card: Open');
    assert.equal(nodeLabel(findNode(doc, h2)), 'h2: Title');
    assert.equal(nodeLabel(findNode(doc, stack)), 'pk-stack');
    assert.match(nodeLabel({ tag: 'p', props: {}, slots: { '': ['x'.repeat(60)] } }), /^p: x{27}…$/);
    const meta = nativeMeta('a', registry.entry('a'));
    assert.deepEqual([meta.tag, meta.props.map(p => p.name)], ['a', ['href', 'target', 'rel', 'download']]);
    assert.equal(meta.slots[0].name, '');
});
