// The scorecard module's pure parts: target shapes, the checks filter, the ranked table, and a run against frames the browser cannot read.
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTargets, keepChecks, rankedTable, tone, fmtDelta, runTargets, mountScorecard } from '../modules/scorecard/scorecard.js';

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

test('tone and change formatting follow the score bands', () => {
    assert.deepEqual([90, 60, 10, null].map(tone), ['sc-good', 'sc-warn', 'sc-bad', '']);
    assert.match(fmtDelta(5), /sc-good.*\+5/);
    assert.match(fmtDelta(-3), /sc-bad.*-3/);
    assert.match(fmtDelta(0), /±0/);
    assert.equal(fmtDelta(null), '');
});

test('the ranked table lists the worst first, escapes names, links and finding text, and shows the change', () => {
    const items = [
        { id: 'a', name: 'Good <b>', kind: '', score: 100, findings: [] },
        { id: 'b', name: 'Bad', kind: 'Page', score: 42, findings: [{ check: 'touch-target', severity: 'warn', selector: 'a > b', message: 'm "q"', contexts: ['dark 375px'], count: 2 }] },
    ];
    const html = rankedTable(items, { changes: [{ name: 'Bad', delta: -8 }], link: i => `#${i.id}"x` });
    assert.ok(html.indexOf('Bad') < html.indexOf('Good'));
    assert.ok(html.includes('Good &lt;b&gt;') && !html.includes('<b>'));
    assert.ok(html.includes('href="#b&quot;x"'));
    assert.ok(html.includes('touch-target x2') && html.includes('&quot;q&quot;'));
    assert.match(html, /sc-bad">-8/);
    assert.ok(html.includes('<span class="muted">none</span>'));
});

// A frame the module cannot read (another origin): it must score as an unreadable page, not crash the run.
const unreadableHost = () => {
    const iframe = () => ({ style: {}, contentDocument: null, addEventListener: (t, fn) => queueMicrotask(fn), remove() {} });
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
