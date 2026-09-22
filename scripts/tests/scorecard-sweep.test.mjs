// The pure helpers of scripts/scorecard-sweep.mjs: argument parsing, grouping and de-duplicating findings, the page problems, the sweep report, the shard merge, the summary and the verdict.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs, failingMetrics, groupSweep, belowScore, dedupeFindings, pageProblems, countByMetric, mergeShards, sweepReport, formatSummary, verdict, STAGES } from '../scorecard-sweep.mjs';

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

test('arguments: the sweep narrowing and speed options, and a report only from the full sweep', () => {
    const d = parseArgs([]);
    assert.deepEqual([d.tabs, d.frames, d.kinds, d.filter, d.widths, d.themes, d.fresh], [4, 3, null, null, null, null, false]);
    const o = parseArgs(['--tabs', '2', '--frames', '5', '--kinds', 'samples,views', '--filter', 'pk-tabs,gallery #/overview', '--widths', '320,375', '--themes', 'dark', '--fresh-frames']);
    assert.deepEqual([o.tabs, o.frames, o.kinds, o.filter, o.widths, o.themes, o.fresh], [2, 5, ['samples', 'views'], ['pk-tabs', 'gallery #/overview'], [320, 375], ['dark'], true]);
    assert.throws(() => parseArgs(['--kinds', 'pages']), /comma list of views, templates, samples/);
    assert.throws(() => parseArgs(['--widths', '320,x']), /positive whole number/);
    assert.throws(() => parseArgs(['--tabs', '0']), /positive whole number/);
    assert.throws(() => parseArgs(['--write-report', '--filter', 'pk-tabs']), /full sweep/);
    assert.equal(parseArgs(['--write-report']).writeReport, true);
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

test('the sweep report is small: totals, cells per metric and the worst groups, the same for the same run', () => {
    const cell = (item, width, extra) => ({ item, width, theme: 'dark', ...extra });
    const failures = [cell('a', 320, { readingSmall: 3 }), cell('a', 375, { readingSmall: 5, overflow: 2 }), cell('b', 320, { smallTargets: 1 }), cell('c', 320, { error: 'x' })];
    assert.deepEqual(countByMetric(failures), { readingSmall: 2, error: 1, overflow: 1, smallTargets: 1 });
    const run = { checked: 100, failures, widths: [320, 375], themes: ['dark'] };
    const r = sweepReport(run, { limit: 2, at: 'T' });
    assert.deepEqual([r.partial, r.at, r.checked, r.failing, r.groupCount, r.groups.length], [false, 'T', 100, 4, 4, 2]);
    assert.deepEqual(r.by, { readingSmall: 2, error: 1, overflow: 1, smallTargets: 1 });
    assert.deepEqual(r.groups[0], { item: 'a', metric: 'readingSmall', cells: 2, worst: 5, widths: [320, 375], themes: ['dark'] });
    assert.equal(JSON.stringify(sweepReport(run, { limit: 2, at: 'T' })), JSON.stringify(r));
    assert.equal(sweepReport({ checked: 1, failures: [], widths: [320], themes: ['dark'] }).failing, 0);
    const many = Array.from({ length: 3000 }, (_, i) => cell('item ' + (i % 300), 320 + i, { readingSmall: 1 }));
    assert.ok(JSON.stringify(sweepReport({ checked: 3648, failures: many, widths: [320], themes: ['dark'] })).length < 20000, 'thousands of failing cells still make a report of a few KB');
});

test('the shards of several tabs merge into one run in a fixed order', () => {
    const m = mergeShards([{ checked: 4, failures: [{ item: 'b', theme: 'dark', width: 320 }] }, { checked: 4, failures: [{ item: 'a', theme: 'light', width: 320 }, { item: 'a', theme: 'dark', width: 375 }] }], { widths: [320, 375], themes: ['dark', 'light'] });
    assert.equal(m.checked, 8);
    assert.deepEqual(m.failures.map(f => `${f.item} ${f.theme} ${f.width}`), ['a dark 375', 'a light 320', 'b dark 320']);
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
