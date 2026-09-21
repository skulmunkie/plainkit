// The elements that change a two-way prop, or write to a node the host owns, do it the way core/STANDARDS.md ("Ownership and reactivity", rules
// 3 and 4) says: they name the change with the element's commit event, and pk-tag / pk-tooltip leave the host's nodes alone. Fake-DOM checks of
// the behaviour, on the element classes with a stub base.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const load = async name => (await import(`../elements/${name}/${name}.js`)).default;
const make = async (name, props = {}) => Object.assign(new ((await load(name))(Base))(), props);

// A stand-in for PkElement: the props are plain fields, emit() records the event and answers what the host "decided".
class Base {
    constructor(props = {}) { Object.assign(this, { events: [], answer: true, log: { debug() {}, warn() {} } }, props); }
    emit(name, detail, init = {}) { this.events.push({ name, detail, cancelable: init.cancelable !== false }); return this.answer; }
    warnOnce() {}
    requestUpdate() {}
    part() { return { addEventListener() {}, setAttribute() {}, removeAttribute() {} }; }
}

test('pk-tabs: a value that falls back to the first enabled tab raises pk-tab-change (not cancelable), and only when it changed', async () => {
    const tab = (value, disabled = false) => ({ localName: 'pk-tab', value, disabled, offsetParent: {}, id: '', setAttribute() {} });
    const tabs = [tab('a', true), tab('b'), tab('c')];
    const el = await make('tabs', { value: '', noneActive: false, scroll: false, slotted: n => (n === 'tab' ? tabs : []) });
    el.sync();
    assert.equal(el.value, 'b');
    assert.deepEqual(el.events, [{ name: 'pk-tab-change', detail: { value: 'b', previous: '' }, cancelable: false }]);
    el.sync(); // settled: nothing to say
    el.value = 'c'; el.sync(); // the host chose a valid tab: not the element's change
    assert.equal(el.events.length, 1);
    el.value = 'a'; el.sync(); // a disabled tab is not a valid value: back to the first enabled one
    assert.deepEqual(el.events.at(-1), { name: 'pk-tab-change', detail: { value: 'b', previous: 'a' }, cancelable: false });
    const none = await make('tabs', { value: '', noneActive: true, scroll: false, slotted: n => (n === 'tab' ? tabs : []) });
    none.sync();
    assert.equal(none.events.length, 0, 'noneActive shows no tab, so there is no fallback to announce');
});

test('pk-side-nav: a collapsed state restored from storage raises pk-nav-toggle, and only when it differs', async () => {
    const { serializeNav } = await import('../js/nav-logic.js');
    const withStore = async (stored, collapsed) => {
        globalThis.localStorage = { getItem: () => stored };
        return await make('side-nav', { persist: 'k', collapsed, querySelectorAll: () => [] });
    };
    try {
        const el = await withStore(serializeNav([], true), false);
        el.restore();
        assert.equal(el.collapsed, true);
        assert.deepEqual(el.events, [{ name: 'pk-nav-toggle', detail: { collapsed: true }, cancelable: false }]);
        const same = await withStore(serializeNav([], true), true);
        same.restore();
        assert.equal(same.events.length, 0);
    } finally { delete globalThis.localStorage; }
});

test('pk-combobox: opening and closing itself raises pk-combo-toggle once per change; a host change raises nothing', async () => {
    const el = await make('combobox', { open: false });
    el.setOpen(true); el.setOpen(true);
    el.setOpen(false); el.setOpen(false);
    assert.deepEqual(el.events.map(e => [e.name, e.detail.open, e.cancelable]), [['pk-combo-toggle', true, false], ['pk-combo-toggle', false, false]]);
    el.open = true; // the host sets the prop: no setOpen(), no event
    assert.equal(el.events.length, 2);
});

test('pk-command-palette: the shortcut closes through hide(), which asks with pk-close and lets the host cancel', async () => {
    const el = await make('command-palette', { open: true });
    el.answer = false; el.hide('shortcut');
    assert.equal(el.open, true);
    el.answer = true; el.hide('shortcut');
    assert.equal(el.open, false);
    assert.deepEqual(el.events.map(e => [e.name, e.detail.reason]), [['pk-close', 'shortcut'], ['pk-close', 'shortcut']]);
});

