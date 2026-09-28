// pk-dock behaviour: renders a dock-tree layout (js/dock-model.js) with pk-splitter for every split and pk-tabs for every group of panels, and turns a resize or a tab
// choice into a pk-layout-change. Panels are the host's own children: any element with slot="<panel id>" (and data-heading, data-group hints). They are slotted, never moved,
// so a panel keeps its state wherever it is docked. The layout logic lives in the model; this file only draws it. Below the phone breakpoint the tree is drawn as one
// tab strip of every panel and the layout is left untouched.
import { mediaBelow } from '../../js/breakpoints.js';
import { loadElements } from '../../js/loader.js';
import { defaultLayout, fromJson, resize, activate, groups, toJson, moveTab, dockPanel, findGroup } from '../../js/dock-model.js';

// The four ways to dock a panel beside another group (zone -> its menu label). Center (add as tab) is offered separately, first.
const ZONE_LABELS = [['left', 'Dock left of'], ['right', 'Dock right of'], ['top', 'Dock above'], ['bottom', 'Dock below']];

const PANEL = /^[a-z][\w-]{0,39}$/;
// Slot names the element already gives a fixed meaning: a panel id can otherwise be any string PANEL allows, so these are reserved rather than let a
// host's <div slot="empty"> or <div slot="toolbar-start"> become a phantom panel with no group of its own.
const RESERVED_SLOTS = new Set(['empty', 'toolbar-start']);

