import test from 'node:test';
import assert from 'node:assert/strict';
import { changedFromFiles, dependentsFromIndex, metaRenders, parseArgs, selectElements, shardOf, shotName, groupFindings } from '../ui-review.mjs';
import { auditFacts, contrastRatio, summarize } from '../../core/tests/review/audit.js';

const known = new Set(['page-header', 'breadcrumb']);
const box = (over = {}) => ({ id: 1, parent: 0, path: 'a', rect: [0, 0, 100, 50], inFlow: true, clipX: false, clipY: false, interactive: false, inlineLink: false, name: '', textColor: null, bg: null, fontSize: 16, bold: false, media: false, inLink: false, pseudo: [], hiddenVisually: false, ...over });
const facts = (boxes, over = {}) => ({ viewport: { width: 1280 }, docScrollWidth: 1280, exampleWidth: 600, boxes, ...over });
const rules = f => auditFacts(f).map(x => x.rule);
const phone = { viewport: { width: 375 }, docScrollWidth: 375, exampleWidth: 300 };

test('changed elements come from element folders and Blazor mappings, and a base file means every element', () => {
    assert.deepEqual(changedFromFiles(['core/elements/page-header/page-header.css', 'blazor/mappings/breadcrumb.json', 'README.md'], known), { names: ['breadcrumb', 'page-header'], base: false });
    assert.deepEqual(changedFromFiles(['core/elements/not-an-element/x.css'], known).names, []);
    assert.equal(changedFromFiles(['core/tokens/tokens.css'], known).base, true);
    assert.deepEqual(changedFromFiles(['core\\elements\\breadcrumb\\breadcrumb.css'], known).names, ['breadcrumb']);
});

test('a meta.json edit to a non-rendering field (tier, group) selects no element; a rendering field does', () => {
    const meta = over => JSON.stringify({ tag: 'pk-x', tier: 'element', group: 'Actions', examples: [{ html: '<pk-x></pk-x>' }], ...over });
    assert.equal(metaRenders(meta(), meta({ tier: 'page', group: 'Layout' })), false);
    assert.equal(metaRenders(meta(), meta({ examples: [{ html: '<pk-x big></pk-x>' }] })), true);
    assert.equal(metaRenders(null, meta()), true, 'a new file renders');
    assert.equal(metaRenders(meta(), '{ not json'), true, 'unparseable is treated as changed');
    const ignore = f => f.endsWith('.meta.json');
    assert.deepEqual(changedFromFiles(['core/elements/breadcrumb/breadcrumb.meta.json'], known, ignore).names, []);
    assert.deepEqual(changedFromFiles(['core/elements/breadcrumb/breadcrumb.meta.json', 'blazor/mappings/breadcrumb.json'], known, ignore).names, ['breadcrumb']);
});

test('a changed element selects its dependents, transitively, and only them', () => {
    // split-button composes button; toolbar's gallery example composes split-button.
    const dependents = dependentsFromIndex({ button: { files: { elements: ['core/elements/split-button/split-button.html'], gallery: [] } }, 'split-button': { files: { elements: [], gallery: ['core/elements/toolbar/toolbar.meta.json'] } }, toolbar: { files: { elements: [], gallery: [] } }, card: { files: { elements: [], gallery: [] } } });
    const knownAll = new Set(['button', 'split-button', 'toolbar', 'card']);
    assert.deepEqual(selectElements(['button'], dependents, knownAll), { button: 'changed', 'split-button': 'dependent of pk-button', toolbar: 'dependent of pk-split-button' });
    assert.deepEqual(selectElements(['card'], dependents, knownAll), { card: 'changed' });
    assert.deepEqual(selectElements([], dependents, knownAll, true), { button: 'base', 'split-button': 'base', toolbar: 'base', card: 'base' });
    assert.deepEqual(dependentsFromIndex({ self: { files: { elements: ['core/elements/self/self.js'], gallery: [] } } }).self, [], 'an element is not its own dependent');
});

test('arguments: names or tags, --all excludes --elements, unknown flags are refused', () => {
    assert.deepEqual(parseArgs(['--elements', 'pk-page-header,breadcrumb']).elements, ['page-header', 'breadcrumb']);
    assert.equal(parseArgs(['--all', '--strict']).strict, true);
    assert.throws(() => parseArgs(['--all', '--elements', 'x']), /either/);
    assert.throws(() => parseArgs(['--nope']), /unknown argument/);
    assert.throws(() => parseArgs(['--out']), /needs a value/);
});

test('shards are disjoint, cover the selection, and 1/1 is the whole run', () => {
    const list = Array.from({ length: 10 }, (_, i) => `e${i}`);
    for (const n of [1, 3, 4, 12]) {
        const parts = Array.from({ length: n }, (_, i) => shardOf(list, i + 1, n));
        assert.deepEqual(parts.flat().sort(), [...list].sort());
        assert.equal(new Set(parts.flat()).size, list.length);
    }
    assert.deepEqual(shardOf(list, 1, 1), list);
    assert.deepEqual(parseArgs(['--shard', '2/4']).shard, { k: 2, n: 4 });
    for (const bad of ['0/4', '5/4', 'a/b', '2']) assert.throws(() => parseArgs(['--shard', bad]), /--shard needs/);
});