test('pk-form: pk-reset follows a reset once its controls have their values, and is dropped when the reset was cancelled', async () => {
    const el = await make('form', {});
    el.controls = () => []; el.summarise = () => {};
    const done = () => new Promise(r => setTimeout(r, 10));
    const ok = { defaultPrevented: false };
    el.reset(ok);
    assert.equal(el.events.length, 0, 'not before the controls reset (the reset event fires first)');
    await done();
    assert.deepEqual(el.events, [{ name: 'pk-reset', detail: null, cancelable: false }]);
    el.reset({ defaultPrevented: false }); el.reset({ defaultPrevented: true });
    await done();
    assert.equal(el.events.length, 1, 'a cancelled reset raises nothing');
    const src = fs.readFileSync(path.join(root, 'elements/form/form.js'), 'utf8');
    assert.match(src, /clearTimeout\(this\.\$rt\)/, 'a disconnected form drops the pending pk-reset');
});

test('pk-tag: it removes itself after pk-remove unless the event was cancelled, the host controls it, or it is disabled', async () => {
    const tag = async props => {
        let click; const el = await make('tag', { value: 'v', textContent: 'Label', disabled: false, controlled: false, removed: false, remove() { this.removed = true; }, ...props });
        el.part = () => ({ addEventListener(_t, f) { click = f; }, setAttribute() {} });
        el.connected(); click(); return el;
    };
    const plain = await tag({});
    assert.deepEqual(plain.events, [{ name: 'pk-remove', detail: { value: 'v' }, cancelable: true }]);
    assert.equal(plain.removed, true, 'nobody handled it: the tag removes itself');
    assert.equal((await tag({ answer: false })).removed, false, 'preventDefault keeps it');
    const hosted = await tag({ controlled: true });
    assert.equal(hosted.events.length, 1);
    assert.equal(hosted.removed, false, 'controlled: the host removes it from its own state');
    const off = await tag({ disabled: true });
    assert.equal(off.events.length + Number(off.removed), 0);
});

test('pk-tooltip: the description is aria-description on the target; nothing is added to the light DOM and no id is written to the host', async () => {
    const target = () => { const a = new Map(); return { a, setAttribute: (k, v) => a.set(k, v), getAttribute: k => a.get(k) ?? null, hasAttribute: k => a.has(k), removeAttribute: k => a.delete(k) }; };
    const t = target();
    const el = await make('tooltip', { text: 'Saves the draft', help: false, slotted: () => [t] });
    el.append = () => assert.fail('appended a node to the light DOM');
    el.setAttribute = () => assert.fail('wrote an attribute on the host');
    el.describe();
    assert.equal(t.a.get('aria-description'), 'Saves the draft');
    assert.equal(t.a.has('aria-describedby'), false);
    el.text = 'Saves it'; el.describe();
    assert.equal(t.a.get('aria-description'), 'Saves it', 'a new text replaces the description');
    el.slotted = () => [];
    el.describe();
    assert.equal(t.a.has('aria-description'), false, 'a target that left the slot is released');
    const own = target(); own.setAttribute('aria-description', 'mine');
    const keep = await make('tooltip', { text: 'Tip', help: false, slotted: () => [own] });
    keep.describe(); keep.describe(true);
    assert.equal(own.a.get('aria-description'), 'mine', 'a description the host wrote is never replaced or removed');
    const gone = target();
    const away = await make('tooltip', { text: 'Tip', help: false, slotted: () => [gone] });
    away.describe(); assert.equal(gone.a.has('aria-description'), true);
    away.describe(true);
    assert.equal(gone.a.has('aria-description'), false, 'disconnecting releases the target');
});

test('the tooltip and tag sources write no node the host renders (no append, no aria-describedby)', () => {
    const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const tip = strip(fs.readFileSync(path.join(root, 'elements/tooltip/tooltip.js'), 'utf8'));
    assert.doesNotMatch(tip, /aria-describedby|\.append\(|createElement|appendChild|insertAdjacent/);
});
