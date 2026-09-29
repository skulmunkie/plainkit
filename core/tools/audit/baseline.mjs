// Baseline (ratchet) file: `plainkit.audit.baseline.json` (design section 5.3, slice A-6). Lets an existing
// app adopt the audit with CI green on day one: `--update-baseline` records today's findings, and a later run
// fails only for a finding that is not in the baseline. The fingerprint is rule id + normalised offending text
// + file path - never the line number, so moving code does not resurface an already-known finding.
//
// This module has no engine or CLI knowledge: it only turns findings into fingerprints and a baseline file into
// a lookup, so it stays as pure and dependency-free as the rest of core/tools/audit (design section 11).
import fs from 'node:fs';
import crypto from 'node:crypto';

export const DEFAULT_BASELINE_NAME = 'plainkit.audit.baseline.json';
const BASELINE_VERSION = 1;

export class BaselineError extends Error {}

// Normalises the message the same way regardless of surrounding whitespace, so wrapping or reflowing a fix
// message never changes the fingerprint.
function normalize(message) {
    return String(message ?? '').replace(/\s+/g, ' ').trim();
}

export function fingerprint(finding) {
    const key = `${finding.rule}\u0000${normalize(finding.message)}\u0000${finding.file}`;
    return crypto.createHash('sha1').update(key).digest('hex').slice(0, 16);
}

// Reads a baseline file. A missing file is not an error (an empty baseline): `--baseline` names a file the
// project may not have created yet only when combined with `--update-baseline`, which creates it.
export function loadBaseline(file) {
    if (!fs.existsSync(file)) return [];
    let raw;
    try {
        raw = fs.readFileSync(file, 'utf8');
    } catch (err) {
        throw new BaselineError(`cannot read baseline file: ${err.message}`);
    }
    let json;
    try {
        json = JSON.parse(raw);
    } catch (err) {
        throw new BaselineError(`"${file}" is not valid JSON: ${err.message}`);
    }
    if (!json || typeof json !== 'object' || !Array.isArray(json.entries)) {
        throw new BaselineError(`"${file}" must be a baseline object with an "entries" array`);
    }
    for (const entry of json.entries) {
        if (!entry || typeof entry.rule !== 'string' || typeof entry.file !== 'string' || typeof entry.fingerprint !== 'string') {
            throw new BaselineError(`"${file}" has a malformed entry (needs rule, file, fingerprint)`);
        }
    }
    return json.entries;
}

// Writes one entry per finding, sorted for a stable, reviewable diff.
export function writeBaseline(file, findings) {
    const entries = findings
        .map(f => ({ rule: f.rule, file: f.file, fingerprint: fingerprint(f) }))
        .sort((a, b) => (a.file === b.file ? (a.rule < b.rule ? -1 : a.rule > b.rule ? 1 : 0) : a.file < b.file ? -1 : 1));
    fs.writeFileSync(file, JSON.stringify({ version: BASELINE_VERSION, entries }, null, 2) + '\n');
    return entries;
}

// Splits findings into `visible` (not covered by the baseline: what the run should still fail on) and reports
// which baseline entries no longer match anything found (`stale`: "fixed, remove it" per design 5.3).
export function applyBaseline(findings, entries) {
    const known = new Set(entries.map(e => `${e.rule}\u0000${e.file}\u0000${e.fingerprint}`));
    const matched = new Set();
    const visible = [];
    for (const f of findings) {
        const fp = fingerprint(f);
        const key = `${f.rule}\u0000${f.file}\u0000${fp}`;
        if (known.has(key)) {
            matched.add(key);
        } else {
            visible.push(f);
        }
    }
    const stale = entries.filter(e => !matched.has(`${e.rule}\u0000${e.file}\u0000${e.fingerprint}`));
    return { visible, stale };
}
