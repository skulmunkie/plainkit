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

/** The [name, fn] pairs to run. With neither list given, all of them. */
export function selectCases(cases, { filter = [], elements = [] } = {}) {
    if (!filter.length && !elements.length) return cases;
    return cases.filter(([name]) => {
        const n = String(name).toLowerCase();
        return filter.some(f => n.includes(f)) || elements.some(e => namesElement(name, e));
    });
}
