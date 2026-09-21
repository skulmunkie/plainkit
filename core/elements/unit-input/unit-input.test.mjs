// pk-unit-input: the value rules, the behaviour on a stub base (commit events, the unit list), and the meta, css and mapping held to the standards.
// The rendered control, the number and select in a real form and the phone size are checked in the browser suite (tests/browser/cases-forms.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import behaviour, { unitList, parseUnitValue, joinUnitValue, matchUnit, DEFAULT_UNITS } from './unit-input.js';

const read = ext => fs.readFileSync(fileURLToPath(new URL(`./unit-input.${ext}`, import.meta.url)), 'utf8');
const meta = JSON.parse(read('meta.json')); const css = read('css'); const html = read('html');
const prop = name => meta.props.find(p => p.name === name);

test('unitList splits on commas and spaces, drops duplicates, and falls back to the default set', () => {
    assert.deepEqual(unitList('px, rem  em,px'), ['px', 'rem', 'em']);
    assert.deepEqual(unitList('ms s'), ['ms', 's']);
    assert.deepEqual(unitList(''), DEFAULT_UNITS); assert.deepEqual(unitList(undefined), DEFAULT_UNITS);
    assert.equal(prop('units').default, DEFAULT_UNITS.join(','));
});

test('parseUnitValue reads a number with an optional unit and refuses anything else', () => {
    assert.deepEqual(parseUnitValue('1.5rem'), { number: '1.5', unit: 'rem' });
    assert.deepEqual(parseUnitValue(' -12 px '), { number: '-12', unit: 'px' });
    assert.deepEqual(parseUnitValue('50%'), { number: '50', unit: '%' });
    assert.deepEqual(parseUnitValue('.5em'), { number: '.5', unit: 'em' });
    assert.deepEqual(parseUnitValue('12'), { number: '12', unit: '' });
    assert.deepEqual(parseUnitValue('1e3px'), { number: '1e3', unit: 'px' });
    assert.deepEqual(parseUnitValue(''), { number: '', unit: '' });
    for (const bad of ['auto', 'calc(1px + 2px)', 'rem', '1.5.2rem', '12 px 4px']) assert.equal(parseUnitValue(bad), null, bad);
});

test('joinUnitValue is empty until there is a number, and matchUnit ignores case', () => {
    assert.equal(joinUnitValue('1.5', 'rem'), '1.5rem'); assert.equal(joinUnitValue('', 'rem'), ''); assert.equal(joinUnitValue(' ', 'px'), '');
    assert.equal(matchUnit(['px', 'rem'], 'REM'), 'rem'); assert.equal(matchUnit(['px'], 'vh'), null);
});

// A stand-in for PkElement (as tests/commit-events.test.mjs uses): props are plain fields, emit() and setValidity() record.
const make = (props = {}) => {
    const listeners = { n: {}, u: {} };
    const n = { value: '', validity: { valueMissing: false }, validationMessage: '', addEventListener(t, f) { listeners.n[t] = f; } };
    const u = { value: '', disabled: false, options: [], attrs: {}, addEventListener(t, f) { listeners.u[t] = f; }, setAttribute(k, v) { this.attrs[k] = v; }, replaceChildren(...o) { this.options = o.map(x => x.value); } };
    const doc = { createElement: () => ({ value: '', textContent: '' }) };
    const el = new (behaviour(class { emit(name, detail) { this.events.push({ name, detail }); return true; } warnOnce(k) { this.warned.push(k); } setValidity() {} setFormValue(v) { this.form = v; } }))();
    Object.assign(el, { events: [], warned: [], value: '', units: 'px,rem,em,%', label: 'Width', disabled: false, readonly: false, ownerDocument: doc, dispatchEvent(e) { this.events.push({ name: e.type }); return true; } }, props);
    el.part = name => (name === 'control' ? n : u);
    el.connected(); el.updated();
    return { el, n, u, listeners };
};

test('the number shows the value split from its unit, the select lists the units, the form gets the joined value', () => {
    const { el, n, u } = make({ value: '1.5rem' });
    assert.equal(n.value, '1.5'); assert.equal(u.value, 'rem'); assert.deepEqual(u.options, ['px', 'rem', 'em', '%']); assert.equal(el.form, '1.5rem');
    assert.equal(u.attrs['aria-label'], 'Width unit');
    const empty = make({ value: '' });
    assert.equal(empty.n.value, ''); assert.equal(empty.u.value, 'px', 'the first unit until one is chosen');
});

