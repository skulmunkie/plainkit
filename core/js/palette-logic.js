// Plainkit command palette logic: fuzzy matching, ranking, grouping and recents. Pure, so it can be tested without a DOM.
// The element (<pk-command-palette>) opens on Ctrl/Cmd+K, filters its items as you type and fires "pk-select".
//
// Item: { id, label, group?, hint?, keywords?: string, href?, shortcut? }. Ranking prefers a match at the start of a word,
// consecutive letters, and an earlier match; a label match beats a keywords-only match.

export const MAX_RECENTS = 5;
export const RECENTS_GROUP = 'Recent';

// Subsequence match of `query` in `text`. Returns { score, indexes } (indexes are the matched character positions, for highlighting)
// or null when the letters do not appear in order. Case-insensitive; whitespace in the query is ignored.
export function fuzzyMatch(query, text) {
    const q = query.toLowerCase().replace(/\s+/g, '');
    const t = text.toLowerCase();
    if (!q) return { score: 0, indexes: [] };
    const indexes = [];
    const run = { score: t.startsWith(q) ? 10 : 0, from: 0, prev: -2 };
    for (const ch of q) {
        const at = t.indexOf(ch, run.from);
        if (at === -1) return null;
        const wordStart = at === 0 || /[\s\-_/.:]/.test(t[at - 1]);
        run.score += 1 + (wordStart ? 6 : 0) + (at === run.prev + 1 ? 5 : 0) - Math.min(at * 0.05, 2);
        indexes.push(at); run.prev = at; run.from = at + 1;
    }
    return { score: run.score, indexes };
}

const labelOf = item => item.label ?? '';

// Items that match, best first (ties keep their original order). Each result: { item, score, indexes } with indexes into the label.
export function rank(items, query) {
    const q = query.trim();
    if (!q) return items.map(item => ({ item, score: 0, indexes: [] }));
    const out = [];
    items.forEach((item, order) => {
        const m = fuzzyMatch(q, labelOf(item));
        if (m) { out.push({ item, score: m.score + 4, indexes: m.indexes, order }); return; }
        const k = item.keywords ? fuzzyMatch(q, item.keywords) : null;
        const g = item.group?.toLowerCase().includes(q.toLowerCase()) ? { score: 1 } : null;
        const alt = k ?? g;
        if (alt) out.push({ item, score: alt.score, indexes: [], order });
    });
    return out.sort((a, b) => b.score - a.score || a.order - b.order).map(({ order, ...r }) => r);
}

// Adds an id to the front of the recents, once, capped.
export function pushRecent(recents, id, max = MAX_RECENTS) {
    return [id, ...recents.filter(r => r !== id)].slice(0, max);
}

// The sections to show. With no query: recents first (when known items exist for them), then every group in the order it first appears.
// With a query: one flat ranked section with no heading, so the best match is on top whatever its group.
export function sections(items, query, recents = []) {
    if (query.trim()) return [{ title: null, results: rank(items, query) }];
    const byId = new Map(items.map(i => [i.id, i]));
    const out = [];
    const recent = recents.map(id => byId.get(id)).filter(Boolean);
    if (recent.length) out.push({ title: RECENTS_GROUP, results: recent.map(item => ({ item, score: 0, indexes: [] })) });
    const order = []; const groups = new Map();
    for (const item of items) {
        const g = item.group ?? '';
        if (!groups.has(g)) { groups.set(g, []); order.push(g); }
        groups.get(g).push({ item, score: 0, indexes: [] });
    }
    for (const g of order) out.push({ title: g || null, results: groups.get(g) });
    return out;
}

// Splits a label into runs of { text, match } for highlighting, from the matched indexes.
export function highlight(label, indexes) {
    const marked = new Set(indexes);
    const runs = [];
    [...label].forEach((ch, i) => {
        const match = marked.has(i);
        if (runs.length && runs[runs.length - 1].match === match) runs[runs.length - 1].text += ch; else runs.push({ text: ch, match });
    });
    return runs;
}

// Only a same-site path or an http(s) URL may be navigated to; any other scheme is ignored.
export function safeHref(href) {
    if (typeof href !== 'string' || !href) return null;
    if (/^[\w+.-]+:/.test(href) && !/^https?:/i.test(href)) return null;
    return href;
}

// Whether a key event is the palette shortcut: Ctrl+K or Cmd+K, no other modifier.
export const isPaletteShortcut = e => !!((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && (e.key === 'k' || e.key === 'K'));
