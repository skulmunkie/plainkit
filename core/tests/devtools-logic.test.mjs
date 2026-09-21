// The pure logic behind the performance monitor and the dev console.
import test from 'node:test';
import assert from 'node:assert/strict';
import { rate, rateFps, fpsFrom, pushSample, clsFrom, inpFrom, longTaskStats, summarizeResources, formatBytes, formatMs, shortName, sparkPoints } from '../js/perf-logic.js';
import { formatArg, formatArgs, describeElement, makeEntry, pushEntry, filterEntries, countByLevel, exportEntries, elementInventory } from '../js/console-logic.js';

test('ratings follow the Core Web Vitals thresholds and stay empty without a value', () => {
    assert.equal(rate('lcp', 2500), 'good');
    assert.equal(rate('lcp', 2501), 'warn');
    assert.equal(rate('lcp', 4001), 'poor');
    assert.equal(rate('cls', 0.05), 'good');
    assert.equal(rate('inp', 350), 'warn');
    assert.equal(rate('lcp', null), '');
    assert.equal(rate('nope', 1), '');
    assert.equal(rateFps(60), 'good');
    assert.equal(rateFps(40), 'warn');
    assert.equal(rateFps(12), 'poor');
});

test('frame rate is frames per second inside the window, and null until there are two frames', () => {
    assert.equal(fpsFrom([]), null);
    assert.equal(fpsFrom([100]), null);
    const sixty = Array.from({ length: 61 }, (_, i) => i * (1000 / 60));
    assert.equal(fpsFrom(sixty), 60);
    assert.equal(fpsFrom([0, 500, 1000, 5000, 5100], 5100), 10, 'frames older than a second are ignored');
});

test('a rolling series keeps only the newest samples and never mutates', () => {
    const a = [1, 2, 3];
    assert.deepEqual(pushSample(a, 4, 3), [2, 3, 4]);
    assert.deepEqual(a, [1, 2, 3]);
});

test('layout shift is the worst session, ignores shifts after input, and starts a new session after a gap', () => {
    assert.equal(clsFrom([]), 0);
    const shifts = [
        { startTime: 0, value: 0.05 }, { startTime: 500, value: 0.05 }, // one session: 0.10
        { startTime: 900, value: 0.5, hadRecentInput: true }, // ignored
        { startTime: 3000, value: 0.04 }, // a new session
    ];
    assert.ok(Math.abs(clsFrom(shifts) - 0.1) < 1e-9);
});

test('interaction to next paint is the slowest interaction, counting each interaction once', () => {
    assert.equal(inpFrom([]), null);
    assert.equal(inpFrom([{ interactionId: 0, duration: 999 }]), null, 'entries without an interaction id are not interactions');
    assert.equal(inpFrom([{ interactionId: 1, duration: 80 }, { interactionId: 1, duration: 120 }, { interactionId: 2, duration: 96 }]), 120);
});

test('long tasks report a count, the time beyond the 50 ms budget and the worst', () => {
    assert.deepEqual(longTaskStats([]), { count: 0, blocking: 0, worst: 0 });
    assert.deepEqual(longTaskStats([{ duration: 120 }, { duration: 60 }]), { count: 2, blocking: 80, worst: 120 });
});

test('resources are grouped by kind with totals and the slowest first', () => {
    const r = summarizeResources([
        { name: 'http://x/a.js', duration: 40, transferSize: 1000, initiatorType: 'script' },
        { name: 'http://x/b.css', duration: 90, transferSize: 500, initiatorType: 'link' },
        { name: 'http://x/c.png', duration: 10, transferSize: 0, initiatorType: 'img' },
    ], 2);
    assert.equal(r.count, 3);
    assert.equal(r.bytes, 1500);
    assert.deepEqual(r.byType.script, { count: 1, bytes: 1000 });
    assert.deepEqual(r.byType.style, { count: 1, bytes: 500 });
    assert.deepEqual(r.slowest.map(x => x.name), ['http://x/b.css', 'http://x/a.js']);
});

test('numbers format for people', () => {
    assert.equal(formatBytes(512), '512 B');
    assert.equal(formatBytes(2048), '2.0 KB');
    assert.equal(formatBytes(5 * 1048576), '5.0 MB');
    assert.equal(formatBytes(null), '-');
    assert.equal(formatMs(250), '250 ms');
    assert.equal(formatMs(2500), '2.50 s');
    assert.equal(shortName('http://x/dist/plainkit.css?v=1'), 'plainkit.css');
    assert.equal(shortName('not a url'), 'not a url');
});

test('sparkline points scale into the box, oldest at the left, and need two values', () => {
    assert.equal(sparkPoints([5]), '');
    assert.equal(sparkPoints([0, 10], 100, 20), '0.0,20.0 100.0,0.0');
    assert.equal(sparkPoints([0, 50], 100, 20, 100), '0.0,20.0 100.0,10.0');
});

test('console arguments become readable text: cycles, depth, errors and format strings', () => {
    assert.equal(formatArg('hi'), 'hi');
    assert.equal(formatArg(null), 'null');
    assert.equal(formatArg(new TypeError('bad')), 'TypeError: bad');
    assert.equal(formatArg({ a: 1, b: [1, 2] }), '{a: 1, b: [1, 2]}');
    const loop = { name: 'x' }; loop.self = loop;
    assert.equal(formatArg(loop), '{name: x, self: [circular]}');
    assert.equal(formatArg({ a: { b: { c: { d: 1 } } } }, 1), '{a: {b: [object]}}');
    assert.equal(formatArg(function named() {}), '[function named]');
    assert.equal(formatArgs(['%s has %d items', 'cart', 3.9, 'extra']), 'cart has 3 items extra');
    assert.equal(formatArgs(['100%', 5]), '100% 5', 'a lone percent sign is not a format');
    assert.equal(formatArgs([]), '');
});

