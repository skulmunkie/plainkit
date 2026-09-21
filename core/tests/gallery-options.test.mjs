// The gallery's embedding options: parsing, the query round trip, and cutting the content tree down to what an embedder asked for.
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeOptions, parseQuery, toQuery, isScoped, restrictTree, leaves, filterLeaves, filterTree, initialHash } from '../js/gallery-options.js';
import { ELEMENTS } from '../site/gallery/gallery.data.js';

const slug = s => s.replace(/\W+/g, '-').replace(/^-|-$/g, '').toLowerCase();
const tree = () => [
    { id: 'foundations', title: 'Foundations', items: [{ id: 'colours', title: 'Colours', hash: '#/foundations/colours' }] },
    { id: 'elements', title: 'Elements', groups: [
        { id: 'el-actions', title: 'Actions', hash: '#/elements', items: [{ id: 'pk-button', title: 'Button', hash: '#/elements/pk-button' }, { id: 'pk-menu', title: 'Menu', hash: '#/elements/pk-menu' }] },
        { id: 'el-forms-inputs', title: 'Forms & inputs', hash: '#/elements', items: [{ id: 'pk-input', title: 'Input', hash: '#/elements/pk-input' }, { id: 'pk-select', title: 'Select', hash: '#/elements/pk-select' }] },
        { id: 'el-navigation', title: 'Navigation', hash: '#/elements', items: [{ id: 'pk-tabs', title: 'Tabs', hash: '#/elements/pk-tabs' }] },
    ] },
    { id: 'samples', title: 'Samples', groups: [
        { id: 'templates', title: 'Templates', hash: '#/samples/templates', items: [{ id: 'overview', title: 'Overview', hash: '#/samples/templates' }, { id: 'crud', title: 'CRUD', hash: '#/samples/templates/crud' }] },
        { id: 'layouts', title: 'Layouts', hash: '#/samples/layouts', items: [{ id: 'list', title: 'List', hash: '#/samples/layouts/list' }] },
    ] },
];
const ids = t => leaves(t).map(l => l.id);

test('options are normalized: unknown values are dropped, lists are split and lower-cased, the group becomes a slug', () => {
    assert.deepEqual(normalizeOptions({}), {});
    assert.deepEqual(normalizeOptions({ kind: 'Elements', group: 'Forms & inputs', control: ' Button, input ,,button', theme: 'light', width: 'phone', filter: ' tag ', chrome: 'none', height: '320.4' }),
        { kind: 'elements', group: 'forms-inputs', control: ['button', 'input'], theme: 'light', width: 'phone', filter: 'tag', chrome: 'none', height: 320 });
    assert.deepEqual(normalizeOptions({ kind: 'widgets', theme: 'sepia', width: 'tablet', chrome: 'half', height: -4 }), {});
    assert.deepEqual(normalizeOptions({ control: ['A', 'b'] }).control, ['a', 'b']);
    assert.equal(normalizeOptions({ kind: 'Controls' }).kind, 'controls', 'the old kind name is still accepted');
});

test('the query string round-trips through parseQuery and toQuery', () => {
    const o = { kind: 'elements', group: 'forms-inputs', control: ['input', 'select'], theme: 'dark', width: 'phone', filter: 'a&b c', chrome: 'full', height: 500 };
    assert.deepEqual(parseQuery(`?${toQuery(o)}`), o);
    assert.equal(toQuery({}), '');
    assert.deepEqual(parseQuery(''), {});
    assert.deepEqual(parseQuery('?kind=nonsense&theme=light'), { theme: 'light' });
});

test('only kind, group and control narrow the content', () => {
    assert.equal(isScoped({}), false);
    assert.equal(isScoped({ theme: 'light', width: 'phone', filter: 'x', chrome: 'none' }), false);
    for (const o of [{ kind: 'elements' }, { group: 'actions' }, { control: ['button'] }]) assert.equal(isScoped(o), true);
    assert.equal(restrictTree(tree(), { theme: 'dark' }).length, 3, 'an unscoped tree is returned whole');
});

test('kind picks a section, and layouts and templates pick a group of the samples section', () => {
    assert.deepEqual(restrictTree(tree(), { kind: 'foundations' }).map(s => s.id), ['foundations']);
    assert.deepEqual(ids(restrictTree(tree(), { kind: 'elements' })), ['pk-button', 'pk-menu', 'pk-input', 'pk-select', 'pk-tabs']);
    assert.deepEqual(ids(restrictTree(tree(), { kind: 'controls' })), ids(restrictTree(tree(), { kind: 'elements' })), 'the old kind name means elements');
    assert.deepEqual(ids(restrictTree(tree(), { kind: 'templates' })), ['crud'], 'the overview entry is not content');
    assert.deepEqual(ids(restrictTree(tree(), { kind: 'layouts' })), ['list']);
});

