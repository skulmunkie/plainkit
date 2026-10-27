// The content-hash baseline files of the UI review (docs/superpowers/specs/2026-10-27-ui-review-baseline-design.md, section 2). Pure helpers, no I/O.
//
//   baseline-part.txt / baseline.txt   "# ui-baseline v1 chrome=<major>", then one line per shot: <shot name><TAB><first 16 hex of the sha256 of the PNG bytes>
//   baseline.units.txt                 "# ui-baseline-units v1 chrome=<major>", then <shot name><TAB><the render cache's unit key of the unit that made the shot>
//
// Lines are sorted by name, separated by CRLF, and end with one. A shard writes a part; the merge joins parts and refuses one name with two values.
import { createHash } from 'node:crypto';

export const BASELINE_VERSION = 'v1';
const EOL = '\r\n';

/** First 16 hex characters of the sha256 of some bytes. */
export const shotHash = bytes => createHash('sha256').update(bytes).digest('hex').slice(0, 16);

/** The major version in a DevTools product string ("Chrome/130.0.6723.58" gives "130"); "unknown" when there is none. */
export const chromeMajor = product => /\/(\d+)\./.exec(String(product ?? ''))?.[1] ?? 'unknown';

/** A shot name is the PNG's basename without its extension. */
export const shotNameOf = file => String(file).replace(/\.png$/i, '');

const headerOf = (kind, chrome) => `# ${kind} ${BASELINE_VERSION} chrome=${chrome}`;

/** The text of a part: `entries` is [[name, value], ...] (any order, duplicates of the same pair collapse; a name with two values throws). */
export function formatPart(entries, { chrome, kind = 'ui-baseline' }) {
    const byName = new Map();
    for (const [name, value] of entries) {
        if (byName.has(name) && byName.get(name) !== value) throw new Error(`the shot ${name} has two values (${byName.get(name)} and ${value}): the render is not deterministic or two units write one name`);
        byName.set(name, value);
    }
    const lines = [...byName].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([n, v]) => `${n}\t${v}`);
    return [headerOf(kind, chrome), ...lines].join(EOL) + EOL;
}

/** { chrome, entries: [[name, value], ...] } of a part's text; throws on a missing header or a line without a tab. */
export function parsePart(text, { kind = 'ui-baseline' } = {}) {
    const lines = String(text).split(/\r?\n/).filter(l => l !== '');
    const m = new RegExp(`^# ${kind} ${BASELINE_VERSION} chrome=(\S+)$`).exec(lines[0] ?? '');
    if (!m) throw new Error(`not a ${kind} ${BASELINE_VERSION} file: the first line is "${lines[0] ?? ''}"`);
    const entries = lines.slice(1).map(l => {
        const [name, value, ...more] = l.split('\t');
        if (!name || !value || more.length) throw new Error(`malformed line "${l}": expected <name><TAB><value>`);
        return [name, value];
    });
    return { chrome: m[1], entries };
}

/** The merge of several parts' texts (the shards of one run) as one text: sorted, deduplicated; one name with two values, or parts from two browsers, throws. */
export function mergeParts(texts, opts = {}) {
    const parsed = texts.map(t => parsePart(t, opts));
    const chromes = [...new Set(parsed.map(p => p.chrome))];
    if (chromes.length > 1) throw new Error(`the parts were rendered by different browsers (chrome=${chromes.join(', ')})`);
    return formatPart(parsed.flatMap(p => p.entries), { chrome: chromes[0] ?? 'unknown', kind: opts.kind });
}

/** The units text for the shots just rendered. */
export const formatUnits = (entries, chrome) => formatPart(entries, { chrome, kind: 'ui-baseline-units' });
