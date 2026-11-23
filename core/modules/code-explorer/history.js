// Back / forward history of opened locations ({ path, line }) for the code explorer: a stack with a cursor.
// Pure and framework-free. A new push drops the forward entries; an identical consecutive location is not repeated;
// the oldest entries fall off past `cap`.

const same = (a, b) => a.path === b.path && (a.line ?? null) === (b.line ?? null);

export function createHistory(cap = 50) {
    let items = [];
    let at = -1;
    return {
        push(loc) {
            const next = { path: loc.path, line: loc.line ?? null };
            if (at >= 0 && same(items[at], next)) return;
            items = items.slice(0, at + 1);
            items.push(next);
            if (items.length > cap) items.shift();
            at = items.length - 1;
        },
        // Record where the reader is now (e.g. a clicked line) without adding an entry.
        replace(loc) { if (at >= 0 && items[at].path === loc.path) items[at] = { path: loc.path, line: loc.line ?? null }; },
        back() { if (at <= 0) return null; at -= 1; return { ...items[at] }; },
        forward() { if (at >= items.length - 1) return null; at += 1; return { ...items[at] }; },
        get canBack() { return at > 0; },
        get canForward() { return at >= 0 && at < items.length - 1; },
        get current() { return at >= 0 ? { ...items[at] } : null; },
        get size() { return items.length; },
    };
}
