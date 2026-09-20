// The gallery's embedding options: parsing, the query round trip, and cutting the content tree down to what an embedder asked for.
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeOptions, parseQuery, toQuery, isScoped, restrictTree, leaves, filterLeaves, filterTree, initialHash } from '../js/gallery-options.js';
import { CONTROLS, KINDS, ELEMENTS } from '../site/gallery/gallery.data.js';

const slug = s => s.replace(/\W+/g, '-').replace(/^-|-$/g, '').toLowerCase();
const tree = () => [
    { id: 'foundations', title: 'Foundations', items: [{ id: 'colours', title: 'Colours', hash: '#/foundations/colours' }] },
    { id: 'controls', title: 'Controls', groups: [
        { id: 'actions', title: 'Actions', hash: '#/controls/actions', items: [{ id: 'button', title: 'Button', hash: '#/controls/actions/button' }, { id: 'menu', title: 'Menu', hash: '#/controls/actions/menu' }] },
        { id: 'forms-inputs', title: 'Forms & inputs', hash: '#/controls/forms-inputs', items: [{ id: 'input', title: 'Input', hash: '#/controls/forms-inputs/input' }, { id: 'select', title: 'Select', hash: '#/controls/forms-inputs/select' }] },
    ] },
    { id: 'elements', title: 'Elements', items: [{ id: 'overview', title: 'Overview', hash: '#/elements' }, { id: 'pk-tabs', title: 'Tabs', hash: '#/elements/pk-tabs' }] },
    { id: 'samples', title: 'Samples', groups: [
        { id: 'templates', title: 'Templates', hash: '#/samples/templates', items: [{ id: 'overview', title: 'Overview', hash: '#/samples/templates' }, { id: 'crud', title: 'CRUD', hash: '#/samples/templates/crud' }] },
        { id: 'layouts', title: 'Layouts', hash: '#/samples/layouts', items: [{ id: 'list', title: 'List', hash: '#/samples/layouts/list' }] },
    ] },
];
const ids = t => leaves(t).map(l => l.id);

test('options are normalized: unknown values are dropped, lists are split and lower-cased, the group becomes a slug', () => {
    assert.deepEqual(normalizeOptions({}), {});
    assert.deepEqual(normalizeOptions({ kind: 'Controls', group: 'Forms & inputs', control: ' Button, input ,,button', theme: 'light', width: 'phone', filter: ' tag ', chrome: 'none', height: '320.4' }),
        { kind: 'controls', group: 'forms-inputs', control: ['button', 'input'], theme: 'light', width: 'phone', filter: 'tag', chrome: 'none', height: 320 });
    assert.deepEqual(normalizeOptions({ kind: 'widgets', theme: 'sepia', width: 'tablet', chrome: 'half', height: -4 }), {});
    assert.deepEqual(normalizeOptions({ control: ['A', 'b'] }).control, ['a', 'b']);
});

test('the query string round-trips through parseQuery and toQuery', () => {
    const o = { kind: 'controls', group: 'forms-inputs', control: ['input', 'select'], theme: 'dark', width: 'phone', filter: 'a&b c', chrome: 'full', height: 500 };
    assert.deepEqual(parseQuery(`?${toQuery(o)}`), o);
    assert.equal(toQuery({}), '');
    assert.deepEqual(parseQuery(''), {});
    assert.deepEqual(parseQuery('?kind=nonsense&theme=light'), { theme: 'light' });
});

test('only kind, group and control narrow the content', () => {
    assert.equal(isScoped({}), false);
    assert.equal(isScoped({ theme: 'light', width: 'phone', filter: 'x', chrome: 'none' }), false);
    for (const o of [{ kind: 'elements' }, { group: 'actions' }, { control: ['button'] }]) assert.equal(isScoped(o), true);
    assert.equal(restrictTree(tree(), { theme: 'dark' }).length, 4, 'an unscoped tree is returned whole');
});

test('kind picks a section, and layouts and templates pick a group of the samples section', () => {
    assert.deepEqual(restrictTree(tree(), { kind: 'foundations' }).map(s => s.id), ['foundations']);
    assert.deepEqual(ids(restrictTree(tree(), { kind: 'controls' })), ['button', 'menu', 'input', 'select']);
    assert.deepEqual(ids(restrictTree(tree(), { kind: 'templates' })), ['crud'], 'the overview entry is not content');
    assert.deepEqual(ids(restrictTree(tree(), { kind: 'layouts' })), ['list']);
    assert.deepEqual(ids(restrictTree(tree(), { kind: 'elements' })), ['pk-tabs']);
});

