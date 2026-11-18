// Puts the records of the shards of one full browser-suite run (node scripts/attest-browser.mjs --shard k/n --out <file>) back together, so a sharded CI run
// means exactly what a single run did (#2027): one core/tests/browser/report.json for the failing-issue flow (scripts/browser-suite-issue.mjs), and the "browser" run
// stamp (scripts/gate-check.mjs) written only when EVERY shard 1..n is present once, together they hold every case the suite has, and all of them passed.
//
//   node scripts/browser-shard-merge.mjs <dir-or-files...> [--report <file>] [--no-stamp]
//   A directory is searched (sub-folders too, as actions/download-artifact makes them) for *.json shard records.
// Exit 0 complete and green, 1 complete with failing cases (report written), 2 incomplete or unreadable (no report is written: the issue flow then says "could not finish").
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeRunStamp } from './verify-guard.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** records: parsed shard records ({ shard: {k,n}, totalCases, results }). Returns { ok, complete, problems, report }; `report` is the merged report.json shape (null when incomplete). Pure. */
export function mergeShards(records, { now = new Date() } = {}) {
    const problems = [];
    const good = records.filter(r => r && r.shard && Array.isArray(r.results));
    if (good.length !== records.length) problems.push(`${records.length - good.length} record(s) are not shard records (no shard or results)`);
    if (!good.length) return { ok: false, complete: false, problems: [...problems, 'no shard records'], report: null };
    const n = good[0].shard.n, total = good[0].totalCases;
    for (const r of good) if (r.shard.n !== n || r.totalCases !== total) problems.push(`shard ${r.shard.k}/${r.shard.n} disagrees (shards of ${n}, ${total} cases expected)`);
    const seen = new Map();
    for (const r of good) seen.set(r.shard.k, (seen.get(r.shard.k) ?? 0) + 1);
    for (let k = 1; k <= n; k++) {
        if (!seen.has(k)) problems.push(`shard ${k}/${n} is missing`);
        else if (seen.get(k) > 1) problems.push(`shard ${k}/${n} appears ${seen.get(k)} times`);
    }
    const results = good.flatMap(r => r.results);
    if (!Number.isInteger(total)) problems.push('the shards do not say how many cases the suite has');
    else if (results.length !== total) problems.push(`the shards hold ${results.length} results, the suite has ${total} cases`);
    if (problems.length) return { ok: false, complete: false, problems, report: null };
    const passed = results.filter(r => r.ok).length, failed = results.length - passed;
    const report = { ran: now.toISOString(), browser: `merged from ${n} shards`, passed, failed, selected: results.length, totalCases: total, filter: null, shard: null, results };
    return { ok: failed === 0 && passed > 0, complete: true, problems: [], report };
}

const jsonFiles = p => {
    if (!fs.statSync(p).isDirectory()) return [p];
    return fs.readdirSync(p, { withFileTypes: true }).flatMap(e => e.isDirectory() ? jsonFiles(path.join(p, e.name)) : e.name.endsWith('.json') ? [path.join(p, e.name)] : []);
};

export function main(argv) {
    const inputs = [], o = { report: path.join(root, 'core', 'tests', 'browser', 'report.json'), stamp: true };
    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === '--report') o.report = path.resolve(argv[++i]);
        else if (argv[i] === '--no-stamp') o.stamp = false;
        else if (argv[i].startsWith('--')) { console.error(`unknown argument ${argv[i]}`); return 2; }
        else inputs.push(argv[i]);
    }
    if (!inputs.length) { console.error('usage: node scripts/browser-shard-merge.mjs <dir-or-files...> [--report <file>] [--no-stamp]'); return 2; }
    const records = [];
    try { for (const f of inputs.flatMap(jsonFiles)) records.push(JSON.parse(fs.readFileSync(f, 'utf8'))); } catch (e) { console.error(`could not read a shard record: ${e.message}`); return 2; }
    const r = mergeShards(records);
    if (!r.complete) { console.error(`the sharded run is incomplete, no report written:\n  ${r.problems.join('\n  ')}`); return 2; }
    fs.mkdirSync(path.dirname(o.report), { recursive: true });
    fs.writeFileSync(o.report, JSON.stringify(r.report, null, 2));
    console.log(`merged ${records.length} shards: ${r.report.passed} passed, ${r.report.failed} failed, ${r.report.totalCases} cases`);
    for (const c of r.report.results.filter(c => !c.ok)) console.log(`  FAIL ${c.name}: ${c.error ?? ''}`);
    if (o.stamp) writeRunStamp(root, 'browser', r.ok);
    return r.ok ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(main(process.argv.slice(2)));
