#!/usr/bin/env node
// The `plainkit audit` CLI (design section 5, issue #629, slice A-5). Reads a consumer project's own source
// files, runs the rule table of core/tools/audit/rules.mjs (built on the pure engine of
// core/tools/strict/engine.mjs) and prints findings. Ships at dist/tools/audit/cli.mjs (core/package.json's
// `bin`); this file and everything it imports must stay free of any core/js, core/elements or core/site import
// (design section 11) so it runs unmodified from a consumer's own node_modules.
//
// A-6 (#629) adds the allow-list ratchet report (a stale or dead `allow` entry fails the run, per design 5.3),
// the baseline/ratchet flags (--baseline, --update-baseline, --strict-baseline) and --format sarif. Not yet
// supported: inline `plainkit-audit-ignore` comments (design 5.3, Q7) - left to a follow-up slice.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkFiles, getRuleset } from '../strict/engine.mjs';
import { RULES, getRuleMeta } from './rules.mjs';
import { findConfig, loadConfig, ConfigError } from './config.mjs';
import { collectFiles } from './glob.mjs';
import { formatText, formatJson, formatSarif, formatRuleList, formatExplain } from './format.mjs';
import { DEFAULT_BASELINE_NAME, loadBaseline, writeBaseline, applyBaseline, BaselineError } from './baseline.mjs';

const SUPPORTED_EXTENSIONS = ['.html', '.htm', '.js', '.mjs', '.jsx', '.ts', '.tsx', '.css', '.razor', '.cshtml'];
const MAX_FILE_BYTES = 1024 * 1024;

function packageVersion() {
    try {
        const pkgPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'package.json');
        return JSON.parse(fs.readFileSync(pkgPath, 'utf8')).version;
    } catch {
        return '0.0.0';
    }
}

export function parseArgs(argv) {
    const opts = {
        paths: [], strict: false, format: 'text', rule: null, skip: null, config: null,
        maxWarnings: -1, explain: null, listRules: false, quiet: false, color: true, version: false,
        baseline: null, updateBaseline: false, strictBaseline: false,
    };
    const errors = [];
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        const next = () => argv[++i];
        switch (a) {
            case '--strict': opts.strict = true; break;
            case '--format': {
                const v = next();
                if (v !== 'text' && v !== 'json' && v !== 'sarif') errors.push(`--format must be "text", "json" or "sarif", got "${v}"`);
                else opts.format = v;
                break;
            }
            case '--rule': opts.rule = (next() || '').split(',').map(s => s.trim()).filter(Boolean); break;
            case '--skip': opts.skip = (next() || '').split(',').map(s => s.trim()).filter(Boolean); break;
            case '--config': opts.config = next(); break;
            case '--max-warnings': {
                const v = Number(next());
                if (!Number.isInteger(v)) errors.push('--max-warnings must be an integer');
                else opts.maxWarnings = v;
                break;
            }
            case '--baseline': opts.baseline = next() || null; break;
            case '--update-baseline': opts.updateBaseline = true; break;
            case '--strict-baseline': opts.strictBaseline = true; break;
            case '--explain': opts.explain = next(); break;
            case '--list-rules': opts.listRules = true; break;
            case '--quiet': opts.quiet = true; break;
            case '--no-color': opts.color = false; break;
            case '--version': opts.version = true; break;
            default:
                if (a.startsWith('--')) errors.push(`unknown flag: ${a}`);
                else opts.paths.push(a);
        }
    }
    if (opts.updateBaseline && opts.strictBaseline) errors.push('--update-baseline and --strict-baseline are mutually exclusive');
    return { opts, errors };
}

function selectRules(allRules, { rule, skip }) {
    const idMatches = (id, token) => id === token || (token.length === 1 && id.startsWith(token));
    let rules = allRules;
    if (rule && rule.length) rules = rules.filter(r => rule.some(token => idMatches(r.id, token)));
    if (skip && skip.length) rules = rules.filter(r => !skip.some(token => idMatches(r.id, token)));
    return rules;
}

