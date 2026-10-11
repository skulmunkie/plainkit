// One command that produces every generated file (they are not in git): node scripts/bootstrap.mjs   (Node only, no dependencies)
//
// Runs, in this order (each reads the previous one's output) and stops at the first failure:
//   1. node core/icons/build.mjs           core/icons.svg, core/icons/icons.json, core/icons/icons.d.ts from core/icons/src/*.svg (issue #111)
//   2. node core/tools/build.mjs           core/dist, core/plainkit.css, the element modules, the gallery data, the Files snapshot, api.current.json (copies core/icons.svg into core/dist/icons.svg)
//   3. node core/tools/audit/data.mjs      the conformance audit's hint data (core/tools/audit/generated.data.mjs), from element meta, page types and tokens
//   4. node scripts/generate-blazor.mjs    the Pk* components (blazor/src/PlainKit.Blazor/Generated) and wwwroot/PlainKit.Blazor.lib.module.js
//   5. node scripts/build-skills.mjs       the agent skills (core/dist/skills); runs side by side with 6, then one node core/tools/build.mjs rewrites the dist manifest
//   6. node scripts/build-agent-refs.mjs   the same skills, exported as core/dist/AGENTS.md and the llms.txt / llms-full.txt pair (issue #36)
//   7. node scripts/publish-dist.mjs       the copy of core/dist inside the Blazor package (wwwroot/plainkit)
//
//   --quiet        print only failures and the final line (what CI uses)
//   --force        run every step even when no source changed since the last run (the local short-circuit, #713; CI never short-circuits; PK_BOOTSTRAP_FORCE=1 does the same)
//   --if-missing   do nothing when the generated files exist and are newer than their sources (cheap enough for a tool to call every time)
//
// Deterministic: running it twice changes nothing. Run it after cloning, after switching branches and after editing any source.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generatedCurrent, missingGenerated } from './generated.mjs';
import { sourceHash, readStamp, writeStamp, clearStamp } from './bootstrap-stamp.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const STEPS = [
    ['core/icons/build.mjs', 'core/icons/build.mjs'],
    ['core/tools/build.mjs', 'core/tools/build.mjs'],
    ['core/tools/audit/data.mjs', 'core/tools/audit/data.mjs'],
    ['scripts/generate-blazor.mjs', 'scripts/generate-blazor.mjs'],
    ['scripts/build-skills.mjs', 'scripts/build-skills.mjs', ['--no-manifest']],
    ['scripts/build-agent-refs.mjs', 'scripts/build-agent-refs.mjs', ['--no-manifest']],
    ['scripts/publish-dist.mjs', 'scripts/publish-dist.mjs'],
];
// Steps 5 and 6 only read the build output and write their own files (neither reads the other's), so they run side by side. Each skips its own manifest rebuild
// (a full core build, ~20 s) and the one below, after both, writes the SRI manifest once with the skills and agent references on disk: the same final bytes as three builds.
const PARALLEL = new Set(['scripts/build-skills.mjs', 'scripts/build-agent-refs.mjs']);
const MANIFEST_STEP = ['core/tools/build.mjs', 'core/tools/build.mjs'];

const run = (rootDir, [file, , args = []]) => new Promise(resolve => {
    const t = performance.now();
    const p = spawn(process.execPath, [path.join(rootDir, file), ...args], { cwd: rootDir });
    let output = '';
    p.stdout.on('data', d => { output += d; }); p.stderr.on('data', d => { output += d; });
    p.on('error', e => resolve({ file, status: null, output: e.message, ms: Math.round(performance.now() - t) }));
    p.on('close', status => resolve({ file, status, output, ms: Math.round(performance.now() - t) }));
});

/**
 * The local short-circuit (#713): { skip, hash }. skip is true only when nothing the bootstrap reads changed since the last full run (hash equals the stamp) AND every generated
 * sentinel exists. Never in CI, with force or PK_BOOTSTRAP_FORCE=1, or outside a git checkout (hash null).
 */
export function shortCircuit(rootDir, { force = false, env = process.env } = {}) {
    if (force || env.CI || env.PK_BOOTSTRAP_FORCE) return { skip: false, hash: null };
    const hash = sourceHash(rootDir);
    return { skip: hash !== null && hash === readStamp(rootDir) && missingGenerated(rootDir).length === 0, hash };
}

export async function bootstrap({ quiet = false, ifMissing = false, force = false, env = process.env, log = console.log } = {}) {
    const t0 = performance.now();
    if (ifMissing && generatedCurrent(root)) { if (!quiet) log('bootstrap: generated files are present and current, nothing to do'); return { ok: true, skipped: true, ms: performance.now() - t0 }; }
    const sc = shortCircuit(root, { force, env });
    if (sc.skip) { if (!quiet) log('bootstrap: no source changed since the last run and the generated files exist, nothing to do (--force or PK_BOOTSTRAP_FORCE=1 runs it anyway)'); return { ok: true, skipped: true, ms: performance.now() - t0 }; }
    clearStamp(root);
    const groups = [];
    for (const step of STEPS) { if (PARALLEL.has(step[0]) && groups.at(-1)?.length && PARALLEL.has(groups.at(-1)[0][0])) groups.at(-1).push(step); else groups.push([step]); }
    const at = groups.findIndex(g => PARALLEL.has(g[0][0])) + 1; // the manifest step goes right after the parallel group
    groups.splice(at, 0, [MANIFEST_STEP]);
    for (const group of groups) {
        for (const r of await Promise.all(group.map(step => run(root, step)))) {
            if (r.status !== 0) {
                process.stderr.write(`bootstrap: node ${r.file} failed (exit ${r.status}) after ${r.ms} ms
${r.output}`);
                return { ok: false, failed: r.file, ms: performance.now() - t0 };
            }
            if (!quiet) log(`  node ${r.file.padEnd(30)} ${String(r.ms).padStart(6)} ms${group.length > 1 ? '  (parallel)' : ''}`);
        }
    }
    if (!env.CI) { const h = sc.hash ?? sourceHash(root); if (h) writeStamp(root, h); }
    return { ok: true, skipped: false, ms: performance.now() - t0 };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const flags = new Set(process.argv.slice(2));
    const bad = [...flags].filter(f => f !== '--quiet' && f !== '--if-missing' && f !== '--force');
    if (bad.length) { console.error(`bootstrap: unknown argument ${bad[0]} (flags: --quiet, --if-missing, --force)`); process.exit(2); }
    const r = await bootstrap({ quiet: flags.has('--quiet'), ifMissing: flags.has('--if-missing'), force: flags.has('--force') });
    if (!r.ok) process.exit(1);
    if (!r.skipped) console.log(`bootstrap: ${STEPS.length} steps ok in ${(r.ms / 1000).toFixed(1)} s`);
}
