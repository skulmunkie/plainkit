import { showState, showTitleBar } from '../../js/page-shell.js';
import { renderState } from '../../js/page-states.js';
import { loadElements } from '../../js/loader.js';

// Master and detail (#353): a pk-list-page beside (wide) or instead of (narrow) the record the ROUTE selected. The host owns `recordId`.
export default Base => class extends Base {
    connected() {
        // Static slotted mode (#1829, the convention in STANDARDS.md): the host wrote a list in slot=list and config has no list, so its list and record render as given, nothing is built, moved or written, and record-id only picks which pane a phone shows. Decided once, at connect.
        if (this.$static || (!this.$w && this.querySelector?.(':scope > [slot="list"]') && !this.config?.list)) { this.$static = true; this.menuOn(); this.view(); return; }
        if (!this.$w) {
            this.$w = true;
            const list = this.part('list');
            list.load = q => (typeof this.load === 'function' ? this.load(q) : { rows: [] });
            list.rowHref = row => this.open?.(row);
            this.part('back').addEventListener('click', () => this.close?.());
            loadElements(this.shadowRoot);
        }
        this.sync(true);
    }
    // Run load() again (the Blazor bridge sets it after the first draw).
    refresh() { if (this.$w && this.isConnected) this.part('list').refresh?.(); }
    // The record's handle is destroyed when the element leaves the page, so a route change never leaves its content running.
    disconnected() { this.stop(); if (this.$static) this.menuSet(false); }
    changed(name) {
        if (this.$static) { if (name === 'recordId') this.view(); return; }
        if (this.$w && this.isConnected && (name === 'config' || name === 'recordId')) this.sync(name === 'recordId');
    }
    // Static mode: the layout part (this element's own shadow tree) carries the state; the host's children are not touched.
    view() {
        const layout = this.part('layout');
        layout.dataset.static = '';
        layout.dataset.view = this.recordId ? 'detail' : 'list';
        if (!this.recordId) this.menuSet(false);
    }
    // Static mode on a phone: this shadow's own Menu button opens the author's list as a drawer (the one pane shown beside it is the record); a row chosen, Escape or the backdrop closes it.
    menuOn() {
        const btn = this.part('menu');
        btn.hidden = false;
        btn.controls = this.querySelector(':scope > [slot="list"]');
        if (this.$menuWired) return;
        this.$menuWired = true;
        loadElements(this.shadowRoot);
        btn.addEventListener('pk-toggle', e => this.menuSet(e.detail.pressed));
        this.part('backdrop').addEventListener('click', () => this.menuSet(false, true));
        this.addEventListener('keydown', e => { if (e.key === 'Escape' && this.part('layout').hasAttribute('data-menu')) this.menuSet(false, true); });
        this.addEventListener('click', e => { if (e.target.closest?.('[slot="list"] a, [slot="list"] button')) this.menuSet(false); });
    }
    menuSet(on, refocus) {
        const btn = this.part('menu');
        this.part('layout').toggleAttribute('data-menu', on);
        this.part('backdrop').hidden = !on;
        btn.pressed = on;
        if (on) this.querySelector(':scope > [slot="list"] a, :scope > [slot="list"] button')?.focus();
        else if (refocus) btn.focus();
    }

    sync(moved) {
        showTitleBar(this, this.part('header'));
        const c = this.config ?? {}, id = this.recordId || '', was = this.$id ?? '';
        this.part('list').config = c.list ?? {};
        this.part('back').textContent = '\u2190 ' + (c.backLabel ?? 'Back');
        this.part('layout').dataset.view = id ? 'detail' : 'list';
        const none = this.part('none');
        if (id) none.replaceChildren(); else { showState(none, 'empty', c.none ?? { heading: 'Select a record', description: 'Pick one from the list to see it here.' }); }
        if (id === was && !moved) return;
        this.$id = id;
        if (id) this.start(id);
        else { this.stop(); this.part('record').replaceChildren(); this.part('state').replaceChildren(); if (was) this.focusRow(was); }
    }
    // Back to the list: the row just left gets focus (the detail's own controls are gone on a phone), else the table.
    focusRow(id) {
        const sub = (el, n) => (typeof el?.part === 'function' ? el.part(n) : null), table = sub(sub(this.part('list'), 'table'), 'table'); // an element not upgraded yet has Element.part (a token list), not the method
        const row = table?.shadowRoot?.querySelector(`tbody tr[data-pk-context="${id.replace(/["\\]/g, '\\$&')}"]`);
        (row ?? table)?.focus?.();
    }
    stop() {
        this.$gen = (this.$gen ?? 0) + 1;
        const s = this.$stop;
        this.$stop = null;
        if (s) try { s(); } catch (err) { this.log.error('master-detail cleanup threw', err); }
    }
    async start(id) {
        this.stop();
        const gen = this.$gen, box = this.part('state'), pane = this.part('record');
        pane.replaceChildren();
        if (typeof this.mountDetail !== 'function') { renderState(box, 'ready'); return; }
        showState(box, 'loading', { label: this.config?.label });
        try {
            const out = await this.mountDetail(pane, id);
            const stop = typeof out === 'function' ? out : out?.destroy?.bind(out);
            if (gen !== this.$gen) { stop?.(); return; }
            this.$stop = stop ?? null;
            renderState(box, 'ready');
            this.part('detail').focus();
        } catch (err) {
            if (gen !== this.$gen) return;
            this.log.error('master-detail record failed', err);
            showState(box, 'error', { error: err, retry: () => this.start(id) });
        }
    }
};
