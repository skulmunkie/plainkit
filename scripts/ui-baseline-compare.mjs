// Compares freshly rendered shot hashes with the baseline manifest (docs/superpowers/specs/2026-10-27-ui-review-baseline-design.md, sections 2 and 3).
//
//   node scripts/ui-baseline-compare.mjs <manifest.txt> <part.txt> [more parts...] [--rerun <part.txt>]
//
// prints a markdown line per changed, new or unstable shot and a count line. Names the parts do not mention are ignored (a partial run, a shard or a pull
// request's selection renders only some shots), so "removed" is never decided here. --rerun is a second render of the same tree: a changed shot whose hash
// differs again is "unstable", not changed.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { mergeParts, parsePart } from './ui-review-baseline.mjs';

/**
 * compare(manifestText, partsText, { rerunText }) -> { same, changed, new, unstable, chromeMismatch }
 * `partsText` is one part's text or an array of them (merged first). same: [name]; changed: [{ name, before, after }]; new: [{ name, after }]; unstable: [{ name, before, after, again }].
 * A manifest built by another Chrome major gives { chromeMismatch: message } and no classification; a header-only manifest (chrome=unknown) matches any browser.
 */
export function compare(manifestText, partsText, { rerunText = null } = {}) {
    const result = { same: [], changed: [], new: [], unstable: [], chromeMismatch: null };
    const base = parsePart(manifestText);
    const parts = parsePart(Array.isArray(partsText) ? mergeParts(partsText) : partsText);
    if (base.chrome !== 'unknown' && parts.chrome !== base.chrome) {
        result.chromeMismatch = `baseline built with another browser (chrome=${base.chrome}, this render chrome=${parts.chrome}): the comparison is skipped`;
        return result;
    }
    const before = new Map(base.entries);
    const again = rerunText ? new Map(parsePart(rerunText).entries) : null;
    for (const [name, after] of parts.entries) {
        if (!before.has(name)) result.new.push({ name, after });
        else if (before.get(name) === after) result.same.push(name);
        else if (again && again.has(name) && again.get(name) !== after) result.unstable.push({ name, before: before.get(name), after, again: again.get(name) });
        else result.changed.push({ name, before: before.get(name), after });
    }
    return result;
}

/** The markdown lines of a result: one per changed, new and unstable shot, then a count line. */
export function rows(r) {
    if (r.chromeMismatch) return [r.chromeMismatch];
    return [
        ...r.changed.map(c => `| changed | ${c.name} | ${c.before} | ${c.after} |`),
        ...r.new.map(c => `| new | ${c.name} | - | ${c.after} |`),
        ...r.unstable.map(c => `| unstable | ${c.name} | ${c.before} | ${c.after} / ${c.again} |`),
        `${r.same.length} same, ${r.changed.length} changed, ${r.new.length} new, ${r.unstable.length} unstable`,
    ];
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    const args = process.argv.slice(2), files = [];
    let rerun = null;
    for (let i = 0; i < args.length; i++) { if (args[i] === '--rerun') rerun = args[++i]; else files.push(args[i]); }
    if (files.length < 2) { console.error('usage: ui-baseline-compare.mjs <manifest.txt> <part.txt>... [--rerun <part.txt>]'); process.exit(2); }
    const read = f => fs.readFileSync(f, 'utf8');
    try {
        const r = compare(read(files[0]), files.slice(1).map(read), { rerunText: rerun ? read(rerun) : null });
        console.log(rows(r).join('\n'));
    } catch (e) { console.error(e.message); process.exit(2); }
}
