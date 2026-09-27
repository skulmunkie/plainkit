import { mountChrome } from '../chrome.js';
mountChrome({ title: "Routed list and detail", page: "routed-list-detail", crumbs: [["Section", "page.html"]], actions: "<pk-dropdown placement=\"bottom-end\"><pk-button slot=\"trigger\" size=\"mini\">Actions</pk-button><pk-menu-item id=\"new-thing\">New thing</pk-menu-item></pk-dropdown>", fill: true });

// The route owns the page. #/things shows the list; #/things/2 and #/things/new show the same page with the record open. A real app uses its
// router's paths (/things, /things/2, /things/new) the same way: everything below is a function of the route, and the elements only report what
// the user did (pk-row-click, a tab, a sort, a page, Save, Cancel) so the handlers can change the route or the list state.
const workspace = document.getElementById('content');
const table = document.getElementById('things');
const tabs = document.getElementById('status-tabs');
const search = document.getElementById('search');
const pager = document.getElementById('pager');
const head = document.getElementById('detail-head');
const validation = document.querySelector('pk-form');
const form = document.getElementById('detail-form');

const NAMES = ['Blue widget', 'Red widget', 'Green gadget', 'Grey gadget', 'Yellow gizmo', 'Orange gizmo', 'Purple sprocket', 'Teal sprocket', 'Silver bracket', 'Copper hinge', 'Bronze latch', 'Steel bolt', 'Iron rivet', 'Tin can', 'Brass fitting', 'Nickel washer', 'Chrome trim', 'Zinc plate', 'Titanium frame', 'Aluminium panel'];
const STATUSES = ['Active', 'Draft', 'Archived'];
let things = NAMES.map((name, i) => ({ id: String(i + 1), name, status: STATUSES[i % STATUSES.length], updated: `Sep ${(i % 28) + 1}` }));

// pk-table is `manual` here: with a tab, a search box and a pager all narrowing the same list together, the table showing rows exactly as given
// (never re-sorting or re-filtering a page slice on its own) is what lets the three combine correctly. The table still owns the sort indicator
// and raises pk-sort when a header is clicked; this only decides what "clicked" means.
const PAGE_SIZE = 6;
const list = { status: 'all', search: '', sort: '', sortDir: 'ascending', page: 1 };

function visibleRows() {
    let rows = things;
    if (list.status !== 'all') rows = rows.filter(r => r.status === list.status);
    if (list.search) { const q = list.search.toLowerCase(); rows = rows.filter(r => r.name.toLowerCase().includes(q)); }
    if (list.sort) { const dir = list.sortDir === 'descending' ? -1 : 1; rows = [...rows].sort((a, b) => (a[list.sort] < b[list.sort] ? -dir : a[list.sort] > b[list.sort] ? dir : 0)); }
    return rows;
}
function renderList() {
    const rows = visibleRows();
    const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    list.page = Math.min(list.page, pages);
    table.rows = rows.slice((list.page - 1) * PAGE_SIZE, list.page * PAGE_SIZE);
    pager.page = list.page; pager.pages = pages; pager.total = rows.length; pager.pageSize = PAGE_SIZE;
}
tabs.addEventListener('pk-tab-change', e => { list.status = e.detail.value; list.page = 1; renderList(); });
search.addEventListener('input', () => { list.search = search.value; list.page = 1; renderList(); });
table.addEventListener('pk-sort', e => { list.sort = e.detail.key ?? ''; list.sortDir = e.detail.direction ?? 'ascending'; renderList(); });
pager.addEventListener('pk-page', e => { list.page = e.detail.page; renderList(); });

const route = () => { const [, id] = /^#\/things\/([^/]+)$/.exec(location.hash) ?? []; return id ?? null; };
const go = id => { location.hash = id ? `/things/${encodeURIComponent(id)}` : '/things'; };

// Route to screen: the aside opens when a record is active, the phone shows the list or the record, the tab and the header carry the record's name,
// the open row is marked in the table, and the form is filled once per record (a route change to the same record does not wipe what was typed).
let shown;
function render() {
    const id = route();
    const row = id && id !== 'new' ? things.find(r => r.id === id) : null;
    const name = id === 'new' ? 'New thing' : row?.name ?? (id ? 'Thing not found' : 'Thing');
    workspace.asideOpen = id !== null;
    workspace.activePane = id !== null ? 'aside' : 'main';
    workspace.asideLabel = name;
    head.heading = name;
    table.currentRow = row ? row.id : '';
    if (id !== shown) { shown = id; form.reset(); form.elements.name.value = row?.name ?? ''; form.elements.status.value = row?.status ?? 'Draft'; }
}

// The list: opening a row is a navigation, not a state change of its own.
table.addEventListener('pk-row-click', e => go(e.detail.id));
document.getElementById('new-thing').addEventListener('pk-select', () => go('new'));

// Back, close and Cancel leave the record. The phone strip's list tab does the same: the workspace announces the tab first (pk-pane-change is
// cancelable), so the handler keeps the pane the route asked for and changes the route instead; the route then sets the pane.
for (const id of ['detail-back', 'detail-close', 'detail-cancel']) document.getElementById(id).addEventListener('click', () => go(null));
workspace.addEventListener('pk-pane-change', e => { if (e.detail.pane === 'main' && route() !== null) { e.preventDefault(); go(null); } });

// Save: pk-form raises pk-valid when the browser's checks pass; the demo keeps the change in memory and returns to the list.
validation.addEventListener('pk-valid', () => {
    const id = route(); const data = new FormData(form); const name = String(data.get('name')); const status = String(data.get('status'));
    things = id === 'new' ? [...things, { id: String(things.length + 1), name, status, updated: 'Today' }] : things.map(r => (r.id === id ? { ...r, name, status, updated: 'Today' } : r));
    renderList();
    go(null);
});

// The elements load on demand: wait until the ones this page sets properties on are defined, then follow the route.
await Promise.all(['pk-workspace', 'pk-table', 'pk-page-header', 'pk-tabs', 'pk-pagination', 'pk-dropdown', 'pk-menu-item', 'pk-form', 'pk-input', 'pk-select'].map(tag => customElements.whenDefined(tag)));
window.addEventListener('hashchange', render);
renderList();
render();