test('group and control narrow the controls, by id, by title or by element tag with or without pk-', () => {
    assert.deepEqual(ids(restrictTree(tree(), { group: 'forms-inputs' })), ['input', 'select'], 'a group alone means controls');
    assert.deepEqual(ids(restrictTree(tree(), { group: 'actions', control: ['menu', 'input'] })), ['menu']);
    assert.deepEqual(ids(restrictTree(tree(), { control: ['button', 'select'] })), ['button', 'select']);
    assert.deepEqual(ids(restrictTree(tree(), { kind: 'elements', control: ['tabs'] })), ['pk-tabs']);
    assert.deepEqual(ids(restrictTree(tree(), { kind: 'elements', control: ['pk-tabs'] })), ['pk-tabs']);
    assert.deepEqual(restrictTree(tree(), { control: ['nothing'] }), [], 'no match is an empty tree, not the whole gallery');
});

test('filterLeaves matches the title or the group title, ignoring case and blanks', () => {
    const all = leaves(restrictTree(tree(), { kind: 'controls' }));
    assert.deepEqual(filterLeaves(all, 'BUT').map(l => l.id), ['button']);
    assert.deepEqual(filterLeaves(all, 'forms').map(l => l.id), ['input', 'select'], 'a group title matches its items');
    assert.equal(filterLeaves(all, '  ').length, all.length);
    assert.equal(filterLeaves(all, undefined).length, all.length);
});

test('the gallery opens on the one control, the one group, or the section', () => {
    assert.equal(initialHash(restrictTree(tree(), { control: ['button'] })), '#/controls/actions/button');
    assert.equal(initialHash(restrictTree(tree(), { group: 'forms-inputs' })), '#/controls/forms-inputs');
    assert.equal(initialHash(restrictTree(tree(), { kind: 'controls' })), '#/controls');
    assert.equal(initialHash(restrictTree(tree(), { kind: 'layouts' })), '#/samples/layouts/list');
    assert.equal(initialHash(restrictTree(tree(), { kind: 'elements' })), '#/elements/pk-tabs');
    assert.equal(initialHash([]), '');
});

test('the real control groups can be addressed by name or by slug', () => {
    const groups = KINDS.filter(k => k !== 'Page templates');
    const real = [{ id: 'controls', title: 'Controls', groups: groups.map(k => ({ id: slug(k), title: k, hash: `#/controls/${slug(k)}`, items: CONTROLS.filter(c => c.kind === k).map(c => ({ id: c.id, title: c.name, hash: `#/controls/${slug(k)}/${c.id}` })) })) }];
    const byName = restrictTree(real, normalizeOptions({ group: 'Forms & inputs' }));
    assert.equal(byName.length, 1);
    assert.equal(byName[0].groups[0].id, 'forms-inputs');
    assert.deepEqual(ids(byName), ids(restrictTree(real, { group: 'forms-inputs' })));
    assert.ok(ids(byName).length >= 3);
});

test('filterTree applies the filter to the tree the same way filterLeaves does, so an overview lists only what matches', () => {
    const t = tree();
    for (const f of ['', '  ', undefined]) assert.equal(filterTree(t, f), t, 'no filter returns the tree itself');
    assert.deepEqual(filterTree(t, 'sel').map(s => s.id), ['controls']);
    assert.deepEqual(ids(filterTree(t, 'SEL')), ['select']);
    assert.deepEqual(ids(filterTree(t, 'forms')), ['input', 'select'], 'a group title that matches keeps its items');
    assert.deepEqual(filterTree(t, 'zzz'), []);
    for (const f of ['a', 'e', 'form', 'lay']) assert.deepEqual(ids(filterTree(t, f)), filterLeaves(leaves(t), f).map(l => l.id), 'same leaves as filterLeaves for ' + f);
});

test('the Elements overview honours the filter: the elements tree cut by filterTree keeps only matching tags, and composes with kind scope', () => {
    const by = new Map();
    for (const m of ELEMENTS) { const g = m.group || 'Other'; if (!by.has(g)) by.set(g, []); by.get(g).push({ id: m.tag, title: m.title, hash: '#/elements/' + m.tag }); }
    const full = [{ id: 'elements', title: 'Elements', groups: [...by].map(([title, items]) => ({ id: 'el-' + slug(title), title, hash: '#/elements', items })) }, ...tree().slice(0, 2)];
    const scoped = restrictTree(full, { kind: 'elements' });
    assert.deepEqual(scoped.map(s => s.id), ['elements']);
    const all = ids(filterTree(scoped, ''));
    assert.equal(all.length, ELEMENTS.length);
    const some = ids(filterTree(scoped, 'tabs'));
    assert.ok(some.includes('pk-tabs') && some.length < all.length, 'the filter narrows the list');
    assert.ok(ids(filterTree(scoped, 'tabs')).every(id => { const m = ELEMENTS.find(e => e.tag === id); return m.title.toLowerCase().includes('tabs') || (m.group || 'Other').toLowerCase().includes('tabs'); }));
    assert.deepEqual(filterTree(scoped, 'no-such-element-xyz'), []);
});