test('shot names sort by example and say the combination', () => {
    assert.equal(shotName('pk-page-header', 2, 'phone', 'dark'), 'pk-page-header__03__phone__dark.png');
});

test('contrast ratio follows WCAG (black on white is 21, equal colours 1)', () => {
    assert.ok(Math.abs(contrastRatio([0, 0, 0], [255, 255, 255]) - 21) < 0.01);
    assert.equal(contrastRatio([9, 9, 9], [9, 9, 9]), 1);
});

test('a chevron drawn inside a link is an error unless it is inert and silent (the breadcrumb bug)', () => {
    const link = pseudo => box({ inLink: true, interactive: true, name: 'Stock', pseudo: [{ which: 'after', ...pseudo }] });
    assert.deepEqual(rules(facts([link({ content: '"›"', pointerEvents: 'auto' })])), ['generated-content-in-link']);
    assert.deepEqual(rules(facts([link({ content: '"›" / ""', pointerEvents: 'none' })])), []);
    assert.deepEqual(rules(facts([link({ content: '"›" / ""', pointerEvents: 'auto' })])), ['generated-content-in-link']);
    assert.deepEqual(rules(facts([link({ content: 'none', pointerEvents: 'auto' })])), []);
    assert.deepEqual(rules(facts([box({ pseudo: [{ which: 'after', content: '"›"', pointerEvents: 'auto' }] })])), [], 'outside a link it is decoration');
});

test('overflow, unnamed focusable elements and zero-size media are errors', () => {
    assert.deepEqual(rules(facts([], { docScrollWidth: 1400 })), ['horizontal-overflow']);
    assert.deepEqual(rules(facts([box({ interactive: true, name: '' })])), ['no-accessible-name']);
    assert.deepEqual(rules(facts([box({ media: true, rect: [0, 0, 0, 0] })])), ['zero-size-media']);
    assert.equal(summarize(auditFacts(facts([], { docScrollWidth: 1400 }))).errors, 1);
});

test('tap targets count on the phone only, and inline links are exempt', () => {
    const small = box({ interactive: true, name: 'x', rect: [0, 0, 30, 30] });
    assert.deepEqual(rules(facts([small])), []);
    assert.deepEqual(rules(facts([small], phone)), ['tap-target']);
    assert.deepEqual(rules(facts([{ ...small, inlineLink: true }], phone)), []);
});

test('a standard visually-hidden element (pk-skip-link before focus, a u-sr-only live region) is not a clipped-content or tap-target finding', () => {
    const skipLink = box({ interactive: true, name: 'Skip to content', rect: [0, 0, 1, 1], clipX: true, hiddenVisually: true });
    assert.deepEqual(rules(facts([skipLink], phone)), []);
    const liveRegion = box({ rect: [0, 0, 1, 1], clipY: true, hiddenVisually: true });
    assert.deepEqual(rules(facts([liveRegion])), []);
    // The same shape without the visually-hidden signal (a genuinely broken tiny element) still gets flagged.
    assert.deepEqual(rules(facts([{ ...skipLink, hiddenVisually: false }], phone)), ['clipped-content', 'tap-target']);
    assert.deepEqual(rules(facts([{ ...liveRegion, hiddenVisually: false }])), ['clipped-content']);
});

test('contrast below AA is a warning, large text needs 3:1', () => {
    const text = fontSize => box({ textColor: [140, 140, 140, 1], bg: [255, 255, 255], fontSize });
    assert.deepEqual(rules(facts([text(16)])), ['contrast']);
    assert.deepEqual(rules(facts([text(24)])), []);
});

test('siblings that cross overlap; nesting and out-of-flow boxes do not', () => {
    const a = box({ id: 1, rect: [0, 0, 100, 40] });
    const crossing = box({ id: 2, rect: [50, 10, 100, 40] });
    assert.deepEqual(rules(facts([a, crossing])), ['overlap']);
    assert.deepEqual(rules(facts([a, box({ id: 2, rect: [10, 10, 20, 20] })])), []);
    assert.deepEqual(rules(facts([a, { ...crossing, inFlow: false }])), []);
    assert.deepEqual(rules(facts([a, { ...crossing, parent: 9 }])), []);
    assert.equal(summarize(auditFacts(facts([a, crossing])), { strict: true }).ok, false);
    assert.equal(summarize(auditFacts(facts([a, crossing]))).ok, true, 'a warning alone does not fail');
});

test('findings seen in several combinations are one line', () => {
    const f = { rule: 'overlap', severity: 'warn', path: 'a', message: 'm', fix: 'x' };
    const g = groupFindings(['dark', 'light'].map(theme => ({ tag: 'pk-x', example: 1, title: 't', viewport: 'phone', theme, findings: [f] })));
    assert.equal(g.length, 1);
    assert.deepEqual(g[0].seen, ['phone/dark', 'phone/light']);
});
