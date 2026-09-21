// The pure helpers of scripts/scorecard-sweep.mjs: argument parsing, grouping and de-duplicating findings, the page problems, the tracked-report merge, the summary and the verdict.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs, failingMetrics, groupSweep, belowScore, dedupeFindings, pageProblems, mergeSweepReport, formatSummary, verdict, STAGES } from '../scorecard-sweep.mjs';

test('arguments: every stage by default, a stage list, numbers checked, unknown flags refused', () => {
    assert.deepEqual(parseArgs([]).only, STAGES);
    assert.deepEqual(parseArgs(['--only', 'sweep,pages']).only, ['sweep', 'pages']);
    assert.equal(parseArgs(['--port', '5400', '--timeout', '60', '--concurrency', '3']).port, 5400);
    assert.equal(parseArgs(['--concurrency', '3']).concurrency, 3);
    assert.throws(() => parseArgs(['--only', 'sweeep']), /comma list/);
    assert.throws(() => parseArgs(['--port', 'x']), /positive whole number/);
    assert.throws(() => parseArgs(['--out']), /needs a folder/);
    assert.throws(() => parseArgs(['--nope']), /unknown argument/);
    assert.throws(() => parseArgs(['--only', 'quality', '--write-report']), /needs the sweep stage/);
});

test('a sweep result fails per metric; a clean cell and an h1 of one fail nothing', () => {
    assert.deepEqual(failingMetrics({ overflow: 0, smallTargets: 0, nestedScrollers: 0, metaTooSmall: 0, readingSmall: 0, h1: 1 }), []);
    assert.deepEqual(failingMetrics({ overflow: 12, smallTargets: 2, h1: 0 }).map(m => m.metric), ['overflow', 'smallTargets', 'h1']);
    assert.deepEqual(failingMetrics({ error: 'boom' }), [{ metric: 'error', value: 'boom' }]);
    assert.deepEqual(failingMetrics({ overflow: 0, h1: null }), []);
});

test('sweep failures group by item and metric, most cells first, with the worst value and where', () => {
    const f = [
        { item: 'sample a#1', width: 320, theme: 'dark', overflow: 10 }, { item: 'sample a#1', width: 375, theme: 'dark', overflow: 30 }, { item: 'sample a#1', width: 320, theme: 'light', overflow: 5 },
        { item: 'gallery #/x', width: 375, theme: 'dark', smallTargets: 4 },
    ];
    const g = groupSweep(f);
    assert.equal(g.length, 2);
    assert.deepEqual([g[0].item, g[0].metric, g[0].cells, g[0].worst, g[0].widths, g[0].themes], ['sample a#1', 'overflow', 3, 30, [320, 375], ['dark', 'light']]);
    assert.equal(g[1].metric, 'smallTargets');
    assert.deepEqual(groupSweep(undefined), []);
});

test('items with findings are listed worst score first; findings repeat across targets as one row', () => {
    const a = { name: 'A', score: 100, findings: [] };
    const b = { name: 'B', score: 75, findings: [{ check: 'zero-gap', severity: 'error', selector: 'x > y', message: 'm', count: 10 }] };
    const c = { name: 'C', score: 50, findings: [{ check: 'zero-gap', severity: 'error', selector: 'x > y', message: 'm', count: 2 }, { check: 'touch-target', severity: 'warn', selector: 'a', message: 'm', count: 1 }] };
    assert.deepEqual(belowScore([a, b, c]).map(i => i.name), ['C', 'B']);
    const d = dedupeFindings([a, b, c]);
    assert.equal(d.length, 2);
    assert.deepEqual([d[0].check, d[0].count, d[0].targets], ['zero-gap', 12, ['B', 'C']]);
    assert.equal(d[1].severity, 'warn', 'errors sort before warnings');
});

test('page problems: a limit missed, a console error, a thrown error, a failed request; warnings and good pages are not listed', () => {
    const pages = [
        { url: 'ok', width: 1280, lcp: 900, fcp: 500, cls: 0.01, longTaskMax: 60, console: [{ level: 'warn', text: 'w' }] },
        { url: 'slow', width: 375, lcp: 3100.4, fcp: 2000, cls: 0.3, longTaskMax: 250, console: [{ level: 'error', text: 'bad' }], exceptions: ['TypeError: x'], failedRequests: ['404 /a.js'] },
        { url: 'nopaint', width: 375, lcp: null, fcp: null, cls: 0, longTaskMax: 0 },
    ];
    const p = pageProblems(pages);
    assert.equal(p.length, 1);
    assert.equal(p[0].url, 'slow');
    assert.equal(p[0].why.length, 7);
    assert.ok(p[0].why[0].startsWith('LCP 3100 ms'));
});

test('the tracked sweep report keeps its notes, refreshes the counts and stays byte-identical for the same clean run', () => {
    const existing = { partial: false, checked: 10, failures: [], widths: [320], themes: ['dark'], remeasured: [{ item: 'x' }], summary: { checked: 10, failing: 0, wasFailing: 12, widths: [320], themes: ['dark'], exceptions: 'see file' } };
    const run = { checked: 10, failures: [], widths: [320], themes: ['dark'] };
    assert.equal(JSON.stringify(mergeSweepReport(existing, run)), JSON.stringify(existing));
    const failing = mergeSweepReport(existing, { checked: 12, failures: [{ item: 'a', width: 320, theme: 'dark', overflow: 1 }, { item: 'a', width: 320, theme: 'dark', smallTargets: 1 }], widths: [320], themes: ['dark'] });
    assert.deepEqual([failing.checked, failing.summary.failing, failing.summary.wasFailing, failing.remeasured.length], [12, 1, 12, 1]);
    assert.equal(mergeSweepReport(null, run).summary.exceptions.startsWith('see TARGET_EXCEPTIONS'), true);
});

test('the summary reads worst first and the verdict fails on sweep failures, quality errors and page problems only', () => {
    const sweep = { checked: 24, widths: [320, 375], themes: ['dark', 'light'], failures: [{ item: 'sample a#1', width: 320, theme: 'dark', overflow: 9 }] };
    const quality = { overall: 80, categories: { look: 70 }, items: [{ name: 'Bad', score: 50, findings: [{ check: 'zero-gap', severity: 'error', selector: 'a > b', message: 'm', count: 3 }] }, { name: 'Warn', score: 92, findings: [{ check: 'touch-target', severity: 'warn', selector: 'a', message: 'm', count: 1 }] }], measured: { cssKb: 27.5 } };
    const pages = { widths: [375], pages: [{ url: 'p', width: 375, lcp: 100, fcp: 100, cls: 0, longTaskMax: 0 }], qualityFindings: [] };
    const text = formatSummary({ sweep, quality, pages });
    assert.ok(text.indexOf('SWEEP: 24 cells') === 0 && text.includes('QUALITY: overall 80') && text.includes('PAGES: 1 page loads'));
    assert.ok(text.indexOf('Bad') < text.indexOf('Warn'));
    assert.deepEqual(verdict({ sweep, quality, pages }), ['sweep: 1 failing cells', 'quality: 1 error findings']);
    assert.deepEqual(verdict({ sweep: { failures: [] }, quality: { items: [quality.items[1]] }, pages }), [], 'a warning alone passes');
    assert.equal(verdict({ pages: { pages: [{ url: 'p', width: 375, cls: 0.5 }] } }).length, 1);
});
