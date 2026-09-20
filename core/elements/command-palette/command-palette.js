import { fuzzyMatch, rank, pushRecent, sections, highlight, safeHref, isPaletteShortcut } from '../../js/palette-logic.js';
export { fuzzyMatch, rank, pushRecent, sections, highlight, safeHref, isPaletteShortcut };

import { syncDialog, wireDialog, nextIndex, safeLink } from '../../js/menu-logic.js';

const store = { read(key) { try { return JSON.parse(localStorage.getItem(key) ?? '[]'); } catch { return []; } }, write(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* storage blocked */ } } };
const el = (tag, part, text) => { const e = document.createElement(tag); if (part) e.setAttribute('part', part); if (text) e.textContent = text; return e; };

// pk-command-palette: Ctrl/Cmd+K opens a native modal dialog; type to filter, arrows and Enter to run. `items` is a property, not an attribute.
export default Base => class extends Base {
    constructor() { super(); this.$items = []; this.$rows = []; this.$a = 0; }
    get items() { return this.$items; }
    set items(v) { this.$items = Array.isArray(v) ? v : []; if (this.isConnected) this.paint(); }
    connected() {
        const dlg = this.part('dialog'); const input = this.part('input');
        if (!this.$w) {
            this.$w = true;
            wireDialog(this, dlg, { backdrop: () => true });
            input.addEventListener('input', () => { this.$a = 0; this.paint(); });
            input.addEventListener('keydown', e => this.key(e));
            const list = this.part('list');
            list.addEventListener('pointermove', e => { const r = e.target.closest('[role="option"]'); if (r) this.active(Number(r.dataset.i)); });
            list.addEventListener('click', e => { const r = e.target.closest('[role="option"]'); if (r) this.run(this.$rows[Number(r.dataset.i)]); });
            this.$k = e => { if (!this.noShortcut && isPaletteShortcut(e)) { e.preventDefault(); this.open = !this.open; } };
        }
        document.addEventListener('keydown', this.$k);
        syncDialog(this, dlg);
    }
    disconnected() { document.removeEventListener('keydown', this.$k); const d = this.part('dialog'); if (d.open) d.close(); }
    changed(name) { if (name === 'open') { if (this.open) { this.part('input').value = ''; this.$a = 0; this.paint(); } syncDialog(this, this.part('dialog')); if (this.open) requestAnimationFrame(() => this.part('input').focus()); } }
    show() { this.open = true; }
    hide() { if (this.emit('pk-close', { reason: 'method' })) this.open = false; }
    paint() {
        const list = this.part('list'); const q = this.part('input').value;
        const recents = this.recentsKey ? store.read(this.recentsKey) : [];
        this.$rows = []; const frag = [];
        for (const s of sections(this.$items, q, recents)) {
            if (s.title) { const g = el('div', 'group', s.title); g.setAttribute('role', 'presentation'); frag.push(g); }
            for (const r of s.results) {
                const i = this.$rows.push(r.item) - 1;
                const row = el('div', 'option'); row.id = `pk-palette-${i}`; row.dataset.i = String(i); row.setAttribute('role', 'option');
                for (const run of highlight(r.item.label, r.indexes)) { if (run.match) row.append(el('mark', null, run.text)); else row.append(document.createTextNode(run.text)); }
                const side = r.item.shortcut ?? r.item.hint; if (side) row.append(el('small', null, side));
                frag.push(row);
            }
        }
        list.replaceChildren(...frag);
        this.part('empty').hidden = this.$rows.length > 0;
        this.part('status').textContent = this.$rows.length ? `${this.$rows.length} results` : 'No results';
        this.active(Math.min(this.$a, this.$rows.length - 1));
    }
    active(i) {
        this.$a = Math.max(0, i);
        const input = this.part('input');
        for (const r of this.part('list').querySelectorAll('[role="option"]')) r.toggleAttribute('data-active', Number(r.dataset.i) === this.$a);
        const cur = this.part('list').querySelector(`#pk-palette-${this.$a}`);
        if (cur) { input.setAttribute('aria-activedescendant', cur.id); cur.scrollIntoView({ block: 'nearest' }); } else input.removeAttribute('aria-activedescendant');
    }
    key(e) {
        const n = this.$rows.length;
        if (e.key === 'Enter') { e.preventDefault(); this.run(this.$rows[this.$a]); return; }
        const to = nextIndex(this.$a, n, e.key === 'Home' || e.key === 'End' ? (e.ctrlKey ? e.key : '') : e.key);
        if (to !== null) { e.preventDefault(); this.active(to); }
    }
    run(item) {
        if (!item) return;
        const go = safeLink(item.href);
        if (this.recentsKey) store.write(this.recentsKey, pushRecent(store.read(this.recentsKey), item.id));
        const proceed = this.emit('pk-select', { item });
        this.open = false;
        if (proceed && go) location.assign(go);
    }
};