test('an element is described by tag, id, classes and short text', () => {
    assert.deepEqual(describeElement({ localName: 'pk-alert', id: 'a1', className: 'x  y', textContent: '  Hello\n world ' }), { tag: 'pk-alert', id: 'a1', classes: ['x', 'y'], text: 'Hello world' });
});

test('the entry list is capped, filtered by level, text and source, and counted', () => {
    let list = [];
    for (let i = 0; i < 5; i++) list = pushEntry(list, makeEntry(i === 3 ? 'error' : 'log', `line ${i}`, { at: i }), 4);
    assert.deepEqual(list.map(e => e.text), ['line 1', 'line 2', 'line 3', 'line 4']);
    assert.deepEqual(filterEntries(list, { minLevel: 'warn' }).map(e => e.text), ['line 3']);
    assert.deepEqual(filterEntries(list, { text: ' LINE 2 ' }).map(e => e.text), ['line 2']);
    assert.deepEqual(filterEntries([makeEntry('log', 'a', { source: 'event' }), makeEntry('log', 'b')], { sources: ['event'] }).map(e => e.text), ['a']);
    assert.equal(countByLevel(list).error, 1);
    assert.equal(makeEntry('nonsense', 'x').level, 'log');
    assert.equal(JSON.parse(exportEntries([makeEntry('log', 'x', { at: 0 })]))[0].at, '1970-01-01T00:00:00.000Z');
});

test('the element inventory counts only pk-* tags and says which are registered', () => {
    const inv = elementInventory(['div', 'pk-tabs', 'pk-alert', 'pk-tabs'], t => t === 'pk-tabs');
    assert.deepEqual(inv, [{ tag: 'pk-alert', count: 1, defined: false }, { tag: 'pk-tabs', count: 2, defined: true }]);
});

test('the dock hotkey matches a chord exactly: the key and only the modifiers named', async () => {
    const { matchesHotkey, SIZES } = await import('../modules/devtools/devtools.js');
    assert.ok(matchesHotkey({ key: '`', ctrlKey: true }, 'Ctrl+`'));
    assert.ok(matchesHotkey({ key: '`', metaKey: true }, 'Ctrl+`'), 'Cmd counts as Ctrl');
    assert.ok(matchesHotkey({ key: 'D', ctrlKey: true, shiftKey: true }, 'Ctrl+Shift+D'));
    assert.ok(!matchesHotkey({ key: '`' }, 'Ctrl+`'), 'the modifier is required');
    assert.ok(!matchesHotkey({ key: '`', ctrlKey: true, shiftKey: true }, 'Ctrl+`'), 'an extra modifier is not a match');
    assert.ok(!matchesHotkey({ key: '`', ctrlKey: true }, ''), 'an empty chord turns the hotkey off');
    assert.deepEqual(Object.keys(SIZES), ['small', 'medium', 'large']);
});

test('the page score counts each distinct finding once and never goes below zero', async () => {
    const { pageScore, scoreTone, findingRows, describeForInspector } = await import('../js/inspect-logic.js');
    assert.equal(pageScore([]), 100);
    assert.equal(pageScore([{ check: 'a', selector: 'x', severity: 'error' }, { check: 'a', selector: 'x', severity: 'error' }, { check: 'b', selector: 'y', severity: 'warn' }]), 100 - 25 - 8);
    assert.equal(pageScore(Array.from({ length: 9 }, (_, i) => ({ check: 'c', selector: String(i), severity: 'error' }))), 0);
    assert.deepEqual([90, 60, 20].map(scoreTone), ['positive', 'warning', 'critical']);
});

test('findings become rows: errors first, repeated ones counted', async () => {
    const { findingRows } = await import('../js/inspect-logic.js');
    const rows = findingRows([
        { check: 'touch-target', severity: 'warn', selector: 'b', message: 'm' }, { check: 'image-alt', severity: 'error', selector: 'i', message: 'm' }, { check: 'touch-target', severity: 'warn', selector: 'b', message: 'm' },
    ]);
    assert.deepEqual(rows.map(r => [r.check, r.count]), [['image-alt', 1], ['touch-target', 2]]);
    assert.deepEqual(rows.map(r => r.id), [0, 1]);
});

test('the inspector describes an element by its setup attributes and size', async () => {
    const { describeForInspector } = await import('../js/inspect-logic.js');
    const el = { localName: 'pk-alert', id: 'a1', attributes: [{ name: 'kind', value: 'info' }, { name: 'dismissible', value: '' }, { name: 'class', value: 'x' }, { name: 'slot', value: 's' }], getBoundingClientRect: () => ({ width: 120.4, height: 40 }) };
    assert.deepEqual(describeForInspector(el), { tag: 'pk-alert', domId: 'a1', props: 'kind=info dismissible', size: '120 x 40', visible: true });
    assert.equal(describeForInspector({ ...el, getBoundingClientRect: () => ({ width: 0, height: 0 }) }).visible, false);
});
