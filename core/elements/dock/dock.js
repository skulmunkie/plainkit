// pk-dock behaviour: renders a dock-tree layout (js/dock-model.js) with pk-splitter for every split and pk-tabs for every group of panels, and turns a resize or a tab
// choice into a pk-layout-change. Panels are the host's own children: any element with slot="<panel id>" (and data-heading, data-group hints). They are slotted, never moved,
// so a panel keeps its state wherever it is docked. The layout logic lives in the model; this file only draws it. Below the phone breakpoint the tree is drawn as one
// tab strip of every panel and the layout is left untouched. A collapsed group at a screen edge (js/dock-model.js's isEdgeGroup) folds to a rail button instead
// of a header; activating it opens the panel as a flyout, positioned with js/positioning.js like pk-context-menu's own menu.
import { mediaBelow } from '../../js/breakpoints.js';
import { loadElements } from '../../js/loader.js';
import { createStore } from '../../js/store.js';
import { place, onOutside, unplace } from '../../js/positioning.js';
import { defaultLayout, fromJson, resize, activate, groups, toJson, moveTab, dockPanel, findGroup, collapsePanel, expandPanel, isEdgeGroup } from '../../js/dock-model.js';

// The four ways to dock a panel beside another group (zone -> its menu label). Center (add as tab) is offered separately, first.
const ZONE_LABELS = [['left', 'Dock left of'], ['right', 'Dock right of'], ['top', 'Dock above'], ['bottom', 'Dock below']];

// The pointer drop zone a position within a group's rect means: the outer EDGE fraction of each side is that edge (dockPanel), the rest is center
// (moveTab). Pure; the hit test that finds the rect (elementFromPoint) only runs in a browser (browser suite, review scenario).
const EDGE = 0.25;
export function dropZone(rect, x, y) {
    const w = rect.width, h = rect.height;
    if (!(w > 0) || !(h > 0)) return 'center';
    const relX = (x - rect.left) / w, relY = (y - rect.top) / h;
    if (relX < EDGE) return 'left';
    if (relX > 1 - EDGE) return 'right';
    if (relY < EDGE) return 'top';
    if (relY > 1 - EDGE) return 'bottom';
    return 'center';
}

const PANEL = /^[a-z][\w-]{0,39}$/;
// Slot names the element already gives a fixed meaning: a panel id can otherwise be any string PANEL allows, so these are reserved rather than let a
// host's <div slot="empty"> or <div slot="toolbar-start"> become a phantom panel with no group of its own.
const RESERVED_SLOTS = new Set(['empty', 'toolbar-start']);
// The layout document can be large (up to dock-model's own 64 KB limit): the store's default 1 KB per-key limit is raised for it.
const PERSIST_SCHEMA = { layout: { maxLength: 65536 } };

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
const gid = (doc, id) => groups(doc).find(g => g.id === id);

