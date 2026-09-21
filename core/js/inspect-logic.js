// Pure logic behind the dev tools' Quality and Inspector panels: turning findings into a score and table rows, and describing an
// element for the inspector. No DOM beyond the small element interface (localName, attributes, getBoundingClientRect), so node tests cover it.

export const PENALTY = Object.freeze({ error: 25, warn: 8 });

// 0-100: 100 minus a penalty per distinct finding (the same check on the same selector counts once), floor 0.
export function pageScore(findings, penalty = PENALTY) {
    const seen = new Set();
    let total = 0;
    for (const f of findings) {
        const key = `${f.check}|${f.selector}`;
        if (seen.has(key)) continue;
        seen.add(key);
        total += penalty[f.severity] ?? 0;
    }
    return Math.max(0, 100 - total);
}

// 'positive' | 'warning' | 'critical' for pk-stat, from a score.
export const scoreTone = s => (s >= 80 ? 'positive' : s >= 55 ? 'warning' : 'critical');

// Findings as table rows, errors first then by check, each with the number of times it was found.
export function findingRows(findings) {
    const map = new Map();
    for (const f of findings) {
        const key = `${f.check}|${f.selector}`;
        const row = map.get(key) ?? { check: f.check, severity: f.severity, category: f.category, selector: f.selector, message: f.message, count: 0 };
        row.count++;
        map.set(key, row);
    }
    const rank = { error: 0, warn: 1 };
    return [...map.values()]
        .sort((a, b) => (rank[a.severity] ?? 2) - (rank[b.severity] ?? 2) || a.check.localeCompare(b.check) || a.selector.localeCompare(b.selector))
        .map((r, id) => ({ id, ...r }));
}

const SKIP_ATTRS = new Set(['class', 'style', 'slot', 'id']);

// What an inspector row shows for an element: its tag, domId (its own id attribute), the attributes that set it up (not class/style/slot) and its size.
export function describeForInspector(el) {
    const r = el.getBoundingClientRect();
    const props = [...el.attributes].filter(a => !SKIP_ATTRS.has(a.name)).map(a => (a.value === '' ? a.name : `${a.name}=${a.value}`)).join(' ');
    return { tag: el.localName, domId: el.id || '', props: props.length > 90 ? `${props.slice(0, 89)}…` : props, size: `${Math.round(r.width)} x ${Math.round(r.height)}`, visible: r.width > 0 && r.height > 0 };
}