function readFile(entry) {
    const stat = fs.statSync(entry.abs);
    if (stat.size > MAX_FILE_BYTES) return { skip: 'too large (>1MB)' };
    if (/\.min\./.test(entry.rel)) return { skip: 'minified' };
    const text = fs.readFileSync(entry.abs, 'utf8');
    if (text.split('\n').some(line => line.length > 5000)) return { skip: 'minified (a line over 5000 characters)' };
    return { text };
}

export async function run(argv, { cwd = process.cwd(), stdout = console.log, stderr = console.error } = {}) {
    const { opts, errors } = parseArgs(argv);
    if (errors.length) {
        for (const e of errors) stderr(`plainkit audit: ${e}`);
        stderr('FIX: fix the command line and re-run; see `plainkit audit --help`-equivalent flags in the design doc or --list-rules for valid ids.');
        return 2;
    }

    if (opts.version) { stdout(packageVersion()); return 0; }

    if (opts.listRules) { stdout(formatRuleList(RULES)); return 0; }

    if (opts.explain) {
        const meta = getRuleMeta(opts.explain);
        if (!meta) { stderr(`plainkit audit: unknown rule id "${opts.explain}"`); stderr('FIX: run --list-rules to see valid ids.'); return 2; }
        stdout(formatExplain(meta));
        return 0;
    }

    let config = { include: [], ignore: [], strict: false, options: {}, rules: {}, allow: [], dir: cwd };
    try {
        const configFile = opts.config ? path.resolve(cwd, opts.config) : findConfig(cwd);
        if (configFile) config = loadConfig(configFile);
        else if (opts.config) throw new ConfigError(`config file not found: ${opts.config}`);
    } catch (err) {
        if (err instanceof ConfigError) {
            stderr(`plainkit audit: ${err.message}`);
            stderr(`FIX: fix ${opts.config || 'plainkit.audit.json'} and re-run.`);
            return 2;
        }
        throw err;
    }

    const strict = opts.strict || config.strict;
    const mode = strict ? 'strict' : 'normal';
    const root = config.dir;
    const include = config.include;
    const ignore = config.ignore;

    const roots = opts.paths.length ? opts.paths.map(p => path.resolve(cwd, p)) : [root];
    const entries = [];
    const seen = new Set();
    for (const start of roots) {
        for (const entry of collectFiles(start, { include: start === root ? include : [], ignore, extensions: SUPPORTED_EXTENSIONS })) {
            const rel = path.relative(root, entry.abs).split(path.sep).join('/');
            if (seen.has(rel)) continue;
            seen.add(rel);
            entries.push({ ...entry, rel });
        }
    }

    const files = [];
    const skippedUnsupported = [];
    const skippedOther = [];
    for (const entry of entries) {
        if (entry.skipped) { skippedUnsupported.push(entry.rel); continue; }
        const read = readFile(entry);
        if (read.skip) { skippedOther.push(`${entry.rel} (${read.skip})`); continue; }
        files.push({ path: entry.rel, text: read.text });
    }

    const allRules = getRuleset(strict ? 'consumer-strict' : 'consumer');
    const requestedRules = selectRules(RULES, opts);
    const requestedIds = new Set(requestedRules.map(r => r.id));
    const skippedRuleIds = RULES.filter(r => !requestedIds.has(r.id)).map(r => r.id);
    const engineRules = allRules.filter(r => requestedIds.has(r.id));

    const start = process.hrtime.bigint();
    let raw;
    try {
        raw = checkFiles(files, { rules: engineRules, allow: config.allow });
    } catch (err) {
        stderr(`plainkit audit: internal error: ${err.message}`);
        stderr('FIX: this is a scanner bug, not a finding; please file it with the file that triggered it and the stack trace above.');
        if (err.stack) stderr(err.stack);
        return 3;
    }
    const seconds = Math.round(Number(process.hrtime.bigint() - start) / 1e8) / 10;

    let findings = raw.map(f => {
        const meta = getRuleMeta(f.rule);
        const severity = meta?.severity?.[mode] ?? 'warn';
        return { ...f, category: meta?.category, docs: meta?.docs, severity };
    }).filter(f => f.severity !== 'off');

    // Allow-list ratchet report (design 5.3, A-6): an entry that suppresses fewer or more real hits than its
    // declared `count` is reported, not silently honoured or corrected - "an entry can only shrink".
    const allowIssues = (raw.allowReport || []).filter(e => e.status !== 'ok');
    for (const issue of allowIssues) {
        const where = `${issue.path} [${issue.rule}]`;
        if (issue.status === 'dead') {
            stderr(`plainkit audit: allow entry ${where} has no matching finding.`);
            stderr(`FIX: remove the dead allow entry for ${issue.rule} in ${issue.path}.`);
        } else {
            stderr(`plainkit audit: allow entry ${where} declares count ${issue.count}, but ${issue.actual} real hit${issue.actual === 1 ? '' : 's'} found.`);
            stderr(`FIX: set "count": ${issue.actual} for the ${issue.rule} allow entry in ${issue.path} (an allow entry can only shrink).`);
        }
    }

    // Baseline / ratchet (design 5.3, A-6): --update-baseline records today's findings and stops; otherwise a
    // baseline file (named explicitly, or the default when --strict-baseline opts in) suppresses only the
    // findings it already knows about, so a run fails only for something new.
    const baselineFile = opts.baseline
        ? path.resolve(cwd, opts.baseline)
        : (opts.updateBaseline || opts.strictBaseline) ? path.join(root, DEFAULT_BASELINE_NAME) : null;

    if (opts.updateBaseline) {
        writeBaseline(baselineFile, findings);
        if (!opts.quiet) stdout(`plainkit audit: baseline written to ${path.relative(cwd, baselineFile)} (${findings.length} finding${findings.length === 1 ? '' : 's'})`);
        return 0;
    }

    let staleBaseline = [];
    if (baselineFile) {
        let entries;
        try {
            entries = loadBaseline(baselineFile);
        } catch (err) {
            if (err instanceof BaselineError) {
                stderr(`plainkit audit: ${err.message}`);
                stderr(`FIX: fix ${path.relative(cwd, baselineFile)}, or regenerate it with --update-baseline.`);
                return 2;
            }
            throw err;
        }
        const applied = applyBaseline(findings, entries);
        findings = applied.visible;
        staleBaseline = applied.stale;
        if (!opts.quiet) {
            for (const entry of staleBaseline) {
                stdout(`plainkit audit: baseline entry fixed: ${entry.file} [${entry.rule}] no longer occurs - remove it from the baseline.`);
            }
        }
    }

    const errorsCount = findings.filter(f => f.severity === 'error').length;
    const warningsCount = findings.filter(f => f.severity === 'warn').length;

    const summary = {
        errors: errorsCount,
        warnings: warningsCount,
        files: files.length,
        seconds,
        mode,
        skippedRules: skippedRuleIds,
    };
    const skipped = { unsupported: skippedUnsupported, other: skippedOther };

    if (!opts.quiet) {
        if (opts.format === 'json') {
            stdout(formatJson(findings, summary, { version: packageVersion(), mode, parser: 'none', skipped }));
        } else if (opts.format === 'sarif') {
            stdout(formatSarif(findings, { version: packageVersion(), rules: RULES }));
        } else {
            stdout(formatText(findings, summary, { color: opts.color }));
        }
    }

    const overWarnings = opts.maxWarnings >= 0 && warningsCount > opts.maxWarnings;
    const staleBaselineFails = opts.strictBaseline && staleBaseline.length > 0;
    if (errorsCount > 0 || overWarnings || allowIssues.length > 0 || staleBaselineFails) return 1;
    return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    run(process.argv.slice(2)).then(code => process.exit(code));
}
