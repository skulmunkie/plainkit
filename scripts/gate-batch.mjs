// The runner's batch gate as one command (owner directive 2026-10-26): merge the branches onto the base in THIS worktree, then, in order and stopping at the
// first failure, bootstrap --force, the size checks (budgets, page weight, package zips: fail fast), verify --pack, the browser cases of the changed elements and the batch's issues (one targeted run), the targeted UI review and the
// Blazor harness's --changed selection. One line per step with its seconds; each step's output in <result dir>/gate-logs/<step>.log; a JSON result.
// It checks nothing less than the runner did by hand: same commands, same selections (ui-review and blazor-browser --changed choose their own).
//   node scripts/gate-batch.mjs --result <file.json> [--branches agent/a,agent/b] [--queue integration/queue-N] [--base origin/main] [--cache-dir <dir>] [--jobs N] [--filter extra,substrings] [--measure-ceilings]
//   --measure-ceilings: also store the measured package, payload and page-weight numbers in the result (scripts/set-ceilings.mjs --from <result> applies the owner's ceiling rule), even after a failed sizes or verify step
//   --queue: create that branch from --base first. Without it the branches merge into the current branch (after resolving a conflict by hand and committing,
//   run again without --queue and with --branches <the ones not merged yet>).
// Exit 0 every step passed; 1 a step failed or a merge conflicted (the files are printed); 2 bad arguments or an unusable worktree.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeTempDir, removeTree } from '../core/tools/tempdir.mjs';
import { listElementFolders } from '../core/tools/element-folders.mjs';
import { parseList, selectCases } from '../core/tests/browser/case-filter.js';
import { changedFromFiles } from './ui-review.mjs';
import { changedSince, defaultBase } from './verify-changed.mjs';
import { coreJsUsers } from './core-js-users.mjs';
import { measure } from './set-ceilings.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const STEPS = ['merge', 'bootstrap', 'sizes', 'verify', 'attest', 'ui-review', 'blazor-browser', 'measure'];

export function parseArgs(argv) {
    const o = { result: null, branches: [], queue: null, base: null, cacheDir: null, jobs: null, filter: [], measureCeilings: false };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i], value = () => { if (i + 1 >= argv.length || argv[i + 1].startsWith('--')) throw new Error(`${a} needs a value`); return argv[++i]; };
        if (a === '--result') o.result = path.resolve(value());
        else if (a === '--branches') o.branches = value().split(',').map(s => s.trim()).filter(Boolean);
        else if (a === '--queue') o.queue = value();
        else if (a === '--base') o.base = value();
        else if (a === '--cache-dir') o.cacheDir = path.resolve(value());
        else if (a === '--measure-ceilings') o.measureCeilings = true;
        else if (a === '--filter') o.filter = parseList(value());
        else if (a === '--jobs') { const v = value(); if (!/^\d+$/.test(v) || +v < 1 || +v > 16) throw new Error('--jobs must be an integer from 1 to 16'); o.jobs = +v; }
        else throw new Error(`unknown argument ${a}`);
    }
    if (!o.result) throw new Error('--result <file.json> is required');
    if (o.queue && !o.branches.length) throw new Error('--queue needs --branches');
    return o;
}

