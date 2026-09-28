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
            root.addEventListener('pk-select', e => this.onMove(e));
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
        this.$doc = r.doc; this.$given = this.layout; this.$key = key; this.$titles = new Map(panels.map(p => [p.id, p.title]));
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
            if (movable) h.append(this.moveTrigger(d, panel, n.id));
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
        if (movable) {
            const trailing = make(d, 'div', { slot: 'trailing', class: 'trailing' });
            trailing.append(this.moveTrigger(d, n.active, n.id));
            tabs.append(trailing);
        }
        g.append(tabs);
        return g;
    }
    // A "Move to..." trigger for panel (the group's active tab, or its only panel): one pk-dropdown listing every other group, "Add as tab" plus the
    // four dockPanel zones beside it. group is panel's current group id, so the menu never offers moving a panel next to its own group.
    moveTrigger(d, panel, group) {
        const dd = make(d, 'pk-dropdown', { placement: 'bottom-end' });
        const btn = make(d, 'pk-button', { slot: 'trigger', variant: 'ghost', size: 'mini', icon: '', 'icon-name': 'more', label: `Move ${this.$titles.get(panel) ?? panel}...` });
        dd.append(btn);
        for (const target of groups(this.$doc)) {
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
        return dd;
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
    // A choice from a moveTrigger menu: "tab:<panel>:<group>" (moveTab, join as a tab) or "dock:<panel>:<group>:<zone>" (dockPanel, split beside it).
    onMove(e) {
        const value = e.detail?.value;
        if (typeof value !== 'string') return;
        e.stopPropagation();
        const [kind, panel, group, zone] = value.split(':');
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
    // Focus the tab of panel after a move (or its group's Move trigger, when it landed alone with no tab strip): the accessible outcome of an
    // operation is where focus goes next.
    focusPanel(panel) {
        const root = this.part('root'), tab = root.querySelector(`pk-tab[value="${panel}"]`);
        if (tab) return tab.focus?.();
        const group = findGroup(this.$doc, panel), section = group && root.querySelector(`[data-node="${group.id}"]`);
        section?.querySelector('pk-button[slot="trigger"]')?.focus?.();
    }
};
