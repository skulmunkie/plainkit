// A generic filter/search/sort/paginate computation for a list page (a status tab, a search box, a sortable table, a pager, all narrowing the
// same rows together). Pure: no DOM, works on any array of plain objects - not just Plainkit's own samples. It does the work a `manual` pk-table
// otherwise leaves to the host: pk-table only shows rows exactly as given, so something has to compute what "as given" means for this page.
//
//   const state = { filter: r => r.status === 'Active', search: 'widget', searchKeys: ['name'], sort: 'name', sortDir: 'ascending', page: 1, pageSize: 25 };
//   const result = queryList(rows, state);   // { rows: <this page's slice>, total, pages, page (clamped into range) }

/** `state.filter(row)` narrows first (a status tab, any predicate); `state.search` then narrows further by substring match over `state.searchKeys`
 * (case-insensitive, missing or non-string fields treated as empty); `state.sort` then orders by that key (`state.sortDir`: 'ascending' the
 * default, or 'descending'), text-compared with `<`/`>` (a numeric or date field sorts correctly only if its values compare correctly that way,
 * for example already-zero-padded numbers or ISO dates - format the field for that before calling, the way pk-table's own `type` option does).
 * `state.page` is clamped into [1, pages] (an out-of-range page, from a filter that shrank the result after the page was chosen, still returns a
 * page), and `state.pageSize` must be a positive number. */
export function queryList(rows, state = {}) {
    const { filter, search, searchKeys, sort, sortDir = 'ascending', page = 1, pageSize = 25 } = state;
    let out = filter ? rows.filter(filter) : rows;
    if (search && searchKeys?.length) {
        const q = search.toLowerCase();
        out = out.filter(row => searchKeys.some(key => String(row[key] ?? '').toLowerCase().includes(q)));
    }
    if (sort) {
        const dir = sortDir === 'descending' ? -1 : 1;
        out = [...out].sort((a, b) => (a[sort] < b[sort] ? -dir : a[sort] > b[sort] ? dir : 0));
    }
    const total = out.length;
    const pages = Math.max(1, Math.ceil(total / pageSize));
    const clampedPage = Math.min(Math.max(1, page), pages);
    return { rows: out.slice((clampedPage - 1) * pageSize, clampedPage * pageSize), total, pages, page: clampedPage };
}
