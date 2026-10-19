<script>
    import { EMAIL, MSG, PAGES, ROLES, view } from '../../shared/rows.js';

    let errors = $state({ name: '', email: '' });
    let status = $state('');
    let sort = $state({ key: null, dir: null });
    let page = $state(1);
    let dialog;
    const rows = $derived(view(sort.key, sort.dir, page));
    function submit(e) {
        e.preventDefault();
        const f = new FormData(e.target), name = String(f.get('name')).trim(), email = String(f.get('email')).trim();
        errors = { name: name ? '' : MSG.name, email: EMAIL.test(email) ? '' : MSG.email };
        status = errors.name || errors.email ? '' : `Saved ${name}.`;
    }
    function toggle(key) {
        sort = { key, dir: sort.key !== key ? 'asc' : sort.dir === 'asc' ? 'desc' : sort.dir === 'desc' ? null : 'asc' };
    }
</script>

<main>
    <h1>Team directory</h1>
    <form novalidate onsubmit={submit}>
        <label>Name<input name="name" />{#if errors.name}<span class="err">{errors.name}</span>{/if}</label>
        <label>Email<input name="email" type="email" />{#if errors.email}<span class="err">{errors.email}</span>{/if}</label>
        <label>Role<select name="role">{#each ROLES as r}<option>{r}</option>{/each}</select></label>
        <button type="submit">Add member</button>
        <p role="status">{status}</p>
    </form>
    <table>
        <thead><tr>
            <th><button type="button" onclick={() => toggle('name')}>Name</button></th>
            <th>Role</th>
            <th><button type="button" onclick={() => toggle('score')}>Score</button></th>
        </tr></thead>
        <tbody>{#each rows as r (r.id)}<tr><td>{r.name}</td><td>{r.role}</td><td>{r.score}</td></tr>{/each}</tbody>
    </table>
    <div class="pager">
        <button type="button" disabled={page === 1} onclick={() => page--}>Previous</button>
        <span>Page {page} of {PAGES}</span>
        <button type="button" disabled={page === PAGES} onclick={() => page++}>Next</button>
    </div>
    <button type="button" onclick={() => dialog.showModal()}>Delete list</button>
    <dialog bind:this={dialog}>
        <h2>Delete the list?</h2>
        <p>This cannot be undone.</p>
        <button type="button" onclick={() => dialog.close()}>Cancel</button>
        <button type="button" onclick={() => { dialog.close(); status = 'List deleted.'; }}>Delete</button>
    </dialog>
</main>