test('group and control narrow the elements, by id, by title or by element tag with or without pk-', () => {
    assert.deepEqual(ids(restrictTree(tree(), { group: 'forms-inputs' })), ['pk-input', 'pk-select'], 'a group alone means elements');
    assert.deepEqual(ids(restrictTree(tree(), { group: 'actions', control: ['menu', 'input'] })), ['pk-menu']);
    assert.deepEqual(ids(restrictTree(tree(), { control: ['button', 'select'] })), ['pk-button', 'pk-select']);
    assert.deepEqual(ids(restrictTree(tree(), { kind: 'elements', control: ['tabs'] })), ['pk-tabs']);
    assert.deepEqual(ids(restrictTree(tree(), { kind: 'elements', control: ['pk-tabs'] })), ['pk-tabs']);
    assert.deepEqual(restrictTree(tree(), { control: ['nothing'] }), [], 'no match is an empty tree, not the whole gallery');
});

test('filterLeaves matches the title or the group title, ignoring case and blanks', () => {
    const all = leaves(restrictTree(tree(), { kind: 'elements' }));
    assert.deepEqual(filterLeaves(all, 'BUT').map(l => l.id), ['pk-button']);
    assert.deepEqual(filterLeaves(all, 'forms').map(l => l.id), ['pk-input', 'pk-select'], 'a group title matches its items');
    assert.equal(filterLeaves(all, '  ').length, all.length);
    assert.equal(filterLeaves(all, undefined).length, all.length);
});

test('the gallery opens on the one element, the one group, or the section', () => {
    assert.equal(initialHash(restrictTree(tree(), { control: ['button'] })), '#/elements/pk-button');
    assert.equal(initialHash(restrictTree(tree(), { group: 'forms-inputs' })), '#/elements');
    assert.equal(initialHash(restrictTree(tree(), { kind: 'elements' })), '#/elements');
    assert.equal(initialHash(restrictTree(tree(), { kind: 'layouts' })), '#/samples/layouts/list');
    assert.equal(initialHash(restrictTree(tree(), { kind: 'elements', control: ['tabs'] })), '#/elements/pk-tabs');
    assert.equal(initialHash([]), '');
});

test('the real element groups can be addressed by name or by slug', () => {
    const by = new Map();
    for (const m of ELEMENTS) { const g = m.group || 'Other'; if (!by.has(g)) by.set(g, []); by.get(g).push({ id: m.tag, title: m.title, hash: '#/elements/' + m.tag }); }
    const real = [{ id: 'elements', title: 'Elements', groups: [...by].map(([title, items]) => ({ id: 'el-' + slug(title), title, hash: '#/elements', items })) }];
    const name = [...by.keys()].find(g => /\W/.test(g)) ?? [...by.keys()][0];
    const byName = restrictTree(real, normalizeOptions({ group: name }));
    assert.equal(byName.length, 1);
    assert.deepEqual(ids(byName), ids(restrictTree(real, { group: slug(name) })));
    assert.ok(ids(byName).length >= 2);
});

test('filterTree applies the filter to the tree the same way filterLeaves does, so an overview lists only what matches', () => {
    const t = tree();
    for (const f of ['', '  ', undefined]) assert.equal(filterTree(t, f), t, 'no filter returns the tree itself');
    assert.deepEqual(filterTree(t, 'sel').map(s => s.id), ['elements']);
    assert.deepEqual(ids(filterTree(t, 'SEL')), ['pk-select']);
    assert.deepEqual(ids(filterTree(t, 'forms')), ['pk-input', 'pk-select'], 'a group title that matches keeps its items');
    assert.deepEqual(filterTree(t, 'zzz'), []);
    for (const f of ['a', 'e', 'form', 'lay']) assert.deepEqual(ids(filterTree(t, f)), filterLeaves(leaves(t), f).map(l => l.id), 'same leaves as filterLeaves for ' + f);
});

test('the Elements overview honours the filter: the elements tree cut by filterTree keeps only matching tags, and composes with kind scope', () => {
    const by = new Map();
    for (const m of ELEMENTS) { const g = m.group || 'Other'; if (!by.has(g)) by.set(g, []); by.get(g).push({ id: m.tag, title: m.title, hash: '#/elements/' + m.tag }); }
    const full = [{ id: 'elements', title: 'Elements', groups: [...by].map(([title, items]) => ({ id: 'el-' + slug(title), title, hash: '#/elements', items })) }, ...tree().slice(0, 1)];
    const scoped = restrictTree(full, { kind: 'elements' });
    assert.deepEqual(scoped.map(s => s.id), ['elements']);
    const all = ids(filterTree(scoped, ''));
    assert.equal(all.length, ELEMENTS.length);
    const some = ids(filterTree(scoped, 'tabs'));
    assert.ok(some.includes('pk-tabs') && some.length < all.length, 'the filter narrows the list');
    assert.ok(ids(filterTree(scoped, 'tabs')).every(id => { const m = ELEMENTS.find(e => e.tag === id); return m.title.toLowerCase().includes('tabs') || (m.group || 'Other').toLowerCase().includes('tabs'); }));
    assert.deepEqual(filterTree(scoped, 'no-such-element-xyz'), []);
});
