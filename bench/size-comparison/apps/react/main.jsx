import { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { EMAIL, MSG, PAGES, ROLES, view } from '../../shared/rows.js';
import '../../shared/page.css';

function App() {
    const [errors, setErrors] = useState({});
    const [status, setStatus] = useState('');
    const [sort, setSort] = useState({ key: null, dir: null });
    const [page, setPage] = useState(1);
    const dialog = useRef(null);
    const submit = e => {
        e.preventDefault();
        const f = new FormData(e.target), name = String(f.get('name')).trim(), email = String(f.get('email')).trim();
        const next = {};
        if (!name) next.name = MSG.name;
        if (!EMAIL.test(email)) next.email = MSG.email;
        setErrors(next);
        setStatus(Object.keys(next).length ? '' : `Saved ${name}.`);
    };
    const toggle = key => setSort(s => ({ key, dir: s.key !== key ? 'asc' : s.dir === 'asc' ? 'desc' : s.dir === 'desc' ? null : 'asc' }));
    return (
        <main>
            <h1>Team directory</h1>
            <form noValidate onSubmit={submit}>
                <label>Name<input name="name" />{errors.name && <span className="err">{errors.name}</span>}</label>
                <label>Email<input name="email" type="email" />{errors.email && <span className="err">{errors.email}</span>}</label>
                <label>Role<select name="role">{ROLES.map(r => <option key={r}>{r}</option>)}</select></label>
                <button type="submit">Add member</button>
                <p role="status">{status}</p>
            </form>
            <table>
                <thead><tr>
                    <th><button type="button" onClick={() => toggle('name')}>Name</button></th>
                    <th>Role</th>
                    <th><button type="button" onClick={() => toggle('score')}>Score</button></th>
                </tr></thead>
                <tbody>{view(sort.key, sort.dir, page).map(r => <tr key={r.id}><td>{r.name}</td><td>{r.role}</td><td>{r.score}</td></tr>)}</tbody>
            </table>
            <div className="pager">
                <button type="button" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</button>
                <span>Page {page} of {PAGES}</span>
                <button type="button" disabled={page === PAGES} onClick={() => setPage(page + 1)}>Next</button>
            </div>
            <button type="button" onClick={() => dialog.current.showModal()}>Delete list</button>
            <dialog ref={dialog}>
                <h2>Delete the list?</h2>
                <p>This cannot be undone.</p>
                <button type="button" onClick={() => dialog.current.close()}>Cancel</button>
                <button type="button" onClick={() => { dialog.current.close(); setStatus('List deleted.'); }}>Delete</button>
            </dialog>
        </main>
    );
}

createRoot(document.getElementById('root')).render(<App />);
