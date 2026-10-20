// Unit tests for pk-label-sheet: length validation and the custom properties it sets. Stub base, no DOM.
import test from 'node:test';
import assert from 'node:assert/strict';
import behaviour, { length } from './label-sheet.js';

const make = (props, kids = []) => {
    const vars = {}, warns = [];
    const el = new (behaviour(class { slotted() { return kids; } watchSlot() {} requestUpdate() {} warnOnce(k) { warns.push(k); } }))();
    el.style = { setProperty: (k, v) => { vars[k] = v; } };
    Object.assign(el, { cellWidth: '50mm', cellHeight: '25mm', columns: 0, gap: '0', offsetX: '0', offsetY: '0', scrollWidth: 10, clientWidth: 10 }, props);
    return { el, vars, warns };
};

test('lengths accept a number with a physical unit and nothing else', () => {
    for (const ok of ['50mm', '2.5cm', '.5in', '12pt', '0', '8px']) assert.equal(length(ok), ok);
    for (const bad of ['', 'auto', '5mm; color:red', 'calc(1mm)', '5 mm', 'mm']) assert.equal(length(bad), null);
});

test('valid props become the private custom properties', () => {
    const { el, vars, warns } = make({ cellWidth: '4in', cellHeight: '6in', columns: 3, gap: '2mm', offsetX: '5mm' });
    el.updated();
    assert.deepEqual([vars['--_cw'], vars['--_ch'], vars['--_cols'], vars['--_gap'], vars['--_ox']], ['4in', '6in', '3', '2mm', '5mm']);
    assert.equal(warns.length, 0);
});

test('columns 0 fits as many as the width allows', () => {
    const { el, vars } = make();
    el.updated();
    assert.equal(vars['--_cols'], 'auto-fill');
});

test('an invalid length falls back to the default and warns once per prop', () => {
    const { el, vars, warns } = make({ cellWidth: '5mm; x', gap: 'wide' });
    el.updated();
    assert.equal(vars['--_cw'], '50mm');
    assert.equal(vars['--_gap'], '0');
    assert.deepEqual(warns, ['bad:cellWidth', 'bad:gap']);
});

test('a child bigger than its cell is marked data-clipped', () => {
    const marks = [];
    const kid = (w, cw) => ({ scrollWidth: w, clientWidth: cw, scrollHeight: 5, clientHeight: 5, toggleAttribute: (n, on) => marks.push([n, on]) });
    make({}, [kid(200, 100), kid(100, 100)]).el.updated();
    assert.deepEqual(marks, [['data-clipped', true], ['data-clipped', false]]);
});
