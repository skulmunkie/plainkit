// Pure strict-module rule engine (#515 V2-1, this slice #605): checkFiles(files, options) -> findings.
// No fs access, no globals, no repository-path assumptions, so the same engine runs unmodified against this
// repository's own modules (ruleset "module") and, later, against a consumer's own source (rulesets "consumer",
// "consumer-strict"; docs/superpowers/specs/2026-09-28-conformance-audit-cli-design.md, section 1).
//
// Rule shape: { id, applies(file) -> boolean, scan(file) -> [{ line, column, message, fix }], meta? }
//   - `file` is `{ path, text }`.
//   - `meta` is the rule's documentation (category, severity per ruleset, doc anchor, examples): a later PR
//     renders it into `--explain` output and the generated skill references. This engine only carries it
//     through onto each finding so no second lookup table is ever needed.
// This file adds no rule content (S1-S12, D/P/T/A/B families land in later PRs); it is the plumbing only:
// a named-ruleset registry, `checkFiles`, and the allow-list ratchet.

const rulesets = new Map();

// Rule families register their rules under a name ("module", "consumer", "consumer-strict", ...) once, at
// import time, so `checkFiles({ ruleset: 'module' })` needs no wiring beyond importing the family's module.
export function registerRuleset(name, rules) {
    if (typeof name !== 'string' || !name) throw new Error('registerRuleset: name must be a non-empty string');
    if (!Array.isArray(rules)) throw new Error(`registerRuleset(${name}): rules must be an array`);
    rulesets.set(name, rules);
}

export function getRuleset(name) {
    return rulesets.get(name) ?? [];
}

// Test-only: rulesets are process-wide state, so tests that register a fixture ruleset can clean up after themselves.
export function resetRulesets() {
    rulesets.clear();
}

function resolveRules(options) {
    if (Array.isArray(options.rules)) return options.rules;
    return getRuleset(options.ruleset ?? 'module');
}

// Allow-list ratchet (design section 5.3): an entry suppresses up to `count` real hits of `rule` in `path`.
// `describeAllow` reports the caller-level "stale"/"dead" concern the CLI surfaces (#629 A-6): an entry whose
// real hit count no longer matches its declared `count` (fewer hits: lower the count; zero hits: dead entry,
// remove it). It never changes which findings are suppressed - only `applyAllow` does that, unconditionally
// honouring the declared budget - so a stale entry is reported, not silently corrected.
//
// `scannedPaths`, when given, is the set of file paths this run actually scanned (config discovery walks up
// from cwd, so a config can be found by a run that targets only part of the tree it covers - a narrower `path`
// argument, or another tool's own fixture directory, see #518 A-10b). An entry whose file was never part of
// this run is not evaluated at all (neither "ok" nor "dead"): there is nothing to say about a file nobody
// looked at, and reporting one "dead" would fail every unrelated run that happens to share the same config.
export function describeAllow(rawFindings, allow, scannedPaths) {
    if (!allow || !allow.length) return [];
    const counts = new Map();
    for (const f of rawFindings) {
        const key = `${f.rule}\u0000${f.file}`;
        counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return allow
        .filter(entry => !scannedPaths || scannedPaths.has(entry.path))
        .map(entry => {
            const actual = counts.get(`${entry.rule}\u0000${entry.path}`) ?? 0;
            const want = entry.count ?? 0;
            const status = actual === want ? 'ok' : actual === 0 ? 'dead' : 'stale';
            return { ...entry, actual, status };
        });
}

function applyAllow(findings, allow) {
    if (!allow || !allow.length) return findings;
    const budgets = new Map();
    for (const entry of allow) budgets.set(`${entry.rule}\u0000${entry.path}`, entry.count ?? 0);
    const kept = [];
    for (const finding of findings) {
        const key = `${finding.rule}\u0000${finding.file}`;
        const remaining = budgets.get(key);
        if (remaining > 0) {
            budgets.set(key, remaining - 1);
            continue;
        }
        kept.push(finding);
    }
    return kept;
}

export function checkFiles(files, options = {}) {
    if (!Array.isArray(files)) throw new Error('checkFiles: files must be an array of { path, text }');
    const rules = resolveRules(options);
    const findings = [];
    for (const file of files) {
        if (!file || typeof file.path !== 'string' || typeof file.text !== 'string') {
            throw new Error('checkFiles: each file needs a string path and a string text');
        }
        for (const rule of rules) {
            if (typeof rule.applies === 'function' && !rule.applies(file)) continue;
            const hits = rule.scan(file) || [];
            for (const hit of hits) {
                findings.push({
                    rule: rule.id,
                    file: file.path,
                    line: hit.line ?? 1,
                    column: hit.column ?? 1,
                    message: hit.message ?? '',
                    fix: hit.fix ?? '',
                    ...(rule.meta ? { meta: rule.meta } : {}),
                });
            }
        }
    }
    findings.sort((a, b) => (a.file === b.file ? a.line - b.line : a.file < b.file ? -1 : 1));
    const kept = applyAllow(findings, options.allow);
    // Attached as a non-enumerable property rather than returned as a second value, so existing callers that
    // treat the result as a plain findings array (every test before A-6, including `assert.deepEqual` against
    // a plain array) keep working unchanged; the CLI's allow-status report (A-6) reads this property when it
    // wants to report a stale or dead allow entry.
    Object.defineProperty(kept, 'allowReport', { value: describeAllow(findings, options.allow, new Set(files.map(f => f.path))), enumerable: false });
    return kept;
}
