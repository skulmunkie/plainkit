// pk-dock behaviour: renders a dock-tree layout (js/dock-model.js) with pk-splitter for every split and pk-tabs for every group of panels, and turns a resize or a tab
// choice into a pk-layout-change. Panels are the host's own children: any element with slot="<panel id>" (and data-heading, data-group hints). They are slotted, never moved,
// so a panel keeps its state wherever it is docked. The layout logic lives in the model; this file only draws it. Below the phone breakpoint the tree is drawn as one
// tab strip of every panel and the layout is left untouched.
import { mediaBelow } from '../../js/breakpoints.js';
import { loadElements } from '../../js/loader.js';
import { defaultLayout, fromJson, resize, activate, groups, toJson } from '../../js/dock-model.js';

const PANEL = /^[a-z][\w-]{0,39}$/;

// Pure: the panels a host declares, from its child elements: [{ id, title, group }] in DOM order; a child without a usable slot name or with a repeated one is not a panel.
export function readPanels(children) {
    const seen = new Set(), out = [];
    for (const c of children) {
        const id = c.getAttribute?.('slot');
        if (!id || !PANEL.test(id) || seen.has(id)) continue;
        seen.add(id);
        out.push({ id, title: c.getAttribute('data-heading') || id, group: c.getAttribute('data-group') || 'center' });
    }
    return out;
}

// Pure: every open panel in tree reading order (start before end), the order of the phone strip.
export const readingOrder = doc => groups(doc).flatMap(g => g.panels);

const make = (doc, tag, attrs = {}) => { const e = doc.createElement(tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); return e; };

