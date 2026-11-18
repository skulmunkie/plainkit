// Which browser cases a run keeps, for a targeted run (node scripts/attest-browser.mjs --filter a,b --elements x,y; the runner reads ?filter= and ?elements=).
// Pure, so node tests can import it. A case is kept when its name contains one of the filter substrings (case-insensitive), or names one of the elements
// as a whole word: "button: defaults" and "the pk-button focus ring" name `button`, "data-table: ..." does not name `table`.
export const parseList = text => String(text ?? '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function namesElement(caseName, element) {
    const e = String(element).trim().toLowerCase().replace(/^pk-/, '');
    if (!e) return false;
    return new RegExp(`(^|[^\\w-])(pk-)?${escapeRe(e)}(?![\\w-])`).test(String(caseName).toLowerCase());
}

/** "2/4" -> { k: 2, n: 4 } (1 <= k <= n), null when empty or malformed. */
export function parseShard(text) {
    const m = /^(\d+)\/(\d+)$/.exec(String(text ?? '').trim());
    return m && Number(m[1]) >= 1 && Number(m[1]) <= Number(m[2]) ? { k: Number(m[1]), n: Number(m[2]) } : null;
}

/** Shard k of n of a list: every n-th item starting at k (1-based). Disjoint, the shards together are the list, and neighbouring cases (the slow ones cluster by element) are spread. */
export const shardOf = (list, shard) => (shard ? list.filter((_, i) => i % shard.n === shard.k - 1) : list);

/** The [name, fn] pairs to run. With neither list given, all of them. */
export function selectCases(cases, { filter = [], elements = [] } = {}) {
    if (!filter.length && !elements.length) return cases;
    return cases.filter(([name]) => {
        const n = String(name).toLowerCase();
        return filter.some(f => n.includes(f)) || elements.some(e => namesElement(name, e));
    });
}
