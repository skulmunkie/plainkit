import test from 'node:test';
import assert from 'node:assert/strict';
import { shedWidth, needsWidth, shedCss } from '../js/table-shed.js';

// Issue 1684: the pure parts of pk-table's width-based shed (the rules are verified in a real browser by the table shed cases).
test('shedWidth reads a length or a number of rem above 3, and leaves the steps 1 to 3 to table.css', () => {
    assert.equal(shedWidth('60rem'), '60rem'); assert.equal(shedWidth('900px'), '900px'); assert.equal(shedWidth(72), '72rem'); assert.equal(shedWidth('40.5'), '40.5rem'); assert.equal(shedWidth(' 60rem '), '60rem');
    for (const step of [1, 2, 3, '1', '2', '3']) assert.equal(shedWidth(step), null, `step ${step}`);
    for (const bad of [undefined, null, '', 'wide', '60em', '-5', 'calc(1px)', '5rem;}', 0]) assert.equal(shedWidth(bad), null, String(bad));
});

test('shedCss writes one container rule per distinct width, attribute-matched on the raw value, and nothing for the steps or junk', () => {
    const cols = [{ key: 'a' }, { key: 'b', shed: 2 }, { key: 'c', shed: '60rem' }, { key: 'd', shed: 72 }, { key: 'e', shed: '60rem' }, { key: 'f', shed: 'x"] {' }];
    assert.equal(shedCss(cols), '@container (max-width:60rem){[data-shed="60rem"]{display:none}}@container (max-width:72rem){[data-shed="72"]{display:none}}');
    assert.equal(shedCss([{ key: 'a', shed: 1 }]), '');
    assert.equal(needsWidth({ shed: 'x"] {' }), false); assert.equal(needsWidth({ shed: 50 }), true);
});
