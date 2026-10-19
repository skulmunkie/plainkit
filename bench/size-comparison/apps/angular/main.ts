import { Component, ElementRef, signal, viewChild } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { EMAIL, MSG, PAGES, ROLES, view } from '../../shared/rows.js';

@Component({
    selector: 'app-root',
    template: `
    <main>
        <h1>Team directory</h1>
        <form novalidate (submit)="submit($event)">
            <label>Name<input name="name" />@if (errors().name) {<span class="err">{{ errors().name }}</span>}</label>
            <label>Email<input name="email" type="email" />@if (errors().email) {<span class="err">{{ errors().email }}</span>}</label>
            <label>Role<select name="role">@for (r of roles; track r) {<option>{{ r }}</option>}</select></label>
            <button type="submit">Add member</button>
            <p role="status">{{ status() }}</p>
        </form>
        <table>
            <thead><tr>
                <th><button type="button" (click)="toggle('name')">Name</button></th>
                <th>Role</th>
                <th><button type="button" (click)="toggle('score')">Score</button></th>
            </tr></thead>
            <tbody>@for (r of rows(); track r.id) {<tr><td>{{ r.name }}</td><td>{{ r.role }}</td><td>{{ r.score }}</td></tr>}</tbody>
        </table>
        <div class="pager">
            <button type="button" [disabled]="page() === 1" (click)="page.set(page() - 1)">Previous</button>
            <span>Page {{ page() }} of {{ pages }}</span>
            <button type="button" [disabled]="page() === pages" (click)="page.set(page() + 1)">Next</button>
        </div>
        <button type="button" (click)="dialog().nativeElement.showModal()">Delete list</button>
        <dialog #dlg>
            <h2>Delete the list?</h2>
            <p>This cannot be undone.</p>
            <button type="button" (click)="dialog().nativeElement.close()">Cancel</button>
            <button type="button" (click)="dialog().nativeElement.close(); status.set('List deleted.')">Delete</button>
        </dialog>
    </main>`,
})
class App {
    roles = ROLES;
    pages = PAGES;
    errors = signal<{ name?: string; email?: string }>({});
    status = signal('');
    sort = signal<{ key: string | null; dir: string | null }>({ key: null, dir: null });
    page = signal(1);
    dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dlg');
    rows() { return view(this.sort().key, this.sort().dir, this.page()); }
    submit(e: Event) {
        e.preventDefault();
        const f = new FormData(e.target as HTMLFormElement), name = String(f.get('name')).trim(), email = String(f.get('email')).trim();
        this.errors.set({ name: name ? '' : MSG.name, email: EMAIL.test(email) ? '' : MSG.email });
        this.status.set(!name || !EMAIL.test(email) ? '' : `Saved ${name}.`);
    }
    toggle(key: string) {
        const { key: k, dir } = this.sort();
        this.sort.set({ key, dir: k !== key ? 'asc' : dir === 'asc' ? 'desc' : dir === 'desc' ? null : 'asc' });
    }
}

bootstrapApplication(App);
