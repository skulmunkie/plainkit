// Unit tests for pk-settings-page: building sectioned fields, applying/reading values, dirty tracking, save/discard, and the error path.
// Stub base, no DOM.
import test from 'node:test';
import assert from 'node:assert/strict';
import behaviour from './settings-page.js';

const fakeEl = tag => ({
    localName: tag, attrs: {}, dataset: {}, children: [], listeners: {}, hidden: false, disabled: false,
    setAttribute(k, v) { this.attrs[k] = String(v); },
    toggleAttribute(k, on) { if (on) this.attrs[k] = ''; else delete this.attrs[k]; },
    scrollIntoView() { this.scrolled = true; }, focus() { this.focused = true; },
    append(...k) { this.children.push(...k); },
    replaceChildren(...k) { this.children = k; },
    addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); },
    fire(type, e) { for (const fn of [...(this.listeners[type] ?? [])]) fn(e); },
    ownerDocument: { createElement: fakeEl },
    set textContent(v) { this._t = v; }, get textContent() { return this._t; },
});

const make = () => {
    const saved = fakeEl('pk-alert');
    const form = fakeEl('form');
    const sections = fakeEl('div');
    const bar = fakeEl('pk-form-actions');
    const status = fakeEl('pk-alert');
    const save = fakeEl('pk-button');
    const discard = fakeEl('pk-button');
    const empty = fakeEl('p');
    for (const p of [sections, bar, status, save, discard, empty]) p.ownerDocument = { createElement: fakeEl };
    const parts = { saved, form, sections, bar, status, save, discard, empty, header: fakeEl('div'), nav: fakeEl('nav'), body: fakeEl('div'), layout: fakeEl('pk-detail-layout') };
    const listened = [];
    const fakeRoot = { querySelectorAll: () => [], matches: () => false };
    const el = new (behaviour(class {
        part(n) { return parts[n]; }
        get ownerDocument() { return { createElement: fakeEl, addEventListener: (t, f, o) => listened.push(['add', t, o.capture]), removeEventListener: (t, f, o) => listened.push(['remove', t, o.capture]) }; }
        get shadowRoot() { return fakeRoot; }
    }))();
    el.config = {};
    el.values = {};
    return { el, parts, listened };
};

test('connected wires the form once (idempotent) and builds the initial sections', () => {
    const { el, parts } = make();
    el.config = { sections: [{ heading: 'Store', fields: [{ key: 'name', type: 'text', label: 'Name' }] }] };
    el.connected();
    el.connected();
    assert.equal(parts.sections.children.length, 1);
    const card = parts.sections.children[0];
    assert.equal(card.localName, 'pk-card');
    assert.equal(card.heading, 'Store');
});

test('an empty config.sections shows the empty-state part instead of rendering nothing, hidden again once sections exist', () => {
    const { el, parts } = make();
    el.buildSections();
    assert.equal(parts.empty.hidden, false);
    assert.equal(parts.sections.children.length, 0);

    el.config = { sections: [{ fields: [{ key: 'name', type: 'text' }] }] };
    el.buildSections();
    assert.equal(parts.empty.hidden, true);
    assert.equal(parts.sections.children.length, 1);
});

test('buildSections maps field types to controls (including switch and range) and only rebuilds when config.sections actually changes', () => {
    const { el, parts } = make();
    el.config = { sections: [{ heading: 'Store', fields: [
        { key: 'name', type: 'text', label: 'Name' },
        { key: 'kind', type: 'select', label: 'Kind', options: ['a', { value: 'b', label: 'B' }] },
        { key: 'sync', type: 'switch', label: 'Sync automatically' },
        { key: 'rate', type: 'range', label: 'Rate limit', min: 10, max: 120 },
    ] }] };
    el.buildSections();
    const stack = parts.sections.children[0].children[0];
    const [name, kind, sync, rateField] = stack.children;
    assert.equal(name.localName, 'pk-input'); assert.equal(name.label, 'Name'); assert.equal(name.showLabel, true);
    assert.equal(kind.localName, 'pk-select'); assert.equal(kind.children.length, 2);
    assert.equal(sync.localName, 'pk-switch'); assert.equal(sync.textContent, 'Sync automatically');
    assert.equal(rateField.localName, 'pk-field'); assert.equal(rateField.label, 'Rate limit');
    const range = rateField.children[0];
    assert.equal(range.localName, 'pk-range'); assert.equal(range.min, 10); assert.equal(range.max, 120); assert.equal(range.output, true);

    const before = parts.sections.children;
    el.buildSections(); // same config.sections: no rebuild
    assert.equal(parts.sections.children, before);
});

