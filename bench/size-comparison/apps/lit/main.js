import { LitElement, html } from 'lit';
import { EMAIL, MSG, PAGES, ROLES, view } from '../../shared/rows.js';
import '../../shared/page.css';

// Light DOM (createRenderRoot returns this) so the shared page.css styles it, as it does for the other stacks.
class TeamDirectory extends LitElement {
    static properties = { errors: { state: true }, status: { state: true }, sort: { state: true }, page: { state: true } };
    constructor() { super(); this.errors = {}; this.status = ''; this.sort = { key: null, dir: null }; this.page = 1; }
    createRenderRoot() { return this; }
    submit(e) {
        e.preventDefault();
        const f = new FormData(e.target), name = String(f.get('name')).trim(), email = String(f.get('email')).trim();
        this.errors = { name: name ? '' : MSG.name, email: EMAIL.test(email) ? '' : MSG.email };
        this.status = this.errors.name || this.errors.email ? '' : `Saved ${name}.`;
    }
    toggle(key) {
        const { key: k, dir } = this.sort;
        this.sort = { key, dir: k !== key ? 'asc' : dir === 'asc' ? 'desc' : dir === 'desc' ? null : 'asc' };
    }
    render() {
        const e = this.errors, dialog = () => this.querySelector('dialog');
        return html`<main>
            <h1>Team directory</h1>
            <form novalidate @submit=${this.submit}>
                <label>Name<input name="name" />${e.name ? html`<span class="err">${e.name}</span>` : ''}</label>
                <label>Email<input name="email" type="email" />${e.email ? html`<span class="err">${e.email}</span>` : ''}</label>
                <label>Role<select name="role">${ROLES.map(r => html`<option>${r}</option>`)}</select></label>
                <button type="submit">Add member</button>
                <p role="status">${this.status}</p>
            </form>
            <table>
                <thead><tr>
                    <th><button type="button" @click=${() => this.toggle('name')}>Name</button></th>
                    <th>Role</th>
                    <th><button type="button" @click=${() => this.toggle('score')}>Score</button></th>
                </tr></thead>
                <tbody>${view(this.sort.key, this.sort.dir, this.page).map(r => html`<tr><td>${r.name}</td><td>${r.role}</td><td>${r.score}</td></tr>`)}</tbody>
            </table>
            <div class="pager">
                <button type="button" ?disabled=${this.page === 1} @click=${() => this.page--}>Previous</button>
                <span>Page ${this.page} of ${PAGES}</span>
                <button type="button" ?disabled=${this.page === PAGES} @click=${() => this.page++}>Next</button>
            </div>
            <button type="button" @click=${() => dialog().showModal()}>Delete list</button>
            <dialog>
                <h2>Delete the list?</h2>
                <p>This cannot be undone.</p>
                <button type="button" @click=${() => dialog().close()}>Cancel</button>
                <button type="button" @click=${() => { dialog().close(); this.status = 'List deleted.'; }}>Delete</button>
            </dialog>
        </main>`;
    }
}
customElements.define('team-directory', TeamDirectory);
