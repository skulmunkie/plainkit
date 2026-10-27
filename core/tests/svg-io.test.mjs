// SVG toolkit phase S5 part a (#431): toSvg writes a model as deterministic, escaped SVG text. Pure, no DOM.
import test from 'node:test';
import assert from 'node:assert/strict';
import { toSvg } from '../js/svg/io.js';
import { createSvgDoc } from '../js/svg/model.js';
import { insert } from '../js/svg/ops.js';
import { NODES, NODE_TYPES } from '../js/svg/allow.js';

const JS = 'java' + 'script:';
const add = (doc, spec) => insert(doc, spec).doc;
const sample = () => {
    let d = createSvgDoc({ width: 200, height: 100, units: 'mm', title: 'Sign', desc: 'A sign' });
    d = add(d, { type: 'rect', attrs: { x: 1.23456, y: 2, width: 40, height: 20, fill: '#c00', transform: [1, 0, 0, 1, 5, 5] } });
    d = add(d, { type: 'path', attrs: { d: [['M', 0, 0], ['L', 10.5, 0], ['Z']], stroke: 'black' } });
    return d;
};

test('toSvg is deterministic and starts with the svg root', () => {
    const d = sample();
    assert.equal(toSvg(d), toSvg(d));
    assert.match(toSvg(d), /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 200 100" width="200mm" height="100mm" role="img">/);
    assert.ok(toSvg(d).includes('<title>Sign</title>') && toSvg(d).includes('<desc>A sign</desc>'));
});

test('units in width and height, in and mm', () => {
    assert.ok(toSvg(createSvgDoc({ width: 3, height: 2, units: 'in' })).includes('width="3in" height="2in"'));
    assert.ok(toSvg(createSvgDoc({ width: 3, height: 2 })).includes('width="3px"'));
});

test('precision rounds numbers and trims zeros; the identity transform is omitted', () => {
    const d = sample();
    assert.ok(toSvg(d, { precision: 2 }).includes('x="1.23"'));
    assert.ok(toSvg(d, { precision: 0 }).includes('x="1"'));
    assert.ok(toSvg(d).includes('transform="matrix(1 0 0 1 5 5)"'));
    const id = add(createSvgDoc(), { type: 'rect', attrs: { x: 1, y: 1, width: 2, height: 2, transform: [1, 0, 0, 1, 0, 0] } });
    assert.ok(!toSvg(id).includes('transform'));
});

test('compact output has no line breaks', () => assert.ok(!toSvg(sample(), { compact: true }).includes('\n')));

test('an empty document is a valid empty svg', () => assert.match(toSvg(createSvgDoc()), /<g id="s1"\/>\n<\/svg>$/));

test('hostile text and labels are escaped and never become markup or handlers', () => {
    const evil = `"><script>alert(1)</script> onload=x ${JS}alert(1) style=x`;
    let d = createSvgDoc({ title: evil, desc: evil });
    d = add(d, { type: 'text', text: evil, attrs: { x: 1, y: 1, 'aria-label': 'a b' } });
    const out = toSvg(d, { title: evil });
    for (const bad of ['<script', '"><', '<foreignObject']) assert.ok(!out.includes(bad), bad);
    assert.ok(out.includes('&lt;script&gt;') && out.includes('&quot;&gt;'));
    assert.ok(!/<[^>]*sonw+=/.test(out), 'no handler attribute');
    assert.ok(!/<[^>]*\sstyle=/.test(out), 'no style attribute');
});

test('a document with every node type writes every type', () => {
    let d = createSvgDoc();
    const specs = { rect: { width: 1, height: 1 }, ellipse: { rx: 1, ry: 1 }, line: { x1: 0, y1: 0, x2: 1, y2: 1 }, polyline: { points: [0, 0, 1, 1] }, polygon: { points: [0, 0, 1, 1, 0, 1] }, path: { d: [['M', 0, 0], ['L', 1, 1]] }, text: {}, g: {} };
    for (const t of NODE_TYPES) d = add(d, { type: t, attrs: specs[t], ...(t === 'text' ? { text: 'hi' } : {}) });
    const out = toSvg(d);
    for (const t of NODE_TYPES) assert.ok(out.includes(`<${t} `), t);
    assert.ok(out.includes('points="0,0 1,1"'));
    assert.ok(Object.keys(NODES).length === NODE_TYPES.length);
});
