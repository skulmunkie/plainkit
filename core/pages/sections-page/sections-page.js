import { loadElements } from '../../js/loader.js';
import { showTitleBar } from '../../js/page-shell.js';
import { bindSections } from '../../js/page-sections.js';
import { paramGet } from '../../js/tab-param.js';
import { mediaBelow } from '../../js/breakpoints.js';

// A read-mostly record page: title bar, docked section tabs, a two-column layout of the host's panels. No load, save or dirty state (#2010).
// The host owns its panels; this shadow tree draws one pk-detail-layout section wrapper per config.sections entry around a named slot for each (as pk-settings-page does),
// config.tabsFrom ('phone' | 'tablet', #2084; default 'always' = one section at a time at every width) shows every section together above that width, the same vocabulary as pk-detail-layout and pk-page-header:
// a section with side: true then sits in the sidebar column (a status card), and below the width the strip returns and the page is as before. config.sticky / stickyFrom pin the title bar as pk-page-header does.
// because the layout finds its sections in its own light DOM, which a slotted host child is not part of.
export default Base => class extends Base {
    connected() {
        const layout = this.part('layout');
        this.$off = bindSections(this.part('tabs'), layout); // removed in disconnected(): the strip is inside this tree, but the observer and the pairing follow the host
        this.$mo ||= new MutationObserver(() => this.build());
        this.$mo.observe(this, { childList: true });
        if (!this.$w) {
            this.$w = true;
            loadElements(this.shadowRoot);
            layout.addEventListener('pk-section-change', e => { if (e.target === layout) { this.section = e.detail.section; queueMicrotask(() => this.bare()); } });
        }
        this.build();
    }
    disconnected() { this.$off?.(); this.$mo?.disconnect(); this.$mq?.removeEventListener('change', this.$sync); this.$mq = this.$from = null; }
    changed(name) { if (name === 'config') this.build(); else if (name === 'section' && this.$w) this.show(this.section); }

    // The ids the host gave a side card for (a child with slot="side-<id>"), so a section with none draws no empty summary column.
    build() {
        const cfg = this.config ?? {}, doc = this.ownerDocument, layout = this.part('layout'), strip = this.part('tabs');
        showTitleBar(this, this.part('header'));
        const from = ['phone', 'tablet'].includes(cfg.tabsFrom) ? cfg.tabsFrom : 'always', head = this.part('header');
        if (this.$from !== from) { this.$mq?.removeEventListener('change', this.$sync); this.$from = from; this.$mq = from === 'always' ? null : mediaBelow(from); this.$sync ??= () => this.build(); this.$mq?.addEventListener('change', this.$sync); }
        const narrow = from === 'always' || !!this.$mq?.matches;
        head.setAttribute('tabs-from', from); layout.setAttribute('tabs-from', from);
        head.toggleAttribute('sticky', !!(cfg.sticky || cfg.stickyFrom));
        if (['phone', 'tablet'].includes(cfg.stickyFrom)) head.setAttribute('sticky-from', cfg.stickyFrom); else head.removeAttribute('sticky-from');
        this.part('header').append(this.part('header').querySelector('slot[name="actions"]')); // the host's own actions after the config ones: the primary action comes first
        const sections = (cfg.sections ?? []).filter(s => s && s.id != null && s.visible !== false);
        const slots = [...this.children].map(c => c.slot).filter(Boolean);
        const sides = sections.filter(s => slots.includes('side-' + s.id)).map(s => s.id);
        const key = JSON.stringify([sections, sides, cfg.sidebarFirst, cfg.sidebarTwoUp, cfg.tabParam, narrow]);
        if (key === this.$key) return;
        this.$key = key; this.$sides = sides; this.$all = sections.some(s => s.side || sides.includes(s.id));
        for (const s of slots) if (/^(section|side)-/.test(s) && !sections.some(x => x.id === s.replace(/^(section|side)-/, ''))) this.warnOnce('slot:' + s, `a child with slot="${s}" matches no config.sections id: it is not shown`, { slot: s });
        const wrap = (id, label, count, side, name) => {
            const w = doc.createElement('div');
            w.dataset.pkSection = id; w.dataset.pkSectionLabel = label;
            if (count != null && count !== '') w.dataset.pkSectionCount = String(count);
            if (side) w.slot = 'sidebar';
            const slot = doc.createElement('slot');
            slot.name = (name ?? (side ? 'side-' : 'section-')) + id;
            w.append(slot);
            return w;
        };
        layout.replaceChildren(...sections.flatMap(s => [wrap(s.id, s.label ?? s.id, s.count, s.side && !narrow, s.side && !narrow ? 'section-' : undefined), ...(sides.includes(s.id) ? [wrap(s.id, s.label ?? s.id, s.count, true)] : [])]));
        layout.sidebarFirst = !!cfg.sidebarFirst; layout.sidebarTwoUp = !!cfg.sidebarTwoUp;
        if (cfg.tabParam) layout.setAttribute('tab-param', cfg.tabParam); else layout.removeAttribute('tab-param');
        strip.replaceChildren(...sections.map(s => { const t = doc.createElement('pk-tab'); t.value = s.id; t.textContent = s.label ?? s.id; if (s.count != null && s.count !== '') t.setAttribute('count', String(s.count)); return t; }));
        this.part('tabs').toggleAttribute('hidden', sections.length < 2);
        loadElements(strip);
        const ids = sections.map(s => s.id), win = doc.defaultView;
        const want = [cfg.tabParam && win ? paramGet(win, cfg.tabParam) : null, this.section, cfg.section].find(v => ids.includes(v)) ?? ids[0];
        if (want != null) this.show(want);
    }
    show(id) { this.part('layout').section = id; this.part('tabs').value = id; this.bare(); }
    // A section with no side card takes the full width (the layout keeps its sidebar column otherwise): the same hook pk-record-form uses.
    // Where every section shows together (tabsFrom, wide) the column stays while any section has a side card or is one.
    bare() { const l = this.part('layout'); l.toggleAttribute('data-bare', this.$mq && !this.$mq.matches ? !this.$all : !this.$sides?.includes(l.section)); }
};