export const issueFilter = branches => [...new Set(branches.map(b => /(?:^|\/)(\d+)-/.exec(b)?.[1]).filter(Boolean).map(n => `#${n}`))];
export const caseNames = text => [...text.matchAll(/\[\s*(['"`])((?:(?!\1)[^\\]|\\.)+)\1\s*,\s*async\b/g)].map(m => m[2]);

/** Elements whose browser cases run: the changed element folders plus the importers of a changed core/js module (a shared one only adds a note). */
export function attestElements(files, known, usersOf) {
    const names = new Set(changedFromFiles(files, known).names), notes = [];
    for (const f of files.filter(f => /^core\/js\/.*\.js$/.test(f))) {
        const u = usersOf(f);
        if (u.full) notes.push(`${f}: shared (${u.full}); its browser cases run in the nightly full suite`);
        else for (const e of u.elements || []) if (known.has(e)) names.add(e);
    }
    return { elements: [...names].sort(), notes };
}

/** The browser run for the changed elements and the batch's issues: null when it would select no case (attest exits 1 then). */
export function attestPlan({ elements, filter, names }) {
    const selected = selectCases(names.map(n => [n]), { filter: filter.map(f => f.toLowerCase()), elements }).length;
    if (!selected) return null;
    return { argv: ['scripts/attest-browser.mjs', ...(elements.length ? ['--elements', elements.join(',')] : []), ...(filter.length ? ['--filter', filter.join(',')] : [])], selected };
}

export const formatStep = s => `gate: ${s.name.padEnd(15)} ${s.skipped ? 'skip' : s.ok ? 'ok  ' : 'FAIL'} ${String(s.seconds ?? 0).padStart(4)} s  ${s.skipped ?? s.log ?? ''}`;

const git = (...args) => spawnSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 1 << 26 });

async function main(argv) {
    let o;
    try { o = parseArgs(argv); } catch (e) { console.error(e.message); return 2; }
    const base = defaultBase(o.base, root);
    if (!base) { console.error('no base: pass --base <ref>'); return 2; }
    if (!fs.existsSync(path.join(root, 'node_modules', 'esbuild', 'package.json'))) { console.error("node_modules is missing in this worktree: make the junction to the main checkout's node_modules first"); return 2; }
    if (git('status', '--porcelain', '--untracked-files=no').stdout.trim()) { console.error('the worktree has uncommitted changes: commit or discard them first'); return 2; }
    const logs = path.join(path.dirname(o.result), 'gate-logs');
    fs.mkdirSync(logs, { recursive: true });
    const result = { base, queue: o.queue, branches: [], steps: [], ok: false };
    const started = Date.now();
    const save = () => fs.writeFileSync(o.result, JSON.stringify({ ...result, head: git('rev-parse', 'HEAD').stdout.trim() }, null, 2));
    const record = s => { result.steps.push(s); console.log(formatStep(s)); save(); };
    const mergeLog = [];
    const stepMerge = () => {
        const t = Date.now(), done = (ok, log) => { fs.writeFileSync(path.join(logs, 'merge.log'), mergeLog.join('\n')); record({ name: 'merge', ok, seconds: Math.round((Date.now() - t) / 1000), log }); return ok; };
        const run = (...a) => { const r = git(...a); mergeLog.push(`$ git ${a.join(' ')}`, r.stdout, r.stderr); return r; };
        run('fetch', 'origin', '--quiet');
        if (o.queue) { const r = run('switch', '-c', o.queue, base); if (r.status !== 0) { console.error(r.stderr); return done(false, 'merge.log'); } }
        for (const [i, b] of o.branches.entries()) {
            const ref = b.startsWith('origin/') ? b : `origin/${b}`, commit = run('rev-parse', ref);
            if (commit.status !== 0) { console.error(`no such branch ${ref}`); return done(false, 'merge.log'); }
            if (run('merge', '--no-ff', '--no-edit', ref).status !== 0) {
                const files = run('diff', '--name-only', '--diff-filter=U').stdout.split('\n').filter(Boolean), rest = o.branches.slice(i + 1);
                result.conflict = { branch: b, files, notMerged: o.branches.slice(i) };
                console.error(`conflict merging ${b}: ${files.join(', ')}`);
                console.error(`FIX: resolve the files, git add them, git commit --no-edit, then: node scripts/gate-batch.mjs --result ${o.result} --branches ${rest.join(',') || '<none>'}`);
                return done(false, 'merge.log');
            }
            result.branches.push({ branch: b, commit: commit.stdout.trim() });
        }
        return done(true, 'merge.log');
    };
    const run = (name, ...commands) => {
        const t = Date.now(), log = path.join(logs, `${name}.log`), fd = fs.openSync(log, 'w');
        let r;
        for (const args of commands) { r = spawnSync(process.execPath, args, { cwd: root, stdio: ['ignore', fd, fd] }); if (r.status !== 0) break; }
        fs.closeSync(fd);
        const s = { name, ok: r.status === 0, code: r.status, seconds: Math.round((Date.now() - t) / 1000), log };
        record(s);
        if (!s.ok) console.log(fs.readFileSync(log, 'utf8').split('\n').slice(-20).join('\n'));
        return s.ok;
    };
    if (o.branches.length && !stepMerge()) return 1;
    if (!run('bootstrap', ['scripts/bootstrap.mjs', '--force'])) return 1;
    const finish = async code => {
        if (o.measureCeilings) {
            const t = Date.now();
            try { result.measured = await measure(root); record({ name: 'measure', ok: true, seconds: Math.round((Date.now() - t) / 1000), log: null }); console.log(`gate: measured; apply the owner's ceiling rule with: node scripts/set-ceilings.mjs --from ${o.result}`); }
            catch (e) { record({ name: 'measure', ok: false, seconds: Math.round((Date.now() - t) / 1000), log: e.message }); code ||= 1; }
        }
        save();
        return code;
    };
    const zips = makeTempDir('pk-gate-zips-');
    let sizesOk;
    try { sizesOk = run('sizes', ['--test', 'core/tests/budgets.test.mjs', 'core/tests/app-budgets.test.mjs', 'core/tests/page-weight.test.mjs'], ['scripts/build-packages.mjs', '--zips', zips], ['scripts/check-package.mjs', '--zips', zips]); } finally { removeTree(zips); }
    if (!sizesOk) return finish(1);
    if (!run('verify', ['scripts/verify.mjs', '--pack', '--base', base])) return finish(1);
    const files = changedSince(base, root);
    if (!files) { record({ name: 'attest', ok: false, seconds: 0, log: 'git could not list the changed files' }); return 1; }
    const known = new Set(listElementFolders(path.join(root, 'core')).map(e => e.name)), usersOf = files.some(f => /^core\/js\/.*\.js$/.test(f)) ? coreJsUsers(root) : () => ({}), { elements, notes } = attestElements(files, known, usersOf);
    for (const n of notes) console.log(`gate: ${n}`);
    const filter = [...issueFilter(o.branches.length ? o.branches : result.branches.map(x => x.branch)), ...o.filter];
    const dir = path.join(root, 'core', 'tests', 'browser');
    const names = fs.readdirSync(dir).filter(f => /^cases.*\.js$/.test(f)).flatMap(f => caseNames(fs.readFileSync(path.join(dir, f), 'utf8')));
    const plan = attestPlan({ elements, filter, names });
    result.attest = { elements, filter, selected: plan?.selected ?? 0 };
    if (!plan) record({ name: 'attest', skipped: 'no browser case names a changed element or a batch issue', seconds: 0 });
    else if (!run('attest', plan.argv)) return finish(1);
    if (!run('ui-review', ['scripts/ui-review.mjs', '--base', base, ...(o.cacheDir ? ['--cache-dir', o.cacheDir] : []), ...(o.jobs ? ['--jobs', String(o.jobs)] : [])])) return finish(1);
    if (!run('blazor-browser', ['scripts/blazor-browser.mjs', '--changed', '--base', base])) return finish(1);
    result.ok = true;
    console.log(`gate: all steps passed in ${Math.round((Date.now() - started) / 1000)} s; result ${o.result}`);
    return finish(0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(await main(process.argv.slice(2)));
