// The scorecard module's pure parts: target shapes, the checks filter, the ranked table, and a run against frames the browser cannot read.
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTargets, keepChecks, rankedTable, tone, fmtDelta, runTargets, mountScorecard, customTags, whenDefined } from '../modules/scorecard/scorecard.js';

test('targets are normalized from every accepted shape; ones with nothing to render are dropped', () => {
    const t = normalizeTargets(['/a.html', { name: 'Card', html: '<p>x</p>' }, { name: 'Doc', srcdoc: '<p>' }, { name: 'Both', samples: ['/x', { html: '' }] }, {}, null, { name: 'Empty' }]);
    assert.deepEqual(t.map(x => [x.id, x.name, x.frames.length]), [['a-html', '/a.html', 1], ['card', 'Card', 1], ['doc', 'Doc', 1], ['both', 'Both', 2]]);
    assert.deepEqual(t[0].frames, [{ url: '/a.html' }]);
    assert.deepEqual(normalizeTargets(undefined), []);
});

test('keepChecks keeps findings whose check or category is listed, and everything when nothing is', () => {
    const f = [{ check: 'touch-target', category: 'look' }, { check: 'unnamed-input', category: 'accessibility' }, { check: 'zero-gap', category: 'look' }];
    assert.equal(keepChecks(f, undefined).length, 3);
    assert.equal(keepChecks(f, []).length, 3);
    assert.deepEqual(keepChecks(f, ['accessibility']).map(x => x.check), ['unnamed-input']);
    assert.deepEqual(keepChecks(f, ['touch-target', 'zero-gap']).map(x => x.check), ['touch-target', 'zero-gap']);
});

// A recording document: nodes keep their tag, attributes and children, so the module's DOM building can be read back without a browser.
const recorder = () => {
    const make = tag => ({ tag, attrs: {}, kids: [], setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return this.attrs[k] ?? null; }, append(...k) { this.kids.push(...k); }, textContent: '' });
    return { createElement: make };
};
const textOf = n => (typeof n === 'string' ? n : [n.textContent, ...(n.kids ?? []).map(textOf)].join(''));
const findAll = (n, pred, out = []) => { if (n && typeof n === 'object') { if (pred(n)) out.push(n); for (const k of n.kids ?? []) findAll(k, pred, out); } return out; };

test('tone and change formatting follow the score bands', () => {
    const doc = recorder();
    assert.deepEqual([90, 60, 10, null].map(tone), ['positive', 'warning', 'critical', '']);
    const [up, down, zero] = [5, -3, 0].map(d => fmtDelta(doc, d));
    assert.deepEqual([up, down, zero].map(n => [n.attrs.tone, textOf(n)]), [['positive', '+5'], ['critical', '-3'], ['muted', '±0']]);
    assert.equal(fmtDelta(doc, null), null);
});

test('the ranked table lists the worst first, sets names, links and finding text as text and attributes, and shows the change', () => {
    const items = [
        { id: 'a', name: 'Good <b>', kind: '', score: 100, findings: [] },
        { id: 'b', name: 'Bad', kind: 'Page', score: 42, findings: [{ check: 'touch-target', severity: 'warn', selector: 'a > b', message: 'm "q"', contexts: ['dark 375px'], count: 2 }] },
    ];
    const table = rankedTable(recorder(), items, { changes: [{ name: 'Bad', delta: -8 }], link: i => `#${i.id}"x` });
    assert.deepEqual(JSON.parse(table.attrs.rows).map(r => r.name), ['Bad', 'Good <b>'], 'worst first, the name kept as data');
    assert.equal(table.attrs.label, 'Target ranking');
    const slot = (id, key) => table.kids.find(k => k.attrs.slot === `cell-${id}-${key}`);
    assert.equal(findAll(slot('b', 'name'), n => n.tag === 'a')[0].attrs.href, '#b"x', 'the link target is an attribute value, never markup');
    assert.equal(textOf(slot('a', 'name')), 'Good <b>', 'the name is text, so no element is made from it');
    const badge = findAll(slot('b', 'failing'), n => n.tag === 'pk-badge')[0];
    assert.equal(textOf(badge), 'touch-target x2'); assert.equal(badge.attrs.title, 'a > b: m "q" (dark 375px)');
    assert.equal(textOf(slot('b', 'change')), '-8');
    assert.equal(textOf(slot('a', 'failing')), 'none');
    assert.equal(findAll(slot('b', 'score'), n => n.tag === 'pk-text')[0].attrs.tone, 'critical');
});

