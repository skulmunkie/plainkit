import { showState, showTitleBar } from '../../js/page-shell.js';
import { renderState } from '../../js/page-states.js';
import { loadElements } from '../../js/loader.js';

export default Base => class extends Base {
    connected() {
        if (!this.$w) {
            this.$w = true;
            this.$p = Object.fromEntries(['nav', 'main', 'aside'].map(p => [p, this.part(p)]));
            loadElements(this.shadowRoot);
        }
        this.sync();
        this.start();
    }
    // The consumer's mount(panes, ...) handle is destroyed when the element leaves the page, so a route change never leaves its content running.
    disconnected() { this.stop(); }
    changed(name) { if (name === 'config' && this.$w && this.isConnected) { this.sync(); this.start(); } }

    // Which panes exist is data: config.panes (default nav + main; main always exists). A pane not listed is taken out so pk-workspace hides its column.
    sync() {
        showTitleBar(this, this.part('header'));
        const c = this.config ?? {}, want = new Set(['main', ...(c.panes ?? ['nav'])]);
        const ws = this.part('workspace');
        for (const p of ['nav', 'aside']) { if (want.has(p)) ws.append(this.$p[p]); else this.$p[p].remove(); }
        for (const [k, v] of Object.entries(c)) if (/^(nav|main|aside)Label$/.test(k)) ws[k] = v;
        ws.asideOpen = want.has('aside') && c.asideOpen !== false;
        ws.toggleAttribute('fill', this.hasAttribute('fill'));
    }
    stop() {
        this.$gen = (this.$gen ?? 0) + 1;
        const s = this.$stop;
        this.$stop = null;
        if (s) try { s(); } catch (err) { this.log.error('workspace cleanup threw', err); }
    }
    async start() {
        this.stop();
        if (typeof this.mount !== 'function') return;
        const gen = this.$gen, box = this.part('state'), panes = {};
        for (const [p, el] of Object.entries(this.$p)) if (el.isConnected) { el.replaceChildren(); panes[p] = el; }
        showState(box, 'loading', { label: this.config?.label });
        try {
            const out = await this.mount(panes);
            const stop = typeof out === 'function' ? out : out?.destroy?.bind(out);
            if (gen !== this.$gen) { stop?.(); return; }
            this.$stop = stop ?? null;
            renderState(box, 'ready');
        } catch (err) {
            if (gen !== this.$gen) return;
            this.log.error('workspace mount failed', err);
            showState(box, 'error', { error: err, retry: () => this.start() });
        }
    }
};