export default Base => class extends Base {
    connected() {
        if (!this.$init) {
            this.$init = true;
            const root = this.part('root');
            root.addEventListener('pk-resize', e => this.onResize(e));
            root.addEventListener('pk-tab-change', e => this.onTab(e));
            root.addEventListener('pk-select', e => this.onMove(e));
            this.part('toolbar').addEventListener('pk-select', e => this.onMove(e));
            root.addEventListener('click', e => this.onToggle(e));
            this.part('flyout').addEventListener('focusout', e => this.onFlyoutBlur(e));
            // Pointer drag-to-dock: the same moveTab/dockPanel calls the Move menu makes. Pointer capture pins move/up/cancel to the drag's own
            // handle, so onDragMove hit-tests the group under the pointer's coordinates rather than trusting e.target.
            root.addEventListener('pointerdown', e => this.onDragStart(e));
            root.addEventListener('pointermove', e => this.onDragMove(e));
            root.addEventListener('pointerup', e => this.onDragEnd(e));
            root.addEventListener('pointercancel', e => this.onDragEnd(e));
            root.addEventListener('lostpointercapture', e => this.onDragEnd(e));
            this.$mo = new MutationObserver(() => this.requestUpdate());
            if (typeof matchMedia === 'function') { this.$mq = mediaBelow('phone'); this.$mqf = () => this.requestUpdate(); }
        }
        this.$mo.observe(this, { childList: true, attributes: true, attributeFilter: ['slot', 'data-heading', 'data-group'] });
        this.$mq?.addEventListener('change', this.$mqf);
    }
    disconnected() {
        this.$mo?.disconnect(); this.$mq?.removeEventListener('change', this.$mqf);
        this.$mod?.destroy(); this.$store?.destroy();
        this.$o?.(); this.$o = undefined;
        this.$mod = this.$store = this.$persisted = undefined;
    }
    // Creates (or replaces) the per-element store when persistKey changes; restores a saved layout the first time there is no layout prop yet.
    syncPersist() {
        if (this.persistKey === this.$persisted) return;
        this.$mod?.destroy(); this.$store?.destroy(); this.$mod = this.$store = undefined;
        this.$persisted = this.persistKey;
        if (!this.persistKey) return;
        this.$store = createStore({ prefix: `pk-dock:${this.persistKey}` });
        this.$mod = this.$store.module('layout', { defaults: { layout: {} }, schema: PERSIST_SCHEMA, persist: ['layout'] });
        const saved = this.$mod.get('layout');
        if (this.layout == null && saved && saved.version) this.layout = saved;
    }
    updated() {
        this.syncPersist();
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
        this.$doc = this.$applied = r.doc; this.$given = this.layout; this.$key = key; this.$titles = new Map(all.map(p => [p.id, p.title]));
        this.draw(phone);
        if (repaired) this.commit('panels');
    }
    // Free-running by default: the proposed doc is applied straight away. A host that wants every change to round-trip first (Blazor's controlled
    // mode, #592) sets confirmLayout(arg) as a callback property, the same way pk-tool-page's run is set from script (STANDARDS.md: a callback is
    // not config data). arg is { layout: <JSON string>, reason }; the settled result (a JSON string to apply, or null/undefined to keep the
    // previous layout) is validated the same way an incoming layout attribute is, then applied and pk-layout-change fires with the confirmed doc.
    // A rejection keeps the previous layout. this.$applied always holds the last confirmed/drawn doc (unlike this.$doc, which the caller already
    // moved to the proposed one before commit runs), so it is what a null result or a rejection falls back to. Either way, once a layout is actually
    // confirmed and drawn, it is what persistKey saves (never a proposed-but-rejected one).
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
                    this.$mod?.set('layout', this.$doc);
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
        this.$mod?.set('layout', this.$doc);
        this.emit('pk-layout-change', { layout: this.$doc, reason }, { cancelable: false });
    }
    draw(phone) {
        const doc = this.$doc, root = this.part('root'), d = this.ownerDocument;
        this.$phoneStrip = Boolean(phone); // the phone strip flattens every group into one reading-order tab list, so "move to another group" has no target there
        this.drawToolbar(d);
        this.part('empty').hidden = Boolean(doc.root);
        if (!doc.root) { root.replaceChildren(); return this.reflyout(); }
        if (phone) {
            const list = readingOrder(doc);
            root.replaceChildren(this.group(d, { id: 'phone', type: 'tabs', panels: list, active: list.includes(this.$phone) ? this.$phone : list[0] }));
            loadElements(root);
            return this.reflyout();
        }
        root.replaceChildren(this.node(d, doc.root));
        loadElements(root);
        this.reflyout();
    }
    // Re-finds the rail button for an open flyout after a redraw (draw() rebuilds the tree from scratch, so the old button is gone) and repositions
    // over it; closes the flyout quietly when its panel is no longer a collapsed edge group (it moved, expanded, or the layout changed under it).
    reflyout() {
        if (!this.$flyout) return;
        const btn = this.part('root').querySelector?.(`[data-rail-panel="${this.$flyout}"]`);
        const el = this.part('flyout');
        if (!btn) { this.$flyout = null; this.$o?.(); this.$o = undefined; unplace(el); el.hidden = true; el.replaceChildren(); return; }
        btn.setAttribute('aria-expanded', 'true');
        place(btn, el, { placement: 'right-start', offset: 4 });
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
        const railBtn = g.querySelector('.rail-button');
        // A grab cursor where a pointer drag can actually pick this group up.
        g.toggleAttribute('data-movable', movable);
        if (n.panels.length === 1) {
            const panel = n.panels[0], collapsed = (this.$doc.collapsed ?? []).includes(panel), bodyId = `b-${panel}`;
            // A collapsed group at a screen edge folds to a narrow rail button (icon strip in miniature: title only for now) that opens the panel as a
            // flyout on click, the familiar IDE behaviour; a collapsed group that is not at an edge (the centre column) keeps the header-only fold.
            if (collapsed && isEdgeGroup(this.$doc, n.id)) {
                h.remove(); body.remove();
                g.setAttribute('class', `${g.getAttribute('class') || 'group'} rail`);
                g.setAttribute('aria-label', title(panel));
                railBtn.hidden = false;
                railBtn.setAttribute('data-rail-panel', panel);
                railBtn.setAttribute('aria-haspopup', 'true');
                railBtn.setAttribute('aria-expanded', String(this.$flyout === panel));
                railBtn.setAttribute('aria-controls', 'flyout');
                railBtn.textContent = title(panel);
                return g;
            }
            railBtn.remove();
            h.id = `h-${panel}`;
            const toggle = h.querySelector('.collapse-toggle');
            toggle.setAttribute('aria-expanded', String(!collapsed));
            toggle.setAttribute('aria-controls', bodyId);
            toggle.setAttribute('data-panel', panel);
            toggle.querySelector('.title').textContent = title(panel);
            if (!this.$phoneStrip) h.append(this.panelTrigger(d, panel, n.id, movable));
            body.id = bodyId;
            body.hidden = collapsed;
            body.append(make(d, 'slot', { name: panel }));
            g.setAttribute('aria-labelledby', h.id);
            return g;
        }
        h.remove(); body.remove(); railBtn.remove();
        g.setAttribute('aria-label', this.label || 'Panels');
        // scroll: a group's tab list never wraps onto a second row (a narrow group, or the phone strip's own row) — it scrolls sideways instead, like pk-tabs elsewhere.
        const tabs = make(d, 'pk-tabs', { value: n.active, scroll: '' });
        for (const id of n.panels) {
            const tab = make(d, 'pk-tab', { value: id }); tab.textContent = title(id);
            const panel = make(d, 'pk-tab-panel', { value: id }), pbody = make(d, 'div', { part: 'body', class: 'body' }); pbody.append(make(d, 'slot', { name: id })); panel.append(pbody);
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
    // A choice from a panelTrigger menu ("tab:<panel>:<group>" moveTab, "dock:<panel>:<group>:<zone>" dockPanel, "close:<panel>") or the toolbar's
    // Panels menu ("open:<panel>") — both fire pk-select and share this one dispatcher.
    onMove(e) {
        const value = e.detail?.value;
        if (typeof value !== 'string') return;
        e.stopPropagation();
        const [kind, panel, group, zone] = value.split(':');
        if (kind === 'close' && panel) return this.closePanel(panel);
        if (kind === 'open' && panel) return this.openPanel(panel);
        this.applyMove(kind, panel, group, zone);
    }
    // The one place moveTab/dockPanel are called: from the Move menu (onMove) and a pointer drop (onDragEnd), so both commit, announce and focus alike.
    applyMove(kind, panel, group, zone) {
        const title = id => this.$titles.get(id) ?? id, targetGroup = gid(this.$doc, group);
        let r, said;
        if (kind === 'tab' && panel && group) { r = moveTab(this.$doc, { panel, group }); said = `${title(panel)} added as a tab in ${title(targetGroup?.active)}`; }
        else if (kind === 'dock' && panel && group && zone) { r = dockPanel(this.$doc, { panel, target: group, zone }); said = `${title(panel)} docked ${zone === 'top' ? 'above' : zone === 'bottom' ? 'below' : zone + ' of'} ${title(targetGroup?.active)}`; }
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
    // ---- pointer drag-to-dock: the moveTab/dockPanel calls above, reached by dragging a header or a pk-tab onto another group. Pointer capture is
    // set right away (like pk-sortable-item), but nothing else happens (no overlay, no preventDefault) until the pointer actually moves, so a plain
    // click still selects a tab. Grabbing needs another group to drop on (panelTrigger's own "movable"), and never the panel-menu trigger itself.
    onDragStart(e) {
        if (e.button > 0 || this.$phoneStrip || groups(this.$doc).length < 2) return;
        if (e.target.closest?.('pk-dropdown, pk-button')) return;
        const tab = e.target.closest?.('pk-tab');
        const handle = tab || e.target.closest?.('[part="header"]');
        const groupEl = handle?.closest?.('[data-node]');
        const groupId = groupEl?.getAttribute('data-node');
        const group = groupId && gid(this.$doc, groupId);
        if (!group) return;
        const panel = tab ? tab.getAttribute('value') : group.active;
        if (!panel) return;
        try { handle.setPointerCapture(e.pointerId); } catch (err) { this.debug?.('pointer capture refused (no synthetic pointer active)', err); }
        this.$drag = { panel, from: groupId, target: null, zone: null, pointerId: e.pointerId, moved: false, startX: e.clientX, startY: e.clientY, handle };
    }
    // Past a small movement threshold (a click is never mistaken for a drag), hit-test the group under the pointer with shadowRoot.elementFromPoint
    // (e.target stays pinned to the captured handle) and mark its zone, or clear the mark over no group, a splitter, or the panel's own group.
    onDragMove(e) {
        const d = this.$drag;
        if (!d || e.pointerId !== d.pointerId) return;
        if (!d.moved) {
            if (Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < 4) return;
            d.moved = true;
            this.toggleAttribute('dragging', true);
        }
        e.preventDefault();
        const hit = this.shadowRoot.elementFromPoint?.(e.clientX, e.clientY);
        const groupEl = hit?.closest?.('[data-node]');
        const groupId = groupEl?.getAttribute('data-node');
        const group = groupId && groupId !== d.from && gid(this.$doc, groupId);
        if (!group) { this.clearDropZone(); d.target = null; d.zone = null; return; }
        const zone = dropZone(groupEl.getBoundingClientRect(), e.clientX, e.clientY);
        if (groupId === d.target && zone === d.zone) return;
        this.clearDropZone();
        d.target = groupId; d.zone = zone;
        groupEl.setAttribute('drop-zone', zone);
    }
    clearDropZone() { this.part('root').querySelectorAll?.('[drop-zone]')?.forEach(el => el.removeAttribute('drop-zone')); }
    // Zone center is moveTab, any edge is dockPanel, exactly like the matching Move menu item. Never moved, cancelled, or nowhere valid: no-op.
    onDragEnd(e) {
        const d = this.$drag;
        if (!d || e.pointerId !== d.pointerId) return;
        if (d.handle?.hasPointerCapture?.(d.pointerId)) d.handle.releasePointerCapture(d.pointerId);
        this.toggleAttribute('dragging', false);
        this.clearDropZone();
        this.$drag = null;
        if (!d.moved || e.type === 'pointercancel' || !d.target) return;
        this.applyMove(d.zone === 'center' ? 'tab' : 'dock', d.panel, d.target, d.zone);
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
    // The chevron button in a single-panel header, or a rail button (Enter/Space activate either like any button, no extra keyboard code needed).
    // Multi-panel tab groups do not offer collapse yet (see the model's collapsePanel doc comment); a click anywhere else, or on a button with
    // neither data-panel nor data-rail-panel, is ignored.
    onToggle(e) {
        const btn = e.target.closest?.('button');
        const railPanel = btn?.getAttribute('data-rail-panel');
        if (railPanel) { e.stopPropagation(); this.toggleFlyout(railPanel, btn); return; }
        const panel = btn?.getAttribute('data-panel');
        if (!panel) return;
        e.stopPropagation();
        const collapsed = (this.$doc.collapsed ?? []).includes(panel);
        const r = (collapsed ? expandPanel : collapsePanel)(this.$doc, { panel });
        if (r.doc === this.$doc) return;
        this.$doc = r.doc; this.commit('collapse');
        this.draw(Boolean(this.$mq?.matches));
        // draw() rebuilds the whole group subtree (a new button), so the one the pointer or keyboard just used is gone: without this the next
        // Tab (or the next Enter, for a screen reader user who does not re-locate the button) would land somewhere else.
        this.part('root').querySelector?.(`[data-panel="${panel}"]`)?.focus?.();
    }
    // Opens (or, on a second activation of the same rail button, closes) a panel as a flyout positioned over the content area, next to the rail
    // button it belongs to. The panel stays collapsed in the model throughout: the flyout is a transient view, not a layout change, so it raises
    // no pk-layout-change. Only one flyout is open at a time (a second rail button replaces it, IDE-fashion).
    toggleFlyout(panel, btn) {
        if (this.$flyout === panel) { this.closeFlyout(); return; }
        this.$flyout = panel;
        const el = this.part('flyout');
        el.hidden = false;
        el.replaceChildren(make(this.ownerDocument, 'slot', { name: panel }));
        loadElements(el);
        place(btn, el, { placement: 'right-start', offset: 4 });
        btn.setAttribute('aria-expanded', 'true');
        this.$o?.();
        this.$o = onOutside([btn, el], ev => this.closeFlyout(ev));
    }
    // Closes the open flyout (a no-op when none is open). Escape returns focus to the rail button that opened it; an outside click or a blur out of
    // the flyout does not steal focus back, since it has already moved somewhere the user chose.
    closeFlyout(e) {
        const panel = this.$flyout;
        if (!panel) return;
        this.$flyout = null;
        this.$o?.(); this.$o = undefined;
        const el = this.part('flyout');
        unplace(el); el.hidden = true; el.replaceChildren();
        const btn = this.part('root').querySelector?.(`[data-rail-panel="${panel}"]`);
        btn?.setAttribute('aria-expanded', 'false');
        if (e?.type === 'keydown') btn?.focus?.();
    }
    // Closes when focus leaves both the flyout and its rail button (Tab out, not just a pointerdown elsewhere, which onOutside already covers).
    onFlyoutBlur(e) {
        if (!this.$flyout) return;
        const el = this.part('flyout'), btn = this.part('root').querySelector?.(`[data-rail-panel="${this.$flyout}"]`);
        const to = e.relatedTarget;
        if (to && (el.contains?.(to) || to === btn)) return;
        this.closeFlyout();
    }
};
