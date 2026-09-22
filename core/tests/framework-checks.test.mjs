// The scorecard's framework sections: pure rows for budgets, the API-surface diff, the security and sweep summaries, metrics and history.
import test from 'node:test';
import assert from 'node:assert/strict';
import { band, budgetRows, budgetSummary, apiDiff, securitySummary, sweepSummary, metricRows, historyCategories, historyRows, signed, kb, stripComments, sameOrigin, severityVariant } from '../js/framework-checks.js';
import { measureSizes, gzipBytes } from '../modules/scorecard/measure.js';
import { scoreAll } from '../js/scoring.js';

test('score bands match the ranked table and a missing score has none', () => {
    assert.deepEqual([100, 80, 79, 55, 54, 0, null, undefined].map(band), ['ok', 'ok', 'warn', 'warn', 'danger', 'danger', '', '']);
});

test('budget rows carry headroom and status, worst first, and files no budget names are marked', () => {
    const budgets = { page: { target: 8, limit: 10 }, el: { limit: 4 } };
    const rows = budgetRows(budgets, [
        { name: 'a.css', budget: 'page', gzKb: 9.5, rawKb: 40 },
        { name: 'b.js', budget: 'el', gzKb: 4.5, rawKb: 12 },
        { name: 'c.js', budget: 'el', gzKb: 1, rawKb: 3 },
        { name: 'd.js', budget: 'nothing', gzKb: 1, rawKb: 3 },
        { name: 'e.js', budget: 'el', gzKb: null, rawKb: 3 },
    ]);
    assert.deepEqual(rows.map(r => [r.name, r.status, r.headroom]), [['b.js', 'over', -0.5], ['a.css', 'ok', 0.5], ['c.js', 'ok', 3], ['d.js', 'none', null], ['e.js', 'none', null]]);
    assert.equal(rows[1].target, 8);
    assert.deepEqual(budgetSummary(rows), { total: 5, over: 1, unbudgeted: 2 });
});

test('the API diff lists what the baseline lost and what is new, and works on the baseline alone', () => {
    const baseline = { classes: ['a', 'b'], tokens: ['--x'], exports: ['js/m.js:f'] };
    const current = { classes: ['b', 'c', 'd'], tokens: ['--x'], exports: [] };
    const d = apiDiff(baseline, current);
    assert.equal(d.available, true);
    assert.deepEqual(d.removed, [{ kind: 'classes', name: 'a' }, { kind: 'exports', name: 'js/m.js:f' }]);
    assert.deepEqual(d.added, [{ kind: 'classes', name: 'c' }, { kind: 'classes', name: 'd' }]);
    assert.deepEqual(d.counts.classes, { baseline: 2, current: 3, removed: 1, added: 2 });
    const alone = apiDiff(baseline, undefined);
    assert.equal(alone.available, false);
    assert.deepEqual(alone.counts.tokens, { baseline: 1, current: null, removed: 0, added: 0 });
    assert.deepEqual([alone.removed, alone.added], [[], []]);
});

test('the security summary orders counts worst first, caps the rows and labels the place', () => {
    const findings = Array.from({ length: 5 }, (_, i) => ({ severity: 'low', rule: 'css-important', file: `f${i}.css`, line: i + 1, message: 'm' }));
    const s = securitySummary({ counts: { low: 5, critical: 0, high: 1, medium: 0 }, findings }, { limit: 3 });
    assert.deepEqual(s.counts.map(c => c.severity), ['critical', 'high', 'medium', 'low']);
    assert.equal(s.rows.length, 3);
    assert.deepEqual([s.total, s.shown, s.clean], [5, 3, false]);
    assert.equal(s.rows[0].where, 'f0.css:1');
    assert.equal(securitySummary({ counts: {}, findings: [] }).clean, true);
    assert.equal(securitySummary(undefined).clean, true);
    assert.deepEqual(['critical', 'high', 'medium', 'low', 'x'].map(severityVariant), ['danger', 'danger', 'warn', 'muted', 'muted']);
});

test('the sweep summary fills absent counts with zero and keeps the notes', () => {
    const s = sweepSummary({ checked: 10, partial: true, widths: [375], themes: ['dark'], failures: [{ item: 'x', width: 375, theme: 'dark', overflow: 2 }], remeasured: [{ item: 'y', cells: 1, note: 'ok' }] });
    assert.deepEqual([s.failing, s.checked, s.partial], [1, 10, true]);
    assert.deepEqual(s.rows[0], { id: 1, item: 'x', width: 375, theme: 'dark', overflow: 2, targets: 0, reading: 0, meta: 0, nested: 0 });
    assert.deepEqual(s.notes, [{ item: 'y', note: 'ok' }]);
    assert.equal(sweepSummary({ failures: [] }).failing, 0);
});

