import '@shoelace-style/shoelace/dist/themes/light.css';
import '@shoelace-style/shoelace/dist/components/button/button.js';
import '@shoelace-style/shoelace/dist/components/dialog/dialog.js';
import '@shoelace-style/shoelace/dist/components/input/input.js';
import '@shoelace-style/shoelace/dist/components/option/option.js';
import '@shoelace-style/shoelace/dist/components/select/select.js';
import { EMAIL, MSG, PAGES, ROLES, view } from '../../shared/rows.js';
import '../../shared/page.css';

const state = { sort: { key: null, dir: null }, page: 1 };
document.getElementById('root').innerHTML = `<main>
    <h1>Team directory</h1>
    <form novalidate id="f">
        <sl-input name="name" label="Name"></sl-input>
        <sl-input name="email" label="Email" type="email"></sl-input>
        <sl-select name="role" label="Role" value="${ROLES[0]}">${ROLES.map(r => `<sl-option value="${r}">${r}</sl-option>`).join('')}</sl-select>
        <sl-button type="submit" variant="primary">Add member</sl-button>
        <p role="status" id="status"></p>
    </form>
    <table>
        <thead><tr>
            <th><sl-button size="small" data-sort="name">Name</sl-button></th>
            <th>Role</th>
            <th><sl-button size="small" data-sort="score">Score</sl-button></th>
        </tr></thead>
        <tbody id="rows"></tbody>
    </table>
    <div class="pager">
        <sl-button id="prev">Previous</sl-button>
        <span id="of"></span>
        <sl-button id="next">Next</sl-button>
    </div>
    <sl-button id="open">Delete list</sl-button>
    <sl-dialog id="dlg" label="Delete the list?">
        <p>This cannot be undone.</p>
        <sl-button slot="footer" id="cancel">Cancel</sl-button>
        <sl-button slot="footer" id="delete" variant="primary">Delete</sl-button>
    </sl-dialog>
</main>`;

const $ = id => document.getElementById(id), f = $('f'), dlg = $('dlg');
function draw() {
    $('rows').replaceChildren(...view(state.sort.key, state.sort.dir, state.page).map(r => { const tr = document.createElement('tr'); tr.innerHTML = `<td>${r.name}</td><td>${r.role}</td><td>${r.score}</td>`; return tr; }));
    $('of').textContent = `Page ${state.page} of ${PAGES}`;
    $('prev').disabled = state.page === 1;
    $('next').disabled = state.page === PAGES;
}
f.addEventListener('submit', e => {
    e.preventDefault();
    const name = f.elements.name.value.trim(), email = f.elements.email.value.trim();
    f.elements.name.helpText = name ? '' : MSG.name;
    f.elements.email.helpText = EMAIL.test(email) ? '' : MSG.email;
    $('status').textContent = !name || !EMAIL.test(email) ? '' : `Saved ${name}.`;
});
for (const b of document.querySelectorAll('[data-sort]')) b.addEventListener('click', () => {
    const { key, dir } = state.sort, k = b.dataset.sort;
    state.sort = { key: k, dir: k !== key ? 'asc' : dir === 'asc' ? 'desc' : dir === 'desc' ? null : 'asc' };
    draw();
});
$('prev').addEventListener('click', () => { state.page--; draw(); });
$('next').addEventListener('click', () => { state.page++; draw(); });
$('open').addEventListener('click', () => dlg.show());
$('cancel').addEventListener('click', () => dlg.hide());
$('delete').addEventListener('click', () => { dlg.hide(); $('status').textContent = 'List deleted.'; });
draw();
