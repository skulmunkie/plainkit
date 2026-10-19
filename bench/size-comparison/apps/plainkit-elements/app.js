import { initPlainkit } from './plainkit/js/init.js';
import { EMAIL, MSG, PAGES, view } from './rows.js';

initPlainkit();

const $ = id => document.getElementById(id), table = $('t');
const state = { key: null, dir: null, page: 1 };
table.columns = [{ key: 'name', label: 'Name', sortable: true }, { key: 'role', label: 'Role' }, { key: 'score', label: 'Score', type: 'number', sortable: true }];
function draw() {
    table.rows = view(state.key, state.dir, state.page).map(r => ({ ...r, id: String(r.id) }));
    $('of').textContent = `Page ${state.page} of ${PAGES}`;
    $('prev').disabled = state.page === 1;
    $('next').disabled = state.page === PAGES;
}
table.addEventListener('pk-sort', e => {
    state.key = e.detail.direction ? e.detail.key : null;
    state.dir = e.detail.direction;
    table.sort = state.key ?? '';
    table.sortDir = state.dir ?? 'asc';
    draw();
});
$('prev').addEventListener('click', () => { state.page--; draw(); });
$('next').addEventListener('click', () => { state.page++; draw(); });
$('add').addEventListener('click', () => {
    const name = document.querySelector('[name=name]').value.trim(), email = document.querySelector('[name=email]').value.trim();
    $('fname').error = name ? '' : MSG.name;
    $('femail').error = EMAIL.test(email) ? '' : MSG.email;
    $('status').textContent = !name || !EMAIL.test(email) ? '' : `Saved ${name}.`;
});
$('delete').addEventListener('click', () => { $('status').textContent = 'List deleted.'; });
draw();