// A frame the module cannot read (another origin): it must score as an unreadable page, not crash the run.
const unreadableHost = () => {
    const iframe = () => ({ style: { setProperty() {}, removeProperty() {} }, dataset: {}, querySelectorAll: () => [], contentDocument: null, addEventListener: (t, fn) => queueMicrotask(fn), remove() {} });
    return { ownerDocument: { createElement: iframe }, append() {} };
};

test('runTargets scores an unreadable page as one error per frame group and honours the checks filter', async () => {
    const opts = { host: unreadableHost(), themes: ['dark'], widths: [375, 1024], concurrency: 2 };
    const [r] = await runTargets(['/elsewhere'], opts);
    assert.equal(r.findings.length, 1, 'repeats across widths collapse into one row');
    assert.equal(r.findings[0].count, 2);
    assert.equal(r.score, 75);
    const [none] = await runTargets(['/elsewhere'], { ...opts, checks: ['accessibility'] });
    assert.deepEqual([none.findings.length, none.score], [0, 100]);
});

test('mountScorecard refuses to start without a target to score', async () => {
    await assert.rejects(mountScorecard({}, { targets: [] }), /needs targets/);
    await assert.rejects(mountScorecard({}, {}), /needs targets/);
});

test('sections are validated; the run sections need targets and the others do not', async () => {
    await assert.rejects(mountScorecard({}, { targets: ['/a'], sections: ['ranked', 'nope'] }), /unknown section "nope"/);
    await assert.rejects(mountScorecard({}, { sections: ['performance'] }), /needs targets/);
    await assert.rejects(mountScorecard({}, { sections: ['security'] }), error => !/needs targets/.test(error.message), 'a data-only section asks for no targets');
});

// Elements load on demand after the frame's load event, and an element with no text has no size until it is defined: a run that measures at
// once reads it as an empty preview (seen in a headless run, where eight frames load at a time). The frame waits for its own tags first.
const fakeFrame = (localNames, defined) => ({
    contentDocument: { querySelectorAll: () => localNames.map(localName => ({ localName })) },
    contentWindow: { customElements: { whenDefined: tag => (defined.has(tag) ? Promise.resolve() : new Promise(() => {})) } },
});

test('customTags lists each custom element name once and ignores plain tags', () => {
    assert.deepEqual(customTags(fakeFrame(['div', 'pk-avatar', 'pk-avatar', 'pk-progress', 'span'], new Set()).contentDocument), ['pk-avatar', 'pk-progress']);
    assert.deepEqual(customTags(null), []);
});

test('customTags reads open shadow roots too (a page type keeps its own children there)', () => {
    const inner = { localName: 'pk-list-page' };
    const host = { localName: 'pk-master-detail-page', shadowRoot: { querySelectorAll: () => [{ localName: 'div' }, inner] } };
    assert.deepEqual(customTags({ querySelectorAll: () => [host] }), ['pk-master-detail-page', 'pk-list-page']);
});

test('whenDefined waits for every custom element, gives up after the limit, and is immediate with none or with no window', async () => {
    const t0 = Date.now();
    await whenDefined(fakeFrame(['pk-avatar', 'pk-progress'], new Set(['pk-avatar', 'pk-progress'])), 5000);
    assert.ok(Date.now() - t0 < 1000, 'all defined: resolves at once');
    const t1 = Date.now();
    await whenDefined(fakeFrame(['pk-avatar', 'pk-never'], new Set(['pk-avatar'])), 60);
    assert.ok(Date.now() - t1 >= 50 && Date.now() - t1 < 1000, 'an undefined tag waits only for the limit');
    await whenDefined(fakeFrame(['div'], new Set()), 5000);
    await whenDefined({ contentDocument: null, contentWindow: null }, 5000);
});

test('whenDefined also waits for elements a defined element adds later (a page type building its own children)', async () => {
    const names = ['pk-page'];
    const defined = new Set(['pk-page']);
    const waiters = [];
    const frame = {
        contentDocument: { querySelectorAll: () => names.map(localName => ({ localName })) },
        contentWindow: {
            requestAnimationFrame: cb => setTimeout(cb, 0),
            customElements: { whenDefined: tag => (defined.has(tag) ? Promise.resolve() : new Promise(r => waiters.push([tag, r]))) },
        },
    };
    const done = whenDefined(frame, 2000).then(() => 'done');
    names.push('pk-child'); // appears after the first pass began
    const early = await Promise.race([done, new Promise(r => setTimeout(() => r('waiting'), 80))]);
    assert.equal(early, 'waiting', 'the late tag holds the frame back');
    defined.add('pk-child'); waiters.forEach(([, r]) => r());
    assert.equal(await done, 'done');
});