test('a unit outside the list is added so the value keeps it; junk warns once and leaves the number empty', () => {
    const { u } = make({ value: '10vh' });
    assert.deepEqual(u.options, ['px', 'rem', 'em', '%', 'vh']); assert.equal(u.value, 'vh');
    const caps = make({ value: '2EM' });
    assert.equal(caps.u.value, 'em');
    const junk = make({ value: 'auto' });
    assert.equal(junk.n.value, ''); assert.equal(junk.el.value, 'auto', 'the value is left alone'); assert.deepEqual(junk.el.warned, ['v']);
});

test('typing joins the number with the chosen unit; the commit event comes with change, once, and never for a host change', () => {
    const { el, n, u, listeners } = make({ value: '1rem' });
    n.value = '2.25'; listeners.n.input();
    assert.equal(el.value, '2.25rem'); assert.equal(el.events.length, 0, 'no commit while typing'); el.updated();
    listeners.n.change();
    assert.deepEqual(el.events, [{ name: 'change' }, { name: 'pk-value-change', detail: { value: '2.25rem' } }]);
    u.value = 'px'; listeners.u.change();
    assert.equal(el.value, '2.25px'); el.updated();
    assert.deepEqual(el.events.at(-1), { name: 'pk-value-change', detail: { value: '2.25px' } });
    const before = el.events.length;
    el.value = '3em'; el.updated();
    assert.equal(el.events.length, before, 'a value the host sets raises nothing'); assert.equal(u.value, 'em'); assert.equal(n.value, '3');
    n.value = ''; listeners.n.input(); assert.equal(el.value, '', 'clearing the number clears the value'); el.updated(); assert.equal(u.value, 'em', 'the unit is kept for the next number');
});

test('readonly and disabled disable the unit select; a reset restores the initial value and unit', () => {
    const ro = make({ value: '1px', readonly: true }); assert.equal(ro.u.disabled, true);
    const off = make({ value: '1px', disabled: true }); assert.equal(off.u.disabled, true);
    const { el, u } = make({ value: '1rem' });
    el.value = '4em'; el.updated(); assert.equal(u.value, 'em');
    el.onReset(); el.updated(); assert.equal(el.value, '1rem'); assert.equal(u.value, 'rem');
});

test('the meta names the commit event with the same detail shape as pk-input, and the mapping and template agree with it', () => {
    assert.equal(prop('value').commit, 'pk-value-change');
    const ev = meta.events.find(e => e.name === 'pk-value-change');
    assert.equal(ev.detail, '{ value: string }'); assert.deepEqual(ev.detailProps, { value: 'string' });
    assert.equal(prop('showLabel').type, 'boolean'); assert.equal(prop('showLabel').default, false);
    assert.match(html, /<label part="label" for="c">\{\{label\}\}<\/label>/); assert.match(html, /<input part="control" id="c" type="number"/);
    assert.ok(css.includes(':host([show-label]) label { display: block; }'));
    assert.equal(meta.formAssociated, true);
    const map = JSON.parse(fs.readFileSync(fileURLToPath(new URL('../../../blazor/mappings/unit-input.json', import.meta.url)), 'utf8'));
    assert.equal(map.params.find(p => p.prop === 'value').bind.event, 'pk-value-change');
    assert.ok(map.params.some(p => p.name === 'ShowLabel' && p.prop === 'showLabel'));
});

test('the css uses tokens only and logical properties, and the source has no subscriptions outside its own shadow tree', () => {
    assert.ok(!/#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(/i.test(css), 'literal colour');
    assert.ok(!/\b(margin|padding|border)-(left|right|top|bottom)\b/.test(css), 'physical properties');
    const tokens = fs.readFileSync(fileURLToPath(new URL('../../tokens/tokens.css', import.meta.url)), 'utf8');
    for (const [, tok] of css.matchAll(/var\((--(?:space|color|text|radius|touch|ctl|focus|field)[\w-]*)\)/g)) assert.ok(tokens.includes(`${tok}:`), `${tok} exists`);
    assert.ok(css.includes('var(--touch-target)') && css.includes('font-size: 16px'), 'a phone gets the 44px control and 16px text');
    assert.ok(!/\b(document|window)\s*\.\s*addEventListener|setInterval|setTimeout|Observer\(/.test(fs.readFileSync(fileURLToPath(new URL('./unit-input.js', import.meta.url)), 'utf8')));
});
