// pk-date-range-picker: the pure range rules, the behaviour on a stub base (events, presets, validity, form value) and the meta held to the standards.
// The rendered control and its states are checked by the review scenario (tests/review/scenarios/date-range-picker.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import behaviour, { cleanIso, presetList, presetRange, clampRange, rangeProblems, DEFAULT_PRESETS, PRESETS } from './date-range-picker.js';

const read = ext => fs.readFileSync(fileURLToPath(new URL(`./date-range-picker.${ext}`, import.meta.url)), 'utf8');
const meta = JSON.parse(read('meta.json'));

test('cleanIso keeps only yyyy-mm-dd', () => {
    assert.equal(cleanIso('2026-09-01'), '2026-09-01');
    for (const bad of ['', undefined, '9/1/2026', '2026-9-1', '2026-09-01T00:00']) assert.equal(cleanIso(bad), '');
});

test('presetList keeps known keys in order without duplicates; the default is listed in the meta', () => {
    assert.deepEqual(presetList('7d, month  7d bogus'), ['7d', 'month']);
    assert.deepEqual(presetList(''), []);
    assert.equal(meta.props.find(p => p.name === 'presets').default, DEFAULT_PRESETS);
    assert.ok(presetList(DEFAULT_PRESETS).every(k => k in PRESETS));
});

test('presetRange counts inclusive days and month edges', () => {
    const t = '2026-09-19';
    assert.deepEqual(presetRange('today', t), { start: t, end: t });
    assert.deepEqual(presetRange('7d', t), { start: '2026-09-13', end: t });
    assert.deepEqual(presetRange('30d', t), { start: '2026-08-21', end: t });
    assert.deepEqual(presetRange('month', t), { start: '2026-09-01', end: t });
    assert.deepEqual(presetRange('lastmonth', t), { start: '2026-08-01', end: '2026-08-31' });
    assert.deepEqual(presetRange('lastmonth', '2026-01-10'), { start: '2025-12-01', end: '2025-12-31' });
    assert.deepEqual(presetRange('year', t), { start: '2026-01-01', end: t });
    assert.equal(presetRange('nope', t), null);
});

test('clampRange cuts to min and max and refuses a range with nothing inside', () => {
    const r = { start: '2026-09-01', end: '2026-09-30' };
    assert.deepEqual(clampRange(r, '2026-09-10', '2026-09-20'), { start: '2026-09-10', end: '2026-09-20' });
    assert.deepEqual(clampRange(r, '', ''), r);
    assert.equal(clampRange(r, '2026-10-01', ''), null);
    assert.equal(clampRange(r, '', '2026-08-31'), null);
});

test('rangeProblems flags an end before the start, dates outside min and max, and a missing date when required', () => {
    assert.equal(rangeProblems('2026-09-01', '2026-09-02').invalid, false);
    assert.equal(rangeProblems('2026-09-01', '2026-09-01').invalid, false, 'a one-day range is fine');
    assert.equal(rangeProblems('', '').invalid, false);
    const order = rangeProblems('2026-09-20', '2026-09-10');
    assert.equal(order.flags.customError, true); assert.match(order.message, /before the start/);
    assert.equal(rangeProblems('2026-08-01', '2026-09-02', { min: '2026-09-01' }).flags.rangeUnderflow, true);
    assert.equal(rangeProblems('2026-09-01', '2026-10-02', { max: '2026-09-30' }).flags.rangeOverflow, true);
    assert.equal(rangeProblems('2026-09-01', '', { required: true }).flags.valueMissing, true);
    assert.equal(rangeProblems('', '', { required: false }).flags.valueMissing, undefined);
});

// A stand-in for PkElement: props are plain fields, emit() and setValidity() record.
const field = () => { const l = {}; return { value: '', disabled: false, readonly: false, required: false, invalid: false, description: '', label: '', l, addEventListener(t, f) { l[t] = f; } }; };
const make = (props = {}) => {
    const parts = { start: field(), end: field(), error: { textContent: '', hidden: true }, presets: { hidden: false, children: [], l: {}, addEventListener(t, f) { this.l[t] = f; }, replaceChildren(...c) { this.children = c; } } };
    const doc = { createElement: () => ({ dataset: {} }) };
    const el = new (behaviour(class { requestUpdate() {} emit(name, detail) { this.events.push({ name, detail }); return true; } setValidity(f, m, a) { this.validity = { f, m, a }; } setFormValue(v) { this.form = v; } }))();
    Object.assign(el, { shadowRoot: null, events: [], start: '', end: '', min: '', max: '', presets: DEFAULT_PRESETS, disabled: false, readonly: false, required: false, invalid: false, startLabel: '', endLabel: '', ownerDocument: doc, dispatchEvent(e) { this.events.push({ name: e.type }); return true; } }, props);
    el.part = name => parts[name];
    el.connected(); el.updated();
    return { el, parts };
};

