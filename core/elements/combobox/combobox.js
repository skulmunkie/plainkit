// pk-combobox behaviour (see meta.json for the API).
export function filterOptions(labels, query) {
    const q = String(query ?? '').trim().toLowerCase();
    return labels.map(l => q === '' || l.toLowerCase().includes(q));
}
export function nextIndex(current, count, key) {
    if (count === 0) return -1;
    if (key === 'Home') return 0;
    if (key === 'End') return count - 1;
    if (key === 'ArrowDown') return current < 0 ? 0 : (current + 1) % count;
    if (key === 'ArrowUp') return current < 0 ? count - 1 : (current - 1 + count) % count;
    return current;
}
export function typeaheadIndex(labels, buffer, from = -1) {
    const b = buffer.toLowerCase(); const len = labels.length;
    for (let n = 1; n <= len; n++) { const i = (((from + n) % len) + len) % len; if (labels[i].toLowerCase().startsWith(b)) return i; }
    return -1;
}

export default Base => class extends Base {
    connected() {
        if (this.$init) return;
        this.$init = true; this.$initial = this.value; this.$opts = true; this.$type = { text: '', at: 0 };
        const rebuild = () => { this.$opts = true; this.requestUpdate(); };
        this.watchSlot('', rebuild);
        new MutationObserver(rebuild).observe(this,{ childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['value', 'disabled', 'label'] });
        const inp = this.part('control'), tr = this.part('trigger'), pop = this.part('popup');
        inp.addEventListener('input', () => { this.$typing = true; this.$query = inp.value; if (this.free) this.value = inp.value; this.setOpen(true); this.emit('pk-combo-query', { query: inp.value }); this.filter(); });
        inp.addEventListener('click', () => { if (!this.open) this.show(); });
        tr.addEventListener('click', () => { if (this.open) this.hide(); else this.show(); });
        pop.addEventListener('mousedown', e => e.preventDefault());
        pop.addEventListener('click', e => { const o = e.target.closest('.op'); if (o && o.getAttribute('aria-disabled') !== 'true') this.pick(o); });
        this.addEventListener('focusout', e => {
            const rt = e.relatedTarget;
            if (rt && (rt === this || this.contains(rt))) return;
            this.hide();
            if (this.mode !== 'select' && !this.free) { this.$typing = false; this.requestUpdate(); }
        });
        this.addEventListener('keydown', e => this.keys(e));
    }
    ops() { return [...this.part('popup').querySelectorAll('.op')]; }
    live() { return this.ops().filter(o => !o.hidden && o.getAttribute('aria-disabled') !== 'true'); }
    ctl() { return this.mode === 'select' ? this.part('trigger') : this.part('control'); }
    chosen() { return this.ops().find(o => o.dataset.value === this.value && this.value !== ''); }
    highlight(op) {
        for (const o of this.ops()) o.classList.toggle('hl', o === op);
        if (op) { this.ctl().setAttribute('aria-activedescendant', op.id); op.scrollIntoView?.({ block: 'nearest' }); } else this.ctl().removeAttribute('aria-activedescendant');
    }
    // The one way the element opens or closes itself: it says so, so a host that mirrors `open` hears it.
    setOpen(open) { if (this.open !== open) this.emit('pk-combo-toggle', { open: this.open = open }, { cancelable: false }); }
    show() { this.$query = ''; this.setOpen(true); this.filter(); const c = this.chosen(); this.highlight(c?.hidden ? null : c); }
    hide() { this.setOpen(false); this.highlight(null); }
    filter() {
        const ops = this.ops();
        if (this.filtering === 'off') return;
        const match = this.mode === 'select' ? ops.map(() => true) : filterOptions(ops.map(o => o.textContent), this.$query);
        ops.forEach((o, i) => { o.hidden = !match[i]; });
        this.part('empty').hidden = match.some(Boolean);
        this.highlight(this.live()[0] ?? null);
    }
    pick(op) {
        this.$typing = false; this.value = op.dataset.value;
        this.hide(); this.ctl().focus();
        this.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
        this.emit('pk-combo-select', { value: this.value, label: op.textContent });
    }
    keys(e) {
        const src = e.composedPath()[0];
        if (src !== this.part('control') && src !== this.part('trigger')) return;
        const select = this.mode === 'select', items = this.live(), at = items.findIndex(o => o.classList.contains('hl')), k = e.key;
        if (k === 'ArrowDown' || k === 'ArrowUp' || (select && this.open && (k === 'Home' || k === 'End'))) {
            e.preventDefault();
            if (!this.open) { this.show(); if (!this.chosen()) this.highlight(this.live()[k === 'ArrowUp' ? this.live().length - 1 : 0] ?? null); } else this.highlight(items[nextIndex(at, items.length, k)]);
        } else if (k === 'Enter' || select && k === ' ') {
            if (this.open && at >= 0) { e.preventDefault(); this.pick(items[at]); } else if (select) { e.preventDefault(); if (this.open) this.hide(); else this.show(); }
        } else if (k === 'Escape' && this.open) { e.preventDefault(); e.stopPropagation(); this.hide(); }
        else if (k === 'Tab') this.hide();
        else if (select && k.length === 1 && k !== ' ') {
            const t = this.$type, now = Date.now(), buffer =now - t.at < 700 ? t.text + k : k;
            this.$type = { text: buffer, at: now };
            const cur = at >= 0 ? at : items.indexOf(this.chosen());
            const i = typeaheadIndex(items.map(o => o.textContent), buffer, buffer.length > 1 ? cur - 1 : cur);
            if (i < 0) return;
            if (this.open) this.highlight(items[i]); else this.pick(items[i]);
        }
    }
    updated() {
        const pop = this.part('popup'), inp = this.part('control'), tr = this.part('trigger');
        if (this.$opts ?? true) {
            this.$opts = false;
            for (const o of this.ops()) o.remove();
            const tpl = this.shadowRoot.querySelector('template');
            [...this.children].filter(c => c.localName === 'option').forEach((c, i) => {
                const el = tpl.content.firstElementChild.cloneNode(true);
                el.id = `o${i}`; el.dataset.value = c.getAttribute('value') ?? c.textContent.trim(); el.textContent = c.textContent.trim();
                if (c.disabled) el.setAttribute('aria-disabled', 'true');
                pop.insertBefore(el, this.part('empty'));
            });
            if (this.open && this.$query && this.mode !== 'select') this.filter();
        }
        const chosen = this.chosen();
        for (const o of this.ops()) o.setAttribute('aria-selected', String(o === chosen));
        if (this.mode === 'select') { tr.textContent = chosen ? chosen.textContent : ''; tr.dataset.placeholder = this.placeholder; }
        else if (!this.$typing) inp.value = chosen ? chosen.textContent : this.free ? this.value : '';
        pop.hidden = !this.open;
        for (const c of [inp, tr]) c.setAttribute('aria-expanded', String(this.open));
        if (this.open) { const b = this.ctl().getBoundingClientRect(); const h = pop.getBoundingClientRect().height; pop.dataset.placement = innerHeight - b.bottom < h && b.top > innerHeight - b.bottom ? 'top' : 'bottom'; }
        this.setValidity(this.required && this.value === '' ? { valueMissing: true } : {}, 'Choose an option.', this.ctl());
        this.setFormValue(this.value);
    }
    onReset() { this.value = this.$initial ?? ''; this.$typing = false; }
    onRestore(state) { this.value = state ?? ''; }
    focus(o) { this.ctl().focus(o); }
};
