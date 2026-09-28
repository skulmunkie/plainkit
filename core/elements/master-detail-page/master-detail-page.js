import { showState } from '../../js/page-shell.js';
import { renderState } from '../../js/page-states.js';
import { loadElements } from '../../js/loader.js';

// Master and detail (#353): a pk-list-page beside (wide) or instead of (narrow) the record the ROUTE selected. The host owns `recordId`.
export default Base => class extends Base {
    connected() {
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
    // The record's handle is destroyed when the element leaves the page, so a route change never leaves its content running.
    disconnected() { this.stop(); }
    changed(name) { if (this.$w && this.isConnected && (name === 'config' || name === 'recordId')) this.sync(name === 'recordId'); }

    sync(moved) {
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
        const table = this.part('list').part?.('table');
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