test('applyValues writes values into controls and takes a baseline; values() reads them back by key', () => {
    const { el } = make();
    el.config = { sections: [{ fields: [{ key: 'name', type: 'text' }, { key: 'sync', type: 'switch' }] }] };
    el.values = { name: 'Example store', sync: true };
    el.buildSections();
    assert.deepEqual(el.currentValues(), { name: 'Example store', sync: true });
});

test('the save bar is hidden until a field differs from the baseline, and discard restores it', () => {
    const { el, parts } = make();
    el.config = { sections: [{ fields: [{ key: 'name', type: 'text' }] }] };
    el.values = { name: 'Example store' };
    el.buildSections();
    assert.equal(parts.bar.hidden, true, 'no changes yet');

    el.$controls.name.el.value = 'Changed';
    el.paint();
    assert.equal(parts.bar.hidden, false);
    assert.equal(parts.status.textContent, 'Unsaved changes');

    el.discard();
    assert.equal(el.$controls.name.el.value, 'Example store');
    assert.equal(parts.bar.hidden, true);
});

test('saveNow calls save(values), hides the bar, shows the saved message, and takes a new baseline', async () => {
    const { el, parts } = make();
    el.config = { sections: [{ fields: [{ key: 'name', type: 'text' }] }] };
    el.values = { name: 'Example store' };
    el.buildSections();
    el.$controls.name.el.value = 'Changed';
    el.paint();

    let received;
    el.save = async values => { received = values; };
    await el.saveNow();
    assert.deepEqual(received, { name: 'Changed' });
    assert.equal(parts.bar.hidden, true);
    assert.equal(parts.saved.hidden, false);

    el.$controls.name.el.value = 'Changed again';
    el.paint();
    assert.equal(parts.saved.hidden, true, 'editing again hides the saved message');
});

test('a rejecting save() shows the error in the bar status and keeps the bar open', async () => {
    const { el, parts } = make();
    el.config = { sections: [{ fields: [{ key: 'name', type: 'text' }] }] };
    el.values = { name: 'Example store' };
    el.buildSections();
    el.$controls.name.el.value = 'Changed';
    el.paint();

    el.save = async () => { throw new Error('network down'); };
    await el.saveNow();
    assert.equal(parts.status.kind, 'danger');
    assert.equal(parts.status.textContent, 'network down');
    assert.equal(parts.saved.hidden, true);
});

test('the shared title bar fills the page shell with heading, breadcrumb and actions from config, fires pk-action, and draws nothing when none is set', () => {
    const { el, parts } = make();
    el.config = { sections: [] };
    el.connected();
    assert.equal(parts.header.attrs.heading, '');
    assert.equal(parts.header.children.length, 0);
    const events = [];
    el.dispatchEvent = e => events.push(e.detail.key);
    el.config = { heading: 'Settings', breadcrumb: [{ label: 'Home', href: '/' }], actions: [{ key: 'reset', label: 'Reset' }] };
    el.changed('config');
    assert.equal(parts.header.attrs.heading, 'Settings');
    const [crumbs, btn, title] = parts.header.children;
    assert.equal(crumbs.localName, 'pk-breadcrumb');
    assert.equal(btn.slot, 'actions');
    assert.equal(title.localName, 'slot');
    btn.fire('click');
    assert.deepEqual(events, ['reset']);
});

const three = [{ heading: 'Profile', fields: [{ key: 'name', type: 'text' }] }, { heading: 'Billing', fields: [{ key: 'plan', type: 'text' }] }, { heading: 'Billing', fields: [{ key: 'tax', type: 'text' }] }];

test('the section nav (#334) is automatic at three sections: tagged cards, one nav item each with unique anchors, the first current', () => {
    const { el, parts, listened } = make();
    el.config = { sections: three };
    el.buildSections();
    assert.equal(parts.nav.hidden, false);
    assert.equal('data-nav' in parts.body.attrs, true);
    assert.deepEqual(parts.nav.children.map(i => i.dataset.key), ['profile', 'billing', 'billing-3']);
    assert.deepEqual(parts.sections.children.map(c => c.dataset.pkSection), ['profile', 'billing', 'billing-3']);
    assert.equal(parts.nav.children[0].attrs.href, '#profile');
    assert.deepEqual(parts.nav.children.map(i => 'current' in i.attrs), [true, false, false], 'exactly one is current');
    assert.equal(parts.layout.section, 'profile');
    el.connected();
    assert.deepEqual(listened[0], ['add', 'scroll', true], 'the scroll spy listens in the capture phase');
});

