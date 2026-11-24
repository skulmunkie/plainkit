// The custom SDK ruler (#124 step 5): breakpoints of your own, device presets, the responsive utility stylesheet, the settings round trip, and the
// "found the expected number of times" check on every rewrite of the shipped source.
import './needs-bootstrap.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DEVICE_PRESETS, validateExtras, addExtra, renameExtra, removeExtra, rulerMarks, responsiveCss, expectCount, queryCount, propertyCount, customizeDist, buildBundle, settingsText, readSettings } from '../js/custom-sdk-logic.js';

const dist = fileURLToPath(new URL('../dist/', import.meta.url));
const dec = new TextDecoder(); const enc = new TextEncoder();
const manifest = JSON.parse(fs.readFileSync(dist + 'manifest.json', 'utf8'));
const load = () => new Map([['manifest.json', new Uint8Array(fs.readFileSync(dist + 'manifest.json'))], ...manifest.files.map(f => [f.path, new Uint8Array(fs.readFileSync(dist + f.path))])]);
const BASE = { phone: 640, tablet: 1024, wide: 1280 };
const NAMES = Object.keys(BASE);
const RANGE_MIN = 320;

test('every device preset is a valid breakpoint beside the shipped three', () => {
    const v = validateExtras(DEVICE_PRESETS.map(p => ({ name: p.name, width: p.width })), BASE);
    assert.deepEqual(v.problems, []);
    assert.equal(v.extras.length, DEVICE_PRESETS.length);
    assert.deepEqual(v.extras.map(e => e.width), [...v.extras.map(e => e.width)].sort((a, b) => a - b), 'sorted by width');
});

test('validation: names, uniqueness, whole numbers, range and the gap to every other breakpoint', () => {
    const bad = (rows, re) => { const v = validateExtras(rows, BASE); assert.equal(v.ok, false); assert.match(v.problems.map(p => p.message).join(' | '), re); };
    bad([{ name: 'Big', width: 1500 }], /not a valid name/);
    bad([{ name: 'big-one', width: 1500 }], /not a valid name/);
    bad([{ name: 'phone', width: 1500 }], /already a breakpoint/);
    bad([{ name: 'a', width: 1500 }, { name: 'a', width: 1700 }], /already a breakpoint/);
    bad([{ name: 'a', width: '' }], /whole number/);
    bad([{ name: 'a', width: 1500.5 }], /whole number/);
    bad([{ name: 'a', width: RANGE_MIN - 1 }], /between/);
    bad([{ name: 'a', width: 660 }], /at least 64 px from the breakpoint at 640/);
    bad([{ name: 'a', width: 1500 }, { name: 'b', width: 1520 }], /at least 64 px from the breakpoint at 1500/);
    const good = validateExtras([{ name: 'laptop', width: '1366' }, { name: 'bad name', width: 1700 }], BASE);
    assert.deepEqual(good.extras, [{ name: 'laptop', width: 1366 }], 'a valid entry is kept beside an invalid one');
    assert.equal(good.ok, false);
    assert.equal(validateExtras([], BASE).ok, true);
});

test('add, rename and remove never change their argument; a duplicate is an error', () => {
    const list = [{ name: 'laptop', width: 1366 }];
    const added = addExtra(list, DEVICE_PRESETS[1]);
    assert.equal(list.length, 1); assert.equal(added.list.length, 2);
    assert.match(addExtra(added.list, DEVICE_PRESETS[1]).error, /already/);
    assert.deepEqual(renameExtra(added.list, 'slate', 'portrait').list.map(e => e.name), ['laptop', 'portrait']);
    assert.match(renameExtra(added.list, 'slate', 'laptop').error, /already/);
    assert.deepEqual(removeExtra(added.list, 'laptop').list, [{ name: 'slate', width: 768 }]);
});

test('the ruler lists every breakpoint, narrowest first', () => {
    const marks = rulerMarks(BASE, [{ name: 'slate', width: 768 }]);
    assert.deepEqual(marks.map(m => `${m.name}${m.own ? '*' : ''}`), ['phone', 'slate*', 'tablet', 'wide']);
});

test(`responsiveCss: two rules per breakpoint in the page layer's own form; none for no breakpoints; a bad entry throws`, () => {
    assert.equal(responsiveCss([]), '');
    const css = responsiveCss([{ name: 'laptop', width: 1366 }, { name: 'slate', width: 768 }]);
    assert.match(css, /@media \(max-width: 1366px\) \{ \[data-show-above="laptop"\] \{ display: none !important; \} \}/);
    assert.match(css, /@media \(min-width: 1367px\) \{ \[data-hide-above="laptop"\] \{ display: none !important; \} \}/);
    assert.equal((css.match(/@media/g) ?? []).length, 4);
    assert.throws(() => responsiveCss([{ name: 'x"]{}', width: 900 }]), /not a valid breakpoint/);
    assert.throws(() => responsiveCss([{ name: 'ok', width: 900.5 }]), /not a valid breakpoint/);
});

