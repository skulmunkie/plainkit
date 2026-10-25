// Unit tests for pk-fill-column (#1675): the fixed length, the hidden empty fixed region, and the css held to its API. Stub base, no DOM.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

globalThis.CSS ??= { supports: (p, v) => /^\d+(\.\d+)?(px|rem|em|vh|%)$/.test(v) };
const { default: behaviour, fixedLength } = await import('./fill-column.js');
const read = ext => fs.readFileSync(fileURLToPath(new URL(`./fill-column.${ext}`, import.meta.url)), 'utf8');
const css = read('css'), meta = JSON.parse(read('meta.json'));

const make = (fixed, kids = []) => {
    const vars = {}, warns = [], part = { hidden: false };
    const el = new (behaviour(class { slotted() { return kids; } watchSlot() {} requestUpdate() {} warnOnce(k) { warns.push(k); } part() { return part; } }))();
    el.style = { setProperty: (k, v) => { vars[k] = v; }, removeProperty: k => { delete vars[k]; } };
    el.fixed = fixed;
    el.updated();
    return { vars, warns, part };
};

test('a CSS length becomes the private fixed height; empty or invalid keeps the natural height (invalid warns once)', () => {
    assert.equal(make('12rem', [{}]).vars['--_fh'], '12rem');
    const empty = make('', [{}]); assert.equal(empty.vars['--_fh'], undefined); assert.deepEqual(empty.warns, []);
    const bad = make('tall', [{}]); assert.equal(bad.vars['--_fh'], undefined); assert.deepEqual(bad.warns, ['fixed']);
    assert.equal(fixedLength('40vh'), '40vh'); assert.equal(fixedLength('auto; color:red'), null);
});

test('the fixed region is hidden while nothing is in the fixed slot', () => {
    assert.equal(make('', []).part.hidden, true);
    assert.equal(make('', [{}]).part.hidden, false);
});

test('css: fills its parent, the rest grows and scrolls, every gap value has a rule, logical properties only', () => {
    assert.match(css, /:host \{[^}]*block-size: 100%; min-block-size: 0;/);
    assert.match(css, /\[part="rest"\] \{ flex: 1 1 0; min-block-size: 0; overflow-y: auto;/);
    assert.ok(css.includes('[part="fixed"][hidden] { display: none; }') && css.includes(':host([hidden])'));
    const gap = meta.props.find(p => p.name === 'gap');
    for (const v of gap.values) assert.ok(v === gap.default || css.includes(`:host([gap="${v}"])`), `gap ${v}`);
    assert.ok(!/\b(margin|padding|border)-(left|right|top|bottom)\b|\b(width|height)\s*:/.test(css), 'physical properties');
    assert.equal(meta.tier, 'element');
});