// Pure: the panels a host declares, from its child elements: [{ id, title, group }] in DOM order; a child without a usable slot name or with a repeated one is not a panel.
export function readPanels(children) {
    const seen = new Set(), out = [];
    for (const c of children) {
        const id = c.getAttribute?.('slot');
        if (!id || RESERVED_SLOTS.has(id) || !PANEL.test(id) || seen.has(id)) continue;
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
            root.addEventListener('pk-select', e => this.onMove(e));
            this.part('toolbar').addEventListener('pk-select', e => this.onPanels(e));
            this.$mo = new MutationObserver(() => this.requestUpdate());
            if (typeof matchMedia === 'function') { this.$mq = mediaBelow('phone'); this.$mqf = () => this.requestUpdate(); }
        }
        this.$mo.observe(this, { childList: true, attributes: true, attributeFilter: ['slot', 'data-heading', 'data-group'] });
        this.$mq?.addEventListener('change', this.$mqf);
    }
    disconnected() { this.$mo?.disconnect(); this.$mq?.removeEventListener('change', this.$mqf); }
    updated() {
        this.$closed ??= new Set(); // update() runs once from connectedCallback before connected() gets to set anything up
        const all = readPanels(this.children), phone = Boolean(this.$mq?.matches);
        // A closed panel stays a host child (so its state, and the memory that it exists, are not lost) but is left out of what the model is told is
        // declared: fromJson then drops it from its group like any panel that is no longer declared, and reopening (removing it from $closed) is just
        // the mirror of a panel newly appearing, which fromJson already re-adds to a group. No dock-model.js change needed for either direction.
        const panels = all.filter(p => !this.$closed.has(p.id));
        const key = JSON.stringify(panels) + phone + this.slotted('toolbar-start').length; // a toolbar-start child added or removed redraws the toolbar too
        if (this.layout === this.$given && key === this.$key) return;
        const first = !this.$doc, own = this.layout === this.$given;
        const source = own ? this.$doc && toJson(this.$doc) : this.layout;
        const r = source == null ? { doc: defaultLayout(panels), problems: [] } : fromJson(source, { panels });
        for (const p of r.problems) this.warnOnce(`${p.code}:${p.path}`, p.message, { code: p.code });
        const repaired = !first && own && toJson(r.doc) !== toJson(this.$doc);
        this.$doc = r.doc; this.$given = this.layout; this.$key = key; this.$titles = new Map(all.map(p => [p.id, p.title]));
        this.draw(phone);
        if (repaired) this.commit('panels');
    }
    commit(reason) {
        this.layout = this.$given = this.$doc;
        this.emit('pk-layout-change', { layout: this.$doc, reason }, { cancelable: false });
    }
    draw(phone) {
        const doc = this.$doc, root = this.part('root'), d = this.ownerDocument;
        this.$phoneStrip = Boolean(phone); // the phone strip flattens every group into one reading-order tab list, so "move to another group" has no target there
        this.drawToolbar(d);
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
        const h = g.querySelector('.header'), body = g.querySelector('.body'), movable = !this.$phoneStrip && groups(this.$doc).length > 1;
        if (n.panels.length === 1) {
            const panel = n.panels[0];
            h.id = `h-${panel}`;
            const label = make(d, 'span', { part: 'title', class: 'title' }); label.textContent = title(panel);
            h.append(label);
            if (!this.$phoneStrip) h.append(this.panelTrigger(d, panel, n.id, movable));
            body.append(make(d, 'slot', { name: panel }));
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
        if (!this.$phoneStrip) {
            const trailing = make(d, 'div', { slot: 'trailing', class: 'trailing' });
            trailing.append(this.panelTrigger(d, n.active, n.id, movable));
            tabs.append(trailing);
        }
        g.append(tabs);
        return g;
    }
    // A panel menu for panel (the group's active tab, or its only panel): "Move to..." (every other group, "Add as tab" plus the four dockPanel
    // zones) when movable, and always a Close (this.$closed, taken back out by the toolbar's Panels menu). group is panel's current group id, so
    // the menu never offers moving a panel next to its own group.
    panelTrigger(d, panel, group, movable) {
        const dd = make(d, 'pk-dropdown', { placement: 'bottom-end' });
        const btn = make(d, 'pk-button', { slot: 'trigger', variant: 'ghost', size: 'mini', icon: '', 'icon-name': 'more', label: `${this.$titles.get(panel) ?? panel} panel menu` });
        dd.append(btn);
        if (movable) for (const target of groups(this.$doc)) {
            if (target.id === group) continue;
            const targetTitle = this.$titles.get(target.active) ?? target.active;
            const header = make(d, 'pk-menu-item', { type: 'header' }); header.textContent = targetTitle;
            const tab = make(d, 'pk-menu-item', { value: `tab:${panel}:${target.id}` }); tab.textContent = 'Add as tab';
            dd.append(header, tab);
            for (const [zone, text] of ZONE_LABELS) {
                const item = make(d, 'pk-menu-item', { value: `dock:${panel}:${target.id}:${zone}` }); item.textContent = `${text} ${targetTitle}`;
                dd.append(item);
            }
        }
        if (movable) dd.append(make(d, 'pk-menu-item', { type: 'divider' }));
        const close = make(d, 'pk-menu-item', { value: `close:${panel}` }); close.textContent = 'Close';
        dd.append(close);
        return dd;
    }
    // The toolbar: a stable, always-there row (host apps fill slot toolbar-start with their own File/Edit/View-style menus; the dock never invents
    // their content, only gives it a place next to its own controls) plus, at its end, the Panels menu once something is closed. The toolbar itself
    // shows whenever the host gave it something (the slot) or the dock has (a closed panel); with neither, it collapses to nothing rather than
    // reserving an empty bar.
    drawToolbar(d) {
        const bar = this.part('toolbar'), closed = [...this.$titles ?? []].map(([id]) => id).filter(id => this.$closed.has(id));
        bar.querySelector('.panels')?.remove();
        bar.hidden = closed.length === 0 && this.slotted('toolbar-start').length === 0;
        if (!closed.length) return;
        const panels = make(d, 'div', { class: 'panels' });
        const dd = make(d, 'pk-dropdown', { placement: 'bottom-end' });
        const btn = make(d, 'pk-button', { slot: 'trigger', variant: 'ghost', size: 'mini', icon: '', 'icon-name': 'dashboard', label: `Panels (${closed.length} closed)` });
        dd.append(btn);
        for (const id of closed) { const item = make(d, 'pk-menu-item', { value: `open:${id}` }); item.textContent = `Open ${this.$titles.get(id) ?? id}`; dd.append(item); }
        panels.append(dd);
        bar.append(panels);
        loadElements(bar);
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
    // A choice from a panelTrigger menu: "tab:<panel>:<group>" (moveTab), "dock:<panel>:<group>:<zone>" (dockPanel), or "close:<panel>".
    onMove(e) {
        const value = e.detail?.value;
        if (typeof value !== 'string') return;
        e.stopPropagation();
        const [kind, panel, group, zone] = value.split(':');
        if (kind === 'close' && panel) return this.closePanel(panel);
        const title = id => this.$titles.get(id) ?? id, targetTitle = groups(this.$doc).find(g => g.id === group);
        let r, said;
        if (kind === 'tab' && panel && group) { r = moveTab(this.$doc, { panel, group }); said = `${title(panel)} added as a tab in ${title(targetTitle?.active)}`; }
        else if (kind === 'dock' && panel && group && zone) { r = dockPanel(this.$doc, { panel, target: group, zone }); said = `${title(panel)} docked ${zone === 'top' ? 'above' : zone === 'bottom' ? 'below' : zone + ' of'} ${title(targetTitle?.active)}`; }
        else return;
        for (const p of r.problems) this.warnOnce(`move:${p.code}:${p.path}`, p.message, { code: p.code });
        if (r.doc === this.$doc) return;
        this.$doc = r.doc;
        this.commit('move');
        // Unlike a resize or a tab choice (already reflected by the splitter/tabs the user just touched), a move changes which shadow group holds a
        // panel's slot: draw() moves it there. this.layout now equals this.$given (commit set both), so updated()'s own redraw would no-op; draw it here.
        this.draw(Boolean(this.$mq?.matches));
        this.part('status').textContent = said;
        this.focusPanel(panel);
    }
    // A choice from the toolbar's Panels menu: "open:<panel>".
    onPanels(e) {
        const value = e.detail?.value;
        if (typeof value !== 'string') return;
        e.stopPropagation();
        const [kind, panel] = value.split(':');
        if (kind === 'open' && panel) this.openPanel(panel);
    }
    // Close panel: it stops being declared to the model (updated() drops it from its group, or removes an emptied group, the same repair path a
    // panel leaving the host's DOM already takes), but the host keeps the child in its light DOM, so reopening loses nothing about it.
    closePanel(panel) {
        if (this.$closed.has(panel) || !this.$titles.has(panel)) return;
        const said = `${this.$titles.get(panel) ?? panel} closed`;
        this.$closed.add(panel);
        this.updated(); // synchronous, like a move: the redraw (a panel leaving its group, or the group itself) needs to happen before focus moves
        this.part('status').textContent = said;
        this.part('toolbar').querySelector('pk-button[slot="trigger"]')?.focus?.();
    }
    // Reopen a closed panel: declaring it again makes updated() add it back (to a group, per the same "a declared panel the layout lacks" repair a
    // panel newly appearing in the DOM already takes; no memory of its last group in this smallest version, see #432).
    openPanel(panel) {
        if (!this.$closed.has(panel)) return;
        const said = `${this.$titles.get(panel) ?? panel} opened`;
        this.$closed.delete(panel);
        this.updated();
        this.part('status').textContent = said;
        this.focusPanel(panel);
    }
    // Focus the tab of panel after a move (or its group's Move trigger, when it landed alone with no tab strip): the accessible outcome of an
    // operation is where focus goes next.
    focusPanel(panel) {
        const root = this.part('root'), tab = root.querySelector(`pk-tab[value="${panel}"]`);
        if (tab) return tab.focus?.();
        const group = findGroup(this.$doc, panel), section = group && root.querySelector(`[data-node="${group.id}"]`);
        section?.querySelector('pk-button[slot="trigger"]')?.focus?.();
    }
};
