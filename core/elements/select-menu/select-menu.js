import { place, autoUpdate, onOutside, unplace } from '../../js/positioning.js';
import { nextIndex, typeaheadIndex, typeaheadBuffer } from '../../js/menu-logic.js';

// pk-select-menu: a single-choice listbox that reads its native <option> children; form-associated.
const ids = { n: 0 };
export default Base => class extends Base {
    connected() {
        if (!this.$w) {
            this.$w = true; this.$id = ++ids.n; this.$s = { buffer: '', at: 0 }; this.$a = -1;
            const trig = this.part('trigger'); const list = this.part('list');
            trig.addEventListener('click', () => (this.open ? this.close('toggle') : (this.open = true)));
            trig.addEventListener('keydown', e => this.key(e));
            list.addEventListener('pointerdown', e => e.preventDefault());
            list.addEventListener('click', e => { const o = e.target.closest('[role="option"]'); if (o) this.choose(this.$opts[Number(o.dataset.i)]); });
            list.addEventListener('pointermove', e => { const o = e.target.closest('[role="option"]'); if (o) this.active(Number(o.dataset.i)); });
            this.watchSlot('', () => this.build());
            this.$m = new MutationObserver(() => this.build()); this.$m.observe(this, { childList: true, subtree: true, characterData: true, attributes: true });
        }
        this.list = this.part('list');
        this.part('list').id = `pk-select-menu-list-${this.$id}`;
        this.part('trigger').setAttribute('aria-controls', this.part('list').id);
        this.build(); this.apply();
    }
    disconnected() { this.stop(); }
    changed(name) { if (name === 'open') this.apply(); else if (name === 'value') this.build(); else if (name === 'disabled') this.part('trigger').disabled = this.disabled; }
    get $opts() { return [...this.children].filter(c => c.localName === 'option').map(o => ({ value: o.value, label: o.textContent.trim(), disabled: o.disabled })); }
    show() { this.open = true; }
    hide() { this.open = false; }
    build() {
        const list = this.part('list'); const opts = this.$opts;
        list.replaceChildren(...opts.map((o, i) => {
            const d = document.createElement('div');
            d.setAttribute('part', 'option'); d.setAttribute('role', 'option'); d.id = `${list.id}-${i}`; d.dataset.i = String(i);
            d.setAttribute('aria-selected', String(o.value === this.value)); if (o.disabled) d.setAttribute('aria-disabled', 'true');
            d.textContent = o.label; return d;
        }));
        const cur = opts.find(o => o.value === this.value);
        this.part('value').textContent = cur ? cur.label : this.placeholder;
        this.setFormValue(this.value);
        if (this.required && !this.value) this.setValidity({ valueMissing: true }, 'Select an option.', this.part('trigger')); else this.setValidity({});
        this.aria({ role: 'group' });
        this.part('trigger').setAttribute('aria-expanded', String(this.open));
    }
    apply() {
        this.stop();
        const list = this.part('list'); const trig = this.part('trigger');
        trig.setAttribute('aria-expanded', String(this.open));
        if (!this.open) { unplace(list); trig.removeAttribute('aria-activedescendant'); return; }
        list.style.minWidth = `${trig.getBoundingClientRect().width}px`;
        place(trig, list, { placement: 'bottom-start', offset: 4 });
        this.$u = autoUpdate(trig, list, { placement: 'bottom-start', offset: 4 });
        this.$o = onOutside([this], e => this.close(e.type === 'keydown' ? 'escape' : 'outside'));
        this.active(Math.max(0, this.$opts.findIndex(o => o.value === this.value)));
        this.emit('pk-open', null);
    }
    stop() { this.$u?.(); this.$o?.(); this.$u = this.$o = null; }
    close(reason) { if (this.emit('pk-close', { reason })) { this.open = false; if (reason !== 'outside') this.part('trigger').focus({ preventScroll: true }); } }
    active(i) {
        this.$a = i;
        for (const o of this.part('list').children) o.toggleAttribute('data-active', Number(o.dataset.i) === i);
        const el = this.part('list').children[i];
        if (el) { this.part('trigger').setAttribute('aria-activedescendant', el.id); el.scrollIntoView({ block: 'nearest' }); }
    }
    choose(o) {
        if (!o || o.disabled) return;
        const previous = this.value;
        if (o.value !== previous && !this.emit('pk-change', { value: o.value, label: o.label, previous })) return;
        this.value = o.value; this.build(); this.close('select');
    }
    key(e) {
        const opts = this.$opts.map((o, i) => ({ ...o, i })).filter(o => !o.disabled);
        const at = opts.findIndex(o => o.i === this.$a);
        if (!this.open) { if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); this.open = true; } return; }
        if (e.key === 'Escape') return; // onOutside closes it and returns focus
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.choose(this.$opts[this.$a]); return; }
        if (e.key === 'Tab') { this.close('tab'); return; }
        const to = nextIndex(at, opts.length, e.key);
        if (to !== null) { e.preventDefault(); this.active(opts[to].i); return; }
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
            const now = Date.now(); this.$s.buffer = typeaheadBuffer(this.$s.buffer, e.key, now - this.$s.at); this.$s.at = now;
            const hit = typeaheadIndex(opts.map(o => o.label), at, this.$s.buffer); if (hit >= 0) this.active(opts[hit].i);
        }
    }
    onReset() { this.value = ''; this.build(); }
    onRestore(v) { this.value = v ?? ''; }
};