test('the sweep summary reads the small grouped report the sweep tool writes: cells per metric, worst groups, how many were left out', () => {
    const report = { checked: 3648, failing: 1893, at: '2026-01-02T03:04:05.000Z', by: { readingSmall: 1557, smallTargets: 200 }, widths: [320], themes: ['dark', 'light'], groupCount: 3,
        groups: [{ item: 'sample a#1', metric: 'readingSmall', cells: 12, worst: 4, widths: [320, 375], themes: ['dark'] }, { item: 'x', metric: 'error', cells: 1, worst: 'boom', widths: [320], themes: ['dark'] }] };
    const s = sweepSummary(report);
    assert.deepEqual([s.grouped, s.failing, s.checked, s.total, s.rows.length], [true, 1893, 3648, 3, 2]);
    assert.deepEqual(s.by, [{ metric: 'readingSmall', cells: 1557 }, { metric: 'smallTargets', cells: 200 }]);
    assert.deepEqual(s.rows[0], { id: 1, item: 'sample a#1', metric: 'readingSmall', cells: 12, worst: 4, where: '320/375px dark' });
    assert.equal(s.rows[1].worst, 'boom');
    assert.equal(sweepSummary({ ...report, groups: [] }).rows.length, 0);
});

test('metric rows and history rows read scores and changes', () => {
    const scoring = { categories: { perf: { label: 'Performance', weight: 1, metrics: { kb: { label: 'Size', good: 10, poor: 50, lowerIsBetter: true, weight: 1 }, lcp: { label: 'LCP', good: 1, poor: 4 } } } } };
    const scores = scoreAll(scoring, { kb: 30 });
    assert.deepEqual(metricRows(scoring, 'perf', scores.categories.perf), [
        { metric: 'Size', value: 30, good: 10, poor: 50, score: 50, tone: 'danger' },
        { metric: 'LCP', value: 'n/a', good: 1, poor: 4, score: 'n/a', tone: '' },
    ]);
    const history = [{ at: '2026-01-01T00:00:00Z', overall: 80, categories: { perf: 70 } }, { at: '2026-01-02T00:00:00Z', overall: 85, categories: { perf: 75, look: 90 } }];
    assert.deepEqual(historyCategories(history, scoring), ['perf', 'look']);
    const rows = historyRows(history, ['perf', 'look'], at => at.slice(0, 10));
    assert.deepEqual(rows.map(r => [r.when, r.overall, r.change, r.perf, r.look]), [['2026-01-02', 85, 5, 75, 90], ['2026-01-01', 80, null, 70, 'n/a']]);
    assert.deepEqual([signed(3), signed(-2), signed(0), signed(null)], ['+3', '-2', '±0', '']);
    assert.deepEqual([kb(1.26), kb(null), kb(NaN)], ['1.3', '-', '-']);
});

test('comments are stripped like the base-runtime budget counts them, and data must be the page origin', () => {
    assert.equal(stripComments('/* a */\nconst x = 1;\n// note\n\n   const y = 2;\n'), '\nconst x = 1;\nconst y = 2;\n');
    assert.equal(sameOrigin('report.json', 'http://localhost:5310/site/scorecard/'), true);
    assert.equal(sameOrigin('/a.json', 'http://localhost:5310/x'), true);
    assert.equal(sameOrigin('https://cdn.example.net/a.json', 'http://localhost:5310/x'), false);
    assert.equal(sameOrigin('//other.test/a.json', 'http://localhost:5310/x'), false);
});

test('sizes are measured from files of the page origin only, joined and gzipped', async () => {
    const doc = { baseURI: 'http://localhost:5310/page/' };
    const files = { 'http://localhost:5310/a.js': 'a'.repeat(4000), 'http://localhost:5310/b.js': '// c\nconst b = 1;\n' };
    const fetchFn = async url => ({ ok: url in files, status: url in files ? 200 : 404, text: async () => files[url] });
    const [one, two] = await measureSizes([{ name: 'a', url: 'http://localhost:5310/a.js', budget: 'x' }, { name: 'both', urls: ['http://localhost:5310/a.js', 'http://localhost:5310/b.js'], strip: true, budget: 'y' }], doc, fetchFn);
    assert.equal(one.name, 'a');
    assert.ok(one.rawKb > 3.9 && one.gzKb < 0.2, 'repeated text compresses hard');
    assert.ok(two.rawKb < (4000 + 20) / 1024, 'comments stripped');
    assert.equal(await gzipBytes(''), 20);
    await assert.rejects(measureSizes([{ name: 'z', url: 'https://elsewhere.test/z.js' }], doc, fetchFn), /own origin/);
    await assert.rejects(measureSizes([{ name: 'z', url: 'http://localhost:5310/missing.js' }], doc, fetchFn), /404/);
});