export default Base => class extends Base {
    connected() {
        if (!this.$init) {
            this.$init = true;
            const root = this.part('root');
            root.addEventListener('pk-resize', e => this.onResize(e));
            root.addEventListener('pk-tab-change', e => this.onTab(e));
            this.$mo = new MutationObserver(() => this.requestUpdate());
            if (typeof matchMedia === 'function') { this.$mq = mediaBelow('phone'); this.$mqf = () => this.requestUpdate(); }
        }
        this.$mo.observe(this, { childList: true, attributes: true, attributeFilter: ['slot', 'data-heading', 'data-group'] });
        this.$mq?.addEventListener('change', this.$mqf);
    }
    disconnected() { this.$mo?.disconnect(); this.$mq?.removeEventListener('change', this.$mqf); }
    updated() {
        const panels = readPanels(this.children), phone = Boolean(this.$mq?.matches);
        const key = JSON.stringify(panels) + phone;
        if (this.layout === this.$given && key === this.$key) return;
        const first = !this.$doc, own = this.layout === this.$given;
        const source = own ? this.$doc && toJson(this.$doc) : this.layout;
        const r = source == null ? { doc: defaultLayout(panels), problems: [] } : fromJson(source, { panels });
        for (const p of r.problems) this.warnOnce(`${p.code}:${p.path}`, p.message, { code: p.code });
        const repaired = !first && own && toJson(r.doc) !== toJson(this.$doc);
        this.$doc = this.$applied = r.doc; this.$given = this.layout; this.$key = key; this.$titles = new Map(panels.map(p => [p.id, p.title]));
        this.draw(phone);
        if (repaired) this.commit('panels');
    }
    // Free-running by default: the proposed doc is applied straight away. A host that wants every change to round-trip first (Blazor's controlled
    // mode, #592) sets confirmLayout(arg) as a callback property, the same way pk-tool-page's run is set from script (STANDARDS.md: a callback is
    // not config data). arg is { layout: <JSON string>, reason }; the settled result (a JSON string to apply, or null/undefined to keep the
    // previous layout) is validated the same way an incoming layout attribute is, then applied and pk-layout-change fires with the confirmed doc.
    // A rejection keeps the previous layout. this.$applied always holds the last confirmed/drawn doc (unlike this.$doc, which the caller already
    // moved to the proposed one before commit runs), so it is what a null result or a rejection falls back to.
    commit(reason) {
        const proposed = this.$doc;
        if (this.confirmLayout) {
            const panels = readPanels(this.children), previous = this.$applied, phone = Boolean(this.$mq?.matches);
            Promise.resolve(this.confirmLayout({ layout: toJson(proposed), reason }))
                .then(result => {
                    const json = typeof result === 'string' ? result : previous && toJson(previous);
                    const r = json == null ? { doc: defaultLayout(panels), problems: [] } : fromJson(json, { panels });
                    for (const p of r.problems) this.warnOnce(`${p.code}:${p.path}`, p.message, { code: p.code });
                    this.$doc = this.$applied = this.$given = this.layout = r.doc;
                    this.draw(phone);
                    this.emit('pk-layout-change', { layout: r.doc, reason }, { cancelable: false });
                })
                .catch(error => {
                    this.warnOnce('confirm-layout-rejected', 'confirmLayout rejected; keeping the previous layout', { error });
                    this.$doc = previous;
                    this.draw(phone);
                });
            return;
        }
        this.layout = this.$given = this.$applied = this.$doc;
        this.emit('pk-layout-change', { layout: this.$doc, reason }, { cancelable: false });
    }
    draw(phone) {
        const doc = this.$doc, root = this.part('root'), d = this.ownerDocument;
        this.part('empty').hidden = Boolean(doc.root);
        if (!doc.root) return root.replaceChildren();
        if (phone) {
            const list = readingOrder(doc);
            root.replaceChildren(this.group(d, { id: 'phone', type: 'tabs', panels: list, active: list.includes(this.$phone) ? this.$phone : list[0] }));
            return loadElements(root);
        }
        root.replaceChildren(this.node(d, doc.root));
        loadElements(root);
    }
    node(d, n) {
        if (n.type === 'tabs') return this.group(d, n);
        const s = make(d, 'pk-splitter', { orientation: n.orientation, size: n.size, min: n.min, max: n.max, label: this.resizeLabel, 'data-node': n.id });
        for (const [slot, child] of [['start', n.a], ['end', n.b]]) { const cell = make(d, 'div', { class: 'cell', slot }); cell.append(this.node(d, child)); s.append(cell); }
        return s;
    }
    group(d, n) {
        const g = this.shadowRoot.querySelector('template').content.firstElementChild.cloneNode(true), title = id => this.$titles.get(id) ?? id;
        g.setAttribute('data-node', n.id);
        const h = g.querySelector('.header'), body = g.querySelector('.body');
        if (n.panels.length === 1) {
            h.textContent = title(n.panels[0]); h.id = `h-${n.panels[0]}`;
            body.append(make(d, 'slot', { name: n.panels[0] }));
            g.setAttribute('aria-labelledby', h.id);
            return g;
        }
        h.remove(); body.remove();
        g.setAttribute('aria-label', this.label || 'Panels');
        const tabs = make(d, 'pk-tabs', { value: n.active });
        for (const id of n.panels) {
            const tab = make(d, 'pk-tab', { value: id }); tab.textContent = title(id);
            const panel = make(d, 'pk-tab-panel', { value: id }), body = make(d, 'div', { part: 'body', class: 'body' }); body.append(make(d, 'slot', { name: id })); panel.append(body);
            tabs.append(tab, panel);
        }
        g.append(tabs);
        return g;
    }
    onResize(e) {
        e.stopPropagation();
        const id = e.target.closest?.('pk-splitter')?.getAttribute('data-node');
        const r = id && resize(this.$doc, { split: id, size: e.detail.size });
        if (r && r.doc !== this.$doc) { this.$doc = r.doc; this.commit('resize'); }
    }
    onTab(e) {
        e.stopPropagation();
        if (e.target.closest?.('section')?.getAttribute('data-node') === 'phone') { this.$phone = e.detail.value; return; }
        const r = activate(this.$doc, { panel: e.detail.value });
        if (r.doc !== this.$doc) { this.$doc = r.doc; this.commit('activate'); }
    }
};
