// Unit tests for pk-sections-page (#2010): config.sections to header tabs and layout section wrappers, side cards only where the host gave one, visible false, the selected
// section, the title bar keys. Stub base, no DOM.
import test from 'node:test';
import assert from 'node:assert/strict';
import behaviour from './sections-page.js';

const fakeEl = tag => ({
    localName: tag, attrs: {}, dataset: {}, children: [], listeners: {}, $bar: undefined,
    setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return this.attrs[k] ?? null; }, removeAttribute(k) { delete this.attrs[k]; },
    toggleAttribute(k, on) { if (on) this.attrs[k] = ''; else delete this.attrs[k]; },
    append(...k) { this.children.push(...k); }, replaceChildren(...k) { this.children = k; },
    addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); },
    querySelector() { return fakeEl('slot'); },
    ownerDocument: { createElement: fakeEl, defaultView: null },
    set textContent(v) { this._t = v; }, get textContent() { return this._t; },
});
const make = (config, kids = []) => {
    const parts = { layout: fakeEl('pk-detail-layout'), tabs: fakeEl('pk-tabs'), header: fakeEl('pk-page-shell') };
    const El = behaviour(class { warnOnce(k) { (this.warned ??= []).push(k); } part(n) { return parts[n]; } });
    const el = new El();
    Object.assign(el, { config, children: kids, shadowRoot: {}, ownerDocument: { createElement: fakeEl, defaultView: null } });
    el.build();
    return { el, parts };
};
const sections = [{ id: 'details', label: 'Details' }, { id: 'orders', label: 'Orders', count: 3 }, { id: 'audit', label: 'Audit', visible: false }];

test('config.sections become the header tabs (a visible false section is left out) and one layout wrapper each', () => {
    const { parts } = make({ sections });
    assert.deepEqual(parts.tabs.children.map(t => [t.value, t.textContent, t.attrs.count]), [['details', 'Details', undefined], ['orders', 'Orders', '3']]);
    assert.deepEqual(parts.layout.children.map(w => [w.dataset.pkSection, w.dataset.pkSectionLabel, w.dataset.pkSectionCount, w.slot]), [['details', 'Details', undefined, undefined], ['orders', 'Orders', '3', undefined]]);
    assert.equal(parts.layout.children[0].children[0].name, 'section-details');
});
test('a side wrapper is drawn only for a section whose host child has slot="side-<id>"', () => {
    const { parts } = make({ sections }, [{ slot: 'side-details' }]);
    const side = parts.layout.children.filter(w => w.slot === 'sidebar');
    assert.equal(side.length, 1);
    assert.equal(side[0].dataset.pkSection, 'details');
    assert.equal(side[0].children[0].name, 'side-details');
});
test('the first visible section is selected, config.section chooses another, a hidden or unknown one is ignored', () => {
    assert.equal(make({ sections }).parts.layout.section, 'details');
    assert.equal(make({ sections, section: 'orders' }).parts.tabs.value, 'orders');
    assert.equal(make({ sections, section: 'audit' }).parts.tabs.value, 'details');
});
test('a slotted child naming no section is reported once and the strip is hidden below two sections', () => {
    const { el, parts } = make({ sections: [sections[0]] }, [{ slot: 'section-nope' }]);
    assert.deepEqual(el.warned, ['slot:section-nope']);
    assert.ok('hidden' in parts.tabs.attrs);
});
test('the title bar is the shared one: heading, and the actions as the same items showTitleBar takes', () => {
    const { parts } = make({ sections, heading: 'Blue mug', actions: [{ key: 'edit', label: 'Edit', variant: 'primary' }] });
    assert.equal(parts.header.attrs.heading, 'Blue mug');
    const btn = parts.header.children.find(c => c.localName === 'pk-button');
    assert.equal(btn.variant, 'primary');
});