test('the fields show the range, the form gets the ISO interval, and the presets render as buttons', () => {
    const { el, parts } = make({ start: '2026-09-01', end: '2026-09-14' });
    assert.equal(parts.start.value, '2026-09-01'); assert.equal(parts.end.value, '2026-09-14');
    assert.equal(el.form, '2026-09-01/2026-09-14');
    assert.deepEqual(parts.presets.children.map(b => b.dataset.preset), ['today', '7d', '30d', 'month']);
    assert.equal(parts.error.hidden, true);
    assert.equal(make().el.form, '');
});

test('committing a date raises change and pk-range-change with the range and its validity', () => {
    const { el, parts } = make({ start: '2026-09-01', end: '2026-09-14' });
    parts.end.value = '2026-08-01'; parts.end.l.change({ stopPropagation() {} });
    assert.equal(el.end, '2026-08-01');
    const ev = el.events.at(-1);
    assert.equal(ev.name, 'pk-range-change'); assert.deepEqual(ev.detail, { start: '2026-09-01', end: '2026-08-01', valid: false });
    assert.equal(el.events.at(-2).name, 'change');
    el.updated();
    assert.equal(parts.error.hidden, false); assert.match(parts.error.textContent, /before the start/);
    assert.equal(parts.end.invalid, true); assert.match(parts.end.description, /before the start/);
    assert.equal(el.validity.f.customError, true);
});

test('typing raises input, not change; a half-typed value that is not a full date reads as empty', () => {
    const { el, parts } = make({ start: '2026-09-01', end: '2026-09-14' });
    parts.start.value = ''; parts.start.l.input();
    assert.equal(el.start, ''); assert.equal(el.events.at(-2).name, 'input');
});

test('a quick range sets both dates, is cut to min and max, and is disabled when nothing of it fits', () => {
    const { el, parts } = make({ presets: 'today,year', max: '2000-01-01' });
    assert.ok(parts.presets.children.every(b => b.disabled), 'both ranges lie after max');
    const ok = make({ presets: 'year' });
    const btn = ok.parts.presets.children[0];
    ok.parts.presets.l.click({ target: { closest: () => btn } });
    assert.match(ok.el.start, /-01-01$/); assert.ok(ok.el.end >= ok.el.start);
    assert.equal(ok.el.events.at(-1).detail.valid, true);
    void el;
});

test('required, disabled and readonly reach the fields and the presets', () => {
    const { parts, el } = make({ required: true, disabled: true, readonly: true });
    assert.equal(parts.start.required, true); assert.equal(parts.end.disabled, true); assert.equal(parts.start.readonly, true);
    assert.ok(parts.presets.children.every(b => b.disabled));
    assert.equal(el.validity.f.valueMissing, true); assert.equal(parts.error.hidden, true, 'a missing date is not shown as an error until the form asks');
});

test('reset returns to the initial range and clear empties it and raises the event', () => {
    const { el } = make({ start: '2026-09-01', end: '2026-09-14' });
    el.start = ''; el.end = ''; el.onReset();
    assert.equal(el.start, '2026-09-01'); assert.equal(el.end, '2026-09-14');
    el.onRestore('2026-10-01/2026-10-05'); assert.equal(el.end, '2026-10-05');
    el.clear(); assert.equal(el.start, ''); assert.equal(el.events.at(-1).name, 'pk-range-change');
});

test('the meta names the commit event on both two-way props and the css uses tokens only', () => {
    for (const n of ['start', 'end']) assert.equal(meta.props.find(p => p.name === n).commit, 'pk-range-change');
    assert.ok(meta.events.some(e => e.name === 'pk-range-change'));
    assert.doesNotMatch(read('css'), /#[0-9a-f]{3,8}\b|rgba?\(/i);
    for (const h of ['--pk-control-bg', '--pk-control-border', '--pk-control-radius']) {
        assert.ok(meta.cssProperties.some(p => p.name === h), `${h} is documented`);
        assert.match(read('css'), new RegExp(`\\[part="start"\\], \\[part="end"\\] \\{[^}]*${h}: var\\(--_`), `${h} is passed on to the pk-input fields`);
    }
});