test('expectCount names what it found and what it expected', () => {
    expectCount('x', 2, 2);
    assert.throws(() => expectCount('plainkit.css: the phone breakpoint', 0, 3), /plainkit\.css: the phone breakpoint: found 0 times, expected 3/);
    assert.throws(() => expectCount('y', 1, 2), /found 1 time, expected 2/);
});

test('the counters read the shipped files the way the rewrite does', () => {
    const css = dec.decode(load().get('plainkit.min.css'));
    assert.equal(propertyCount(css, 'phone'), 1);
    assert.ok(queryCount(css, 640) > 0);
    assert.equal(queryCount('@media (max-width: 640px){} @media(min-width:641px){} (max-width: 641px)', 640), 2);
});

test('a rewrite that does not find its target the expected number of times fails loudly', async () => {
    const tamper = (path, fn) => { const files = load(); files.set(path, enc.encode(fn(dec.decode(files.get(path))))); return files; };
    const inc = { theme: false, breakpoints: true };
    // a query outside any @media condition would be left behind: the queries in the text outnumber the ones the rewrite found
    const stray = tamper('plainkit.min.css', t => `${t}\na{content:"(max-width: 640px)"}`);
    await assert.rejects(customizeDist(stray, { include: inc, breakpoints: { phone: 700 } }), /plainkit\.min\.css: the phone breakpoint \(640px\) in media conditions: found \d+ times?, expected \d+/);
    // the property block missing from the page layer, or declared twice
    const noBlock = tamper('plainkit.min.css', t => t.replace(/--pk-bp-wide:\d+px;?/, ''));
    noBlock.set('plainkit.css', load().get('plainkit.min.css')); // the page layer the widths are read from still has the block
    await assert.rejects(customizeDist(noBlock, { include: inc, breakpoints: { wide: 1400 } }), /--pk-bp-wide property: found 0 times, expected 1/);
    const twice = tamper('plainkit.min.css', t => `${t}:root{--pk-bp-wide:1280px}`);
    await assert.rejects(customizeDist(twice, { include: inc, breakpoints: { wide: 1400 } }), /--pk-bp-wide property: found 2 times, expected 1/);
    // the shipped dist passes
    await customizeDist(load(), { include: inc, breakpoints: { phone: 700 } });
});

test('a bundle with breakpoints of your own carries the stylesheet, the settings and the README', async () => {
    const extras = [{ name: 'slate', width: 768 }, { name: 'laptop', width: 1366 }];
    const { files } = await buildBundle(load(), { include: { theme: false, breakpoints: true }, breakpoints: BASE, extras });
    assert.match(dec.decode(files.get('plainkit-breakpoints.css')), /data-show-above="slate"/);
    const settings = JSON.parse(dec.decode(files.get('plainkit.custom.json')));
    assert.deepEqual(settings.ownBreakpoints, extras);
    assert.match(dec.decode(files.get('README.md')), /Breakpoints of your own: slate 768px, laptop 1366px/);
    const plain = await buildBundle(load(), { include: { theme: false, breakpoints: true }, breakpoints: BASE });
    assert.equal(plain.files.has('plainkit-breakpoints.css'), false, 'none of your own, no stylesheet');
    assert.equal(JSON.parse(dec.decode(plain.files.get('plainkit.custom.json'))).ownBreakpoints, undefined);
    // an invalid set never reaches a file, and the set is checked against the widths this export uses
    await assert.rejects(buildBundle(load(), { include: { theme: false, breakpoints: true }, breakpoints: BASE, extras: [{ name: 'phone', width: 900 }] }), /not valid/);
    await assert.rejects(buildBundle(load(), { include: { theme: false, breakpoints: true }, breakpoints: { phone: 740 }, extras }), /at least 64 px from the breakpoint at 740/);
    // breakpoints not ticked: not carried
    const off = await buildBundle(load(), { include: { theme: false, breakpoints: false }, extras });
    assert.equal(off.files.has('plainkit-breakpoints.css'), false);
});

test('the settings round trip keeps the breakpoints of your own and refuses a hostile list', () => {
    const extras = [{ name: 'slate', width: 768 }];
    const text = settingsText({ version: '1.0.0', include: { theme: false, breakpoints: true }, breakpoints: BASE, extras });
    assert.deepEqual(readSettings(text, NAMES).settings.extras, extras);
    assert.equal(readSettings(settingsText({ version: '1.0.0', include: { theme: false, breakpoints: true }, breakpoints: BASE }), NAMES).settings.extras, undefined);
    const hostile = JSON.stringify({ ...JSON.parse(text), ownBreakpoints: [{ name: '"]{}', width: 900 }] });
    assert.match(readSettings(hostile, NAMES).error, /breakpoints of your own in the file are not valid/);
});
