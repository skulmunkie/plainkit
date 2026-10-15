// Route curation for a composed dashboard (#1294, design 2026-10-13-module-dashboard-design.md section 7). Pure; used by dashboard-compose.js.
//   order: ['module:key', ...] lists those widgets first in that order, the rest follow by contribution `order`, module position, declaration order.
//   allow: keeps only the listed ids; deny: drops the listed ids (deny wins). Curation runs after the access checks (`can`) and never adds a widget a module did not offer.
// A malformed list throws a TypeError; a well-formed id no contribution offers for the surface warns once and is ignored.
const ID = /^[a-z][a-z0-9-]*:[a-z][a-z0-9-]*$/;

export function curate(route, fail, warnOnce) {
    const list = name => {
        const v = route[name];
        if (v === undefined) return undefined;
        if (!Array.isArray(v) || !v.every(s => typeof s === 'string' && ID.test(s)) || new Set(v).size !== v.length) fail(`route.${name}`, 'must be an array of distinct "module:key" strings');
        return v;
    };
    const order = list('order') ?? [], allow = list('allow'), deny = list('deny') ?? [];
    const rank = id => { const n = order.indexOf(id); return n < 0 ? order.length : n; };
    // found: [{ pos, i, w }] of the visible widgets; offered: every `module:key` offered for the surface (hidden or not). Answers the sorted widgets.
    return (found, offered) => {
        for (const id of new Set([...order, ...(allow ?? []), ...deny])) if (!offered.has(id)) warnOnce(`cur:${id}`, `dashboard "${route.surface}": "${id}" in order/allow/deny is not offered by any module for this surface, ignored`);
        return found.filter(f => !deny.includes(f.w.id) && (!allow || allow.includes(f.w.id)))
            .sort((a, b) => rank(a.w.id) - rank(b.w.id) || a.w.order - b.w.order || a.pos - b.pos || a.i - b.i).map(f => f.w);
    };
}
