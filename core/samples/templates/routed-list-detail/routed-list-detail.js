import { mountChrome } from '../chrome.js';
import { queryList } from '../../../js/list-query.js';
// Icon-only, like the shell's own Search trigger: `icon` + `label` gives it its accessible name ("Actions") without a visible text label.
mountChrome({ title: "Workspace list and record", page: "routed-list-detail", crumbs: [["Section", "page.html"]], actions: "<pk-dropdown placement=\"bottom-end\"><pk-button slot=\"trigger\" variant=\"ghost\" size=\"mini\" icon label=\"Actions\"><pk-icon slot=\"start\" name=\"more\"></pk-icon></pk-button><pk-menu-item id=\"new-thing\">New thing</pk-menu-item></pk-dropdown>", fill: true });

// The route owns the page. #/things shows the list; #/things/2 and #/things/new show the same page with the record open. A real app uses its
// router's paths (/things, /things/2, /things/new) the same way: everything below is a function of the route, and the elements only report what
// the user did (pk-row-click, Save, Cancel) so the handlers can change the route or the list state.
const workspace = document.getElementById('content');
const table = document.getElementById('things');
const head = document.getElementById('detail-head');
const validation = document.querySelector('pk-form');
const form = document.getElementById('detail-form');

// 1000 rows (not a handful): the point of sticky-header plus a pager is moot over a page that never needs to scroll or page on its own.
const ADJ = ['Blue', 'Red', 'Green', 'Grey', 'Yellow', 'Orange', 'Purple', 'Teal', 'Silver', 'Copper', 'Bronze', 'Steel', 'Iron', 'Brass', 'Nickel', 'Chrome', 'Zinc', 'Titanium', 'Aluminium', 'Golden'];
const NOUN = ['widget', 'gadget', 'gizmo', 'sprocket', 'bracket', 'hinge', 'latch', 'bolt', 'rivet', 'fitting', 'washer', 'trim', 'plate', 'frame', 'panel', 'valve', 'coupler', 'bushing', 'spindle', 'clamp'];
const STATUSES = ['Active', 'Draft', 'Archived'];
const ROW_COUNT = 1000;
let things = Array.from({ length: ROW_COUNT }, (_, i) => ({
    id: String(i + 1), name: `${ADJ[i % ADJ.length]} ${NOUN[Math.floor(i / ADJ.length) % NOUN.length]} ${Math.floor(i / (ADJ.length * NOUN.length)) + 1}`,
    status: STATUSES[i % STATUSES.length], updated: `Sep ${(i % 28) + 1}`,
}));

// pk-data-table owns the query (search, status filter, sort, pager) and the states; this only answers load(query) from js/list-query.js (a generic
// filter/search/sort/paginate function) and asks for a reload after a save.
table.load = q => queryList(things, { filter: q.filters?.status ? row => row.status === q.filters.status : null, search: q.search, searchKeys: ['name'], sort: q.sort, sortDir: q.sortDir, page: q.page, pageSize: q.pageSize });

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
    table.refresh();
    go(null);
});

// The elements load on demand: wait until the ones this page sets properties on are defined, then follow the route.
await Promise.all(['pk-workspace', 'pk-data-table', 'pk-page-header', 'pk-dropdown', 'pk-menu-item', 'pk-form', 'pk-input', 'pk-select'].map(tag => customElements.whenDefined(tag)));
window.addEventListener('hashchange', render);
render();
