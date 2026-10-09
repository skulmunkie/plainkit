// The filter-table pattern, made live: pk-data-table owns the search, the status filter, the sort, the pager and the selection; this only supplies the rows
// through its load(query) callback (a real app calls its API here) and acts on the selection when a bulk button is pressed.
// mount(root) works on this sample's own DOM and returns { destroy() }.
import { createLogger } from '../../../js/log.js';
import { queryList } from '../../../js/list-query.js';

const log = createLogger('pattern:filter-table');
const STATUS = ['Active', 'Draft', 'Review'];

export default function mount(root) {
    const ac = new AbortController();
    const table = root.querySelector('[data-table]');
    if (!table) { log.warn('the filter-table sample needs a [data-table] pk-data-table', { root }); return { destroy() {} }; }
    let items = Array.from({ length: 23 }, (_, i) => ({ id: String(i + 1), name: `Item ${i + 1}`, status: STATUS[i % 3], amount: `$${(5 + i * 3.25).toFixed(2)}` }));
    let picked = [];
    table.load = q => queryList(items, { filter: q.filters?.status ? r => r.status === q.filters.status : null, search: q.search, searchKeys: ['name'], sort: q.sort, sortDir: q.sortDir, page: q.page, pageSize: q.pageSize });
    table.addEventListener('pk-select', e => { picked = e.detail.selected; }, { signal: ac.signal });
    // The bulk bar's Delete: the ids of the chosen rows (scope "all" would run the query on the server instead), then a reload.
    root.addEventListener('click', e => {
        if (!e.target.closest?.('[data-delete]') || !picked.length) return;
        items = items.filter(r => !picked.includes(r.id));
        picked = []; table.selected = []; table.refresh();
    }, { signal: ac.signal });
    return { destroy() { ac.abort(); table.load = null; } };
}