test('the section nav is off below three sections, forced on by nav: true, and off by nav: false', () => {
    const { el, parts } = make();
    el.config = { sections: three.slice(0, 2) };
    el.buildSections();
    assert.equal(parts.nav.hidden, true);
    assert.equal(parts.sections.children[0].dataset.pkSection, undefined, 'no tab strip either');
    el.config = { sections: three.slice(0, 2), nav: true };
    el.buildSections();
    assert.equal(parts.nav.hidden, false);
    el.config = { sections: three, nav: false };
    el.buildSections();
    assert.equal(parts.nav.hidden, true);
    assert.equal(parts.nav.children.length, 0);
});

test('a section key wins over its heading, and choosing a nav item scrolls its card, moves focus onto it and marks it current', () => {
    const { el, parts, listened } = make();
    el.config = { sections: [{ key: 'account', heading: 'Your account', fields: [] }, { heading: 'B', fields: [] }, { fields: [] }] };
    el.connected();
    assert.deepEqual(parts.nav.children.map(i => i.dataset.key), ['account', 'b', 'section-3']);
    let prevented = false;
    parts.nav.fire('click', { target: { closest: () => parts.nav.children[1] }, preventDefault() { prevented = true; } });
    const card = parts.sections.children[1];
    assert.equal(prevented, true, 'the href never reaches the router');
    assert.equal(card.scrolled, true);
    assert.equal(card.focused, true);
    assert.equal(card.attrs.tabindex, '-1');
    assert.deepEqual(parts.nav.children.map(i => 'current' in i.attrs), [false, true, false]);
    assert.equal(parts.layout.section, 'b');
    el.disconnected();
    assert.deepEqual(listened.at(-1), ['remove', 'scroll', true], 'the spy is removed with the page');
    assert.equal(listened.filter(l => l[0] === 'add').length, 1);
});

test('switching sections never touches the values: the dirty state and the typed text survive', () => {
    const { el, parts } = make();
    el.config = { sections: three };
    el.values = { name: 'a', plan: 'b', tax: 'c' };
    el.buildSections();
    el.$controls.name.el.value = 'edited';
    el.paint();
    el.go('billing-3');
    el.go('profile');
    assert.equal(parts.bar.hidden, false);
    assert.equal(el.$controls.name.el.value, 'edited');
});

test('saveNow does nothing without a save callback (no throw)', async () => {
    const { el, parts } = make();
    await el.saveNow();
    assert.equal(parts.saved.hidden, false, 'untouched: the stub never sets it');
});

test('a bare section draws no card or heading, keeps its slot, nav item and fields (#1633)', () => {
    const { el, parts } = make();
    el.config = { sections: [{ key: 'a', heading: 'A', bare: true, fields: [{ key: 'name', type: 'text', label: 'Name' }] }, { key: 'b', heading: 'B', fields: [] }, { key: 'c', heading: 'C', fields: [] }] };
    el.connected();
    const [a, b] = parts.sections.children;
    assert.equal(a.localName, 'pk-stack');
    assert.equal(a.heading, undefined);
    assert.equal(a.dataset.pkSection, 'a');
    assert.equal(a.dataset.pkSectionLabel, 'A');
    assert.equal(a.children.find(c => c.localName === 'slot')?.name, 'section-a');
    assert.equal(b.localName, 'pk-card');
    assert.equal(parts.nav.children.length, 3);
    assert.ok(el.$controls.name);
});

test('a section with a key gets a section-<key> slot after its fields, one without does not (#1604)', () => {
    const { el, parts } = make();
    el.config = { sections: [{ key: 'api', heading: 'API', fields: [{ key: 'name', type: 'text', label: 'Name' }] }, { heading: 'Other', fields: [] }] };
    el.connected();
    const slotOf = card => card.children[0].children.find(c => c.localName === 'slot');
    assert.equal(slotOf(parts.sections.children[0])?.name, 'section-api');
    assert.equal(slotOf(parts.sections.children[1]), undefined);
});

test('an edit made while save() is in flight stays unsaved: the baseline is what was sent (#1729)', async () => {
    const { el, parts } = make();
    el.config = { sections: [{ fields: [{ key: 'name', type: 'text' }] }] };
    el.values = { name: 'Example store' };
    el.buildSections();
    el.$controls.name.el.value = 'Sent';
    el.paint();
    el.save = async () => { el.$controls.name.el.value = 'Typed meanwhile'; };
    await el.saveNow();
    assert.equal(parts.bar.hidden, false, 'the newer edit still shows the Save bar');
    assert.equal(parts.status.textContent, 'Unsaved changes');
});
