// Dogfoods the "module" ruleset (S1-S12, core/tools/audit/families/module-rules.mjs, issue #518 A-9b) against
// PlainKit's own strict-module source: core/site/** and core/modules/** (owner decision on #518 - these are
// PlainKit's own app modules, not consumer-facing samples, so they are checked with the internal `module`
// ruleset rather than the public `consumer`/`consumer-strict` rulesets the CLI exposes).
//
// The `module` ruleset is deliberately not wired into the public `npx plainkit audit` CLI (core/tools/audit/
// module-ruleset.mjs's own header comment, A-9b): it must never reach --list-rules/--explain or the A-8
// docs-generation pipeline. So this script calls the engine directly (checkFiles({ ruleset: 'module' })) rather
// than shelling out to cli.mjs, and re-implements only the small slice of cli.mjs's plumbing this needs: file
// collection (extensions, size/minified skips) and the allow-list ratchet (design 5.3, A-6) read from the
// repository-root plainkit.audit.json, the same file A-10b started using for core/samples/app.
//
//   node scripts/audit-modules.mjs            scan core/site/** and core/modules/**, print findings, exit 1 on any error
//   node scripts/audit-modules.mjs --quiet    summary line only
//
// This is this repository's own permanent dogfooding tool (issue #518, slice A-10c) - part of `node scripts/
// verify.mjs`'s `audit` check group, not a one-off.
//
// The first sweep (2026-09-29) found 796 findings across core/site/** - real style/architecture debt (a class=
// attribute, an inline document./localStorage touch, a literal CSS value, a stray .css/.html file under the
// module anatomy) accumulated before the `module` ruleset existed to catch it, not a wall of one-off exceptions
// each worth its own reasoned allow-list entry. Rather than block this PR on paying all of that down (a change
// far past the repository's ~400-line PR discipline, AGENTS.md), it is recorded once with `--update-baseline`
// into `plainkit.audit.modules.baseline.json` (the same ratchet mechanism `plainkit audit --update-baseline`
// uses, core/tools/audit/baseline.mjs, design 5.3): today's findings are fingerprinted (rule + normalised
// message + file, never the line number) and suppressed, so this check is enforced *going forward* - any new
// finding in core/site/**/core/modules/** fails immediately - while the legacy debt is paid down as its own
// follow-up work, tracked on issue #518.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkFiles } from '../core/tools/strict/engine.mjs';
import '../core/tools/audit/module-ruleset.mjs'; // side effect: registers the "module" ruleset
import { collectFiles } from '../core/tools/audit/glob.mjs';
import { loadBaseline, writeBaseline, applyBaseline, BaselineError } from '../core/tools/audit/baseline.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SUPPORTED_EXTENSIONS = ['.html', '.htm', '.js', '.mjs', '.jsx', '.ts', '.tsx', '.css', '.razor', '.cshtml'];
const MAX_FILE_BYTES = 1024 * 1024;
const SCAN_ROOTS = ['core/site', 'core/modules'];
const CONFIG_PATH = path.join(root, 'plainkit.audit.json');
const BASELINE_PATH = path.join(root, 'plainkit.audit.modules.baseline.json');

function loadAllow() {
    if (!fs.existsSync(CONFIG_PATH)) return [];
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    return Array.isArray(config.allow) ? config.allow : [];
}

function readFile(entry) {
    const stat = fs.statSync(entry.abs);
    if (stat.size > MAX_FILE_BYTES) return { skip: 'too large (>1MB)' };
    if (/\.min\./.test(entry.rel)) return { skip: 'minified' };
    const text = fs.readFileSync(entry.abs, 'utf8');
    if (text.split('\n').some(line => line.length > 5000)) return { skip: 'minified (a line over 5000 characters)' };
    return { text };
}

function collect() {
    const files = [];
    const seen = new Set();
    for (const rel of SCAN_ROOTS) {
        const start = path.join(root, rel);
        if (!fs.existsSync(start)) continue;
        for (const entry of collectFiles(start, { extensions: SUPPORTED_EXTENSIONS })) {
            if (entry.skipped) continue;
            const relPath = path.relative(root, entry.abs).split(path.sep).join('/');
            if (seen.has(relPath)) continue;
            seen.add(relPath);
            const read = readFile(entry);
            if (read.skip) continue;
            files.push({ path: relPath, text: read.text });
        }
    }
    return files;
}

export function run({ quiet = false, updateBaseline = false } = {}) {
    const files = collect();
    const allow = loadAllow();
    const raw = checkFiles(files, { ruleset: 'module', allow });
    const allowIssues = (raw.allowReport || []).filter(e => e.status !== 'ok');

    if (updateBaseline) {
        writeBaseline(BASELINE_PATH, raw);
        console.log(`plainkit audit-modules: baseline written to ${path.relative(root, BASELINE_PATH)} (${raw.length} finding${raw.length === 1 ? '' : 's'})`);
        return 0;
    }

    let entries;
    try {
        entries = loadBaseline(BASELINE_PATH);
    } catch (err) {
        if (err instanceof BaselineError) {
            console.error(`plainkit audit-modules: ${err.message}`);
            console.error(`FIX: fix ${path.relative(root, BASELINE_PATH)}, or regenerate it with --update-baseline.`);
            return 2;
        }
        throw err;
    }
    const { visible: findings, stale } = applyBaseline(raw, entries);

    if (!quiet) {
        for (const f of findings) {
            console.log(`${f.file}:${f.line}:${f.column} [${f.rule}] ${f.message}`);
            if (f.fix) console.log(`  ${f.fix}`);
        }
        for (const entry of stale) {
            console.log(`plainkit audit-modules: baseline entry fixed: ${entry.file} [${entry.rule}] no longer occurs - remove it from ${path.relative(root, BASELINE_PATH)}.`);
        }
        for (const issue of allowIssues) {
            if (issue.status === 'dead') {
                console.error(`plainkit audit-modules: allow entry ${issue.path} [${issue.rule}] has no matching finding.`);
                console.error(`FIX: remove the dead allow entry for ${issue.rule} in ${issue.path}.`);
            } else {
                console.error(`plainkit audit-modules: allow entry ${issue.path} [${issue.rule}] declares count ${issue.count}, but ${issue.actual} real hit${issue.actual === 1 ? '' : 's'} found.`);
                console.error(`FIX: set "count": ${issue.actual} for the ${issue.rule} allow entry in ${issue.path} (an allow entry can only shrink).`);
            }
        }
    }

    const byRule = {};
    for (const f of findings) byRule[f.rule] = (byRule[f.rule] ?? 0) + 1;
    console.log(`plainkit audit-modules: ${files.length} files scanned, ${findings.length} new finding${findings.length === 1 ? '' : 's'} (${raw.length} total, ${raw.length - findings.length} baselined) (${Object.entries(byRule).map(([r, n]) => `${r}:${n}`).join(', ') || 'none'})`);

    return findings.length > 0 || allowIssues.length > 0 ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const quiet = process.argv.includes('--quiet');
    const updateBaseline = process.argv.includes('--update-baseline');
    process.exit(run({ quiet, updateBaseline }));
}
