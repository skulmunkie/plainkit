// pk-dock behaviour: renders a dock-tree layout (js/dock-model.js) with pk-splitter for every split and pk-tabs for every group of panels, and turns a resize or a tab
// choice into a pk-layout-change. Panels are the host's own children: any element with slot="<panel id>" (and data-heading, data-group hints). They are slotted, never moved,
// so a panel keeps its state wherever it is docked. The layout logic lives in the model; this file only draws it. Below the phone breakpoint the tree is drawn as one
// tab strip of every panel and the layout is left untouched. A collapsed group at a screen edge (js/dock-model.js's isEdgeGroup) folds to a rail button instead
// of a header; activating it opens the panel as a flyout, positioned with js/positioning.js like pk-context-menu's own menu. The flyout opens with
// an Expand button (issue #636) ahead of the panel's own content, that restores the panel to a normal docked header - the only way back from a
// collapsed rail short of reloading or clearing persistKey's stored layout, and deliberately a separate action from opening/closing the flyout.
import { mediaBelow } from '../../js/breakpoints.js';
import { loadElements } from '../../js/loader.js';
import { createStore } from '../../js/store.js';
import { place, onOutside, unplace } from '../../js/positioning.js';
import { defaultLayout, fromJson, resize, activate, groups, toJson, moveTab, dockPanel, findGroup, collapsePanel, expandPanel, isEdgeGroup, floaters, findFloater, dragFloater, floatDrag, tabDrag, raiseFloater, describeMove, floatPanel, dockFloating, moveFloater, resizeFloater } from '../../js/dock-model.js';

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
const rectStyle = (el, f) => Object.assign(el.style, { left: `${f.x}px`, top: `${f.y}px`, width: `${f.w}px`, height: `${f.h}px`, zIndex: f.z });

export default Base => class extends Base {
    connected() {
        if (!this.$init) {
            this.$init = true;
            const root = this.part('root');
            root.addEventListener('pk-resize', e => this.onResize(e));
            root.addEventListener('pk-tab-change', e => this.onTab(e));
            root.addEventListener('pk-select', e => this.onMove(e));
            this.part('toolbar').addEventListener('pk-select', e => this.onMove(e));
            // The flyout (part=flyout) is a sibling of root, not a descendant, so its own Expand button (issue #636) needs the same listener too.
            const toggle = e => this.onToggle(e);
            root.addEventListener('click', toggle);
            this.part('flyout').addEventListener('click', toggle);
            this.part('flyout').addEventListener('focusout', e => this.onFlyoutBlur(e));
            // Pointer drag-to-dock: the same moveTab/dockPanel calls the Move menu makes. Pointer capture pins move/up/cancel to the drag's own
            // handle, so onDragMove hit-tests the group under the pointer's coordinates rather than trusting e.target.
            root.addEventListener('pointerdown', e => this.onDragStart(e));
            root.addEventListener('pointermove', e => this.onDragMove(e));
            root.addEventListener('pointerup', e => this.onDragEnd(e));
            root.addEventListener('pointercancel', e => this.onDragEnd(e));
            root.addEventListener('lostpointercapture', e => this.onDragEnd(e));
            // Keyboard/focus equivalents of the pointer drag above (issue #618 step 3): arrow keys on a floater's own frame move/resize it, and
            // focusing anything inside a floater (Tab, or a menu action landing there) raises it, the keyboard mirror of onDragStart's pointerdown raise.
            root.addEventListener('keydown', e => this.onFloatKeys(e));
            root.addEventListener('focusin', e => this.onFloatFocus(e));
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
        // update() runs once from connectedCallback before connected() gets to set anything up
        this.$closed ??= new Set();
        const all = readPanels(this.children), phone = Boolean(this.$mq?.matches);
        // A closed panel stays a host child (so its state, and the memory that it exists, are not lost) but is left out of what the model is told is
        // declared: fromJson then drops it from its group like any panel that is no longer declared, and reopening (removing it from $closed) is just
        // the mirror of a panel newly appearing, which fromJson already re-adds to a group. No dock-model.js change needed for either direction.
        const panels = all.filter(p => !this.$closed.has(p.id));
        // a toolbar-start child added or removed redraws the toolbar too
        const key = JSON.stringify(panels) + phone + this.slotted('toolbar-start').length;
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
        const doc = this.$doc, root = this.part('root'), d = this.ownerDocument, floating = floaters(doc);
        // the phone strip flattens every group into one reading-order tab list, so "move to another group" has no target there
        this.$phoneStrip = Boolean(phone);
        this.drawToolbar(d);
        this.part('empty').hidden = Boolean(doc.root) || floating.length > 0;
        if (!doc.root && !floating.length) { root.replaceChildren(); return this.reflyout(); }
        if (phone) {
            const list = readingOrder(doc);
            root.replaceChildren(this.group(d, { id: 'phone', type: 'tabs', panels: list, active: list.includes(this.$phone) ? this.$phone : list[0] }));
            loadElements(root);
            return this.reflyout();
        }
        root.replaceChildren(...(doc.root ? [this.node(d, doc.root)] : []));
        this.drawFloating(d, floating);
        loadElements(root);
        this.reflyout();
    }
    // Each `floating` entry (js/dock-model.js) is an absolutely-positioned overlay inside .root's own bounds (never the shell/viewport, per the
    // design's "floating layer: inside the dock bounds only"), never drawn for the phone strip (a floater has no meaning once everything flattens
    // to one reading-order tab list). Its group is a plain `tabs` node rendered by this.group() itself (data-floater doubles as the CSS hook and
    // the id onDragStart reads back), rather than a second tab-rendering path or an extra wrapper element.
    drawFloating(d, floating) {
        const root = this.part('root');
        for (const f of floating) {
            const g = this.group(d, f.group, f.id);
            g.setAttribute('data-floater', f.id);
            rectStyle(g, f);
            // The frame itself is the keyboard handle (onFloatKeys): arrow keys move it, Alt+Arrow resizes, Shift steps bigger, mirroring the pointer
            // drag/resize above one level up. aria-describedby points at the one static hint dock.html carries for every floater, not a copy each.
            g.tabIndex = 0;
            g.setAttribute('aria-roledescription', 'floating panel');
            g.setAttribute('aria-describedby', 'floater-help');
            g.append(make(d, 'div', { class: 'floater-resize' }));
            root.append(g);
        }
    }
    // Re-finds the rail button for an open flyout after a redraw (draw() rebuilds the tree from scratch, so the old button is gone) and repositions
    // over it; closes the flyout quietly when its panel is no longer a collapsed edge group (it moved, expanded, or the layout changed under it).
    reflyout() {
        if (!this.$flyout) return;
        const btn = this.part('root').querySelector?.(`[data-rail-panel="${this.$flyout}"]`);
        const el = this.part('flyout');
        if (!btn) { this.$flyout = null; this.$o?.(); this.$o = undefined; unplace(el); el.hidden = true; return; }
        btn.setAttribute('aria-expanded', 'true');
        place(btn, el, { placement: 'right-start', offset: 4 });
    }
    node(d, n) {
        if (n.type === 'tabs') return this.group(d, n);
        const s = make(d, 'pk-splitter', { orientation: n.orientation, size: n.size, min: n.min, max: n.max, label: this.resizeLabel, 'data-node': n.id });
        for (const [slot, child] of [['start', n.a], ['end', n.b]]) { const cell = make(d, 'div', { class: 'cell', slot }); cell.append(this.node(d, child)); s.append(cell); }
        return s;
    }
    // floaterId is set only when n is a floater's own group (drawFloating), never a tree node: it steers panelTrigger to offer dockFloating's
    // "dock back in" targets instead of moveTab/dockPanel's tree-only ones, which would silently no-op on a panel that only a floater holds.
    group(d, n, floaterId) {
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
            if (!this.$phoneStrip) h.append(this.panelTrigger(d, panel, n.id, movable, floaterId));
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
            trailing.append(this.panelTrigger(d, n.active, n.id, movable, floaterId));
            tabs.append(trailing);
        }
        g.append(tabs);
        return g;
    }
    // A panel menu for panel (the group's active tab, or its only panel): "Move to..." (every other group, "Add as tab" plus the four dockPanel
    // zones) when movable, a Float item to detach it as an overlay, and always a Close (this.$closed, taken back out by the toolbar's Panels
    // menu). group is panel's current group id, so the menu never offers moving a panel next to its own group. floaterId (set only when panel is
    // already floating, drawFloating's own group() call) swaps that section for dockFloating's own "dock back in" targets (every tree group, same
    // zones) instead: moveTab/dockPanel only know tree panels, so offering them here would silently no-op (#618 step 3).
    panelTrigger(d, panel, group, movable, floaterId) {
        const dd = make(d, 'pk-dropdown', { placement: 'bottom-end' });
        const btn = make(d, 'pk-button', { slot: 'trigger', variant: 'ghost', size: 'mini', icon: '', 'icon-name': 'more', label: `${this.$titles.get(panel) ?? panel} panel menu` });
        dd.append(btn);
        const targets = floaterId ? groups(this.$doc) : movable ? groups(this.$doc).filter(t => t.id !== group) : [];
        for (const target of targets) {
            const targetTitle = this.$titles.get(target.active) ?? target.active;
            const kind = floaterId ? `dockfloat:${floaterId}:${target.id}` : `tab:${panel}:${target.id}`;
            const header = make(d, 'pk-menu-item', { type: 'header' }); header.textContent = targetTitle;
            const tab = make(d, 'pk-menu-item', { value: floaterId ? `${kind}:center` : kind }); tab.textContent = 'Add as tab';
            dd.append(header, tab);
            for (const [zone, text] of ZONE_LABELS) {
                const value = floaterId ? `dockfloat:${floaterId}:${target.id}:${zone}` : `dock:${panel}:${target.id}:${zone}`;
                const item = make(d, 'pk-menu-item', { value }); item.textContent = `${text} ${targetTitle}`;
                dd.append(item);
            }
        }
        if (targets.length) dd.append(make(d, 'pk-menu-item', { type: 'divider' }));
        if (!floaterId && !this.$phoneStrip) {
            const float = make(d, 'pk-menu-item', { value: `float:${panel}` }); float.textContent = 'Float';
            dd.append(float, make(d, 'pk-menu-item', { type: 'divider' }));
        }
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
    // A choice from a panelTrigger menu ("tab:<panel>:<group>" moveTab, "dock:<panel>:<group>:<zone>" dockPanel, "float:<panel>" floatPanel,
    // "dockfloat:<floater>:<group>:<zone>" dockFloating, "close:<panel>") or the toolbar's Panels menu ("open:<panel>") — all fire pk-select and
    // share this one dispatcher.
    onMove(e) {
        const value = e.detail?.value;
        if (typeof value !== 'string') return;
        e.stopPropagation();
        const [kind, panel, group, zone] = value.split(':');
        if (kind === 'close' && panel) return this.closePanel(panel);
        if (kind === 'open' && panel) return this.openPanel(panel);
        if (kind === 'float' && panel) return this.floatCmd(panel);
        if (kind === 'dockfloat' && panel && group && zone) return this.applyDockFloat(panel, group, zone);
        this.applyMove(kind, panel, group, zone);
    }
    // The one place moveTab/dockPanel are called: from the Move menu (onMove) and a pointer drop (onDragEnd), so both commit, announce and focus alike.
    applyMove(kind, panel, group, zone) {
        const title = id => this.$titles.get(id) ?? id, targetGroup = gid(this.$doc, group);
        let r;
        if (kind === 'tab' && panel && group) r = moveTab(this.$doc, { panel, group });
        else if (kind === 'dock' && panel && group && zone) r = dockPanel(this.$doc, { panel, target: group, zone });
        else return;
        const said = describeMove(kind, title(panel), title(targetGroup?.active), zone);
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
    // Float this panel out of its group (the Panel menu's own "Float", the menu equivalent of floatPanel; the pointer path only ever moves/resizes
    // an existing floater, it never creates one). New floaters cascade slightly so opening several in a row does not stack them exactly on top of
    // each other. Focus follows to the new floater's own frame (focusFloater), the keyboard entry point for the arrow-key move/resize below.
    floatCmd(panel) {
        const title = this.$titles.get(panel) ?? panel, box = this.part('root').getBoundingClientRect(), n = floaters(this.$doc).length;
        const r = floatPanel(this.$doc, { panel, rect: { x: 24 + (n % 6) * 16, y: 24 + (n % 6) * 16, w: 320, h: 240 }, bounds: { w: box.width, h: box.height } });
        for (const p of r.problems) this.warnOnce(`float:${p.code}:${p.path}`, p.message, { code: p.code });
        if (r.doc === this.$doc) return;
        this.$doc = r.doc;
        this.commit('float');
        this.draw(Boolean(this.$mq?.matches));
        this.part('status').textContent = `${title} floating`;
        this.focusFloater(panel);
    }
    // Dock a floater back into the tree (the Panel menu's own "dock back in" section, dockFloating): the menu equivalent of dragging its header onto
    // a group. Reads the floater's active panel before dockFloating removes the floater, so focus and the announcement can still name it afterwards.
    applyDockFloat(floaterId, target, zone) {
        const f = findFloater(this.$doc, floaterId);
        if (!f) return;
        const title = id => this.$titles.get(id) ?? id, panel = f.group.active, targetGroup = gid(this.$doc, target);
        const r = dockFloating(this.$doc, { floater: floaterId, target, zone });
        for (const p of r.problems) this.warnOnce(`dockfloat:${p.code}:${p.path}`, p.message, { code: p.code });
        if (r.doc === this.$doc) return;
        this.$doc = r.doc;
        this.commit('dockfloat');
        this.draw(Boolean(this.$mq?.matches));
        this.part('status').textContent = describeMove(zone === 'center' ? 'tab' : 'dock', title(panel), title(targetGroup?.active), zone);
        this.focusPanel(panel);
    }
    // Focuses panel's own floater frame (after floatCmd, or when nothing else already sets focus): the frame itself is the keyboard move/resize
    // handle (onFloatKeys), so this is the accessible next step after detaching a panel, the floating mirror of focusPanel.
    focusFloater(panel) {
        const f = floaters(this.$doc).find(fl => fl.group.panels.includes(panel));
        const el = f && this.part('root').querySelector?.(`[data-floater="${f.id}"]`);
        el?.focus?.();
    }
    // Arrow keys on a floater's own frame (drawFloating gives it tabIndex 0) move it by STEP, or resize it with Alt held (bottom/right grow);
    // Shift steps bigger, matching pk-splitter's own step/bigger-step keyboard convention. Only fires when the frame itself has focus, not a
    // descendant button or tab (those have their own Enter/Space behaviour already). paintFloat applies the rect straight to the element like a
    // pointer drag does, so the redraw guard in updated() never tears down (and unfocuses) the frame the key press just moved.
    onFloatKeys(e) {
        const el = e.target.closest?.('[data-floater]');
        if (!el || e.target !== el) return;
        const id = el.getAttribute('data-floater'), f = findFloater(this.$doc, id);
        if (!f) return;
        const step = e.shiftKey ? 32 : 8, resizing = e.altKey;
        let dx = 0, dy = 0;
        if (e.key === 'ArrowLeft') dx = -step;
        else if (e.key === 'ArrowRight') dx = step;
        else if (e.key === 'ArrowUp') dy = -step;
        else if (e.key === 'ArrowDown') dy = step;
        else return;
        e.preventDefault();
        const box = this.part('root').getBoundingClientRect(), bounds = { w: box.width, h: box.height };
        const r = resizing ? resizeFloater(this.$doc, { floater: id, w: f.w + dx, h: f.h + dy, bounds }) : moveFloater(this.$doc, { floater: id, x: f.x + dx, y: f.y + dy, bounds });
        if (r.doc === this.$doc) return;
        this.$doc = r.doc;
        this.paintFloat(id);
        this.commit(resizing ? 'resize' : 'move');
        const moved = findFloater(this.$doc, id), title = this.$titles.get(f.group.active) ?? f.group.active;
        this.part('status').textContent = resizing ? `${title} resized to ${Math.round(moved.w)} by ${Math.round(moved.h)}` : `${title} moved to ${Math.round(moved.x)}, ${Math.round(moved.y)}`;
    }
    // Focusing anything inside a floater (Tab, or landing there after floatCmd/applyDockFloat) raises it, the keyboard/focus mirror of
    // onDragStart's own raiseFloater-on-grab; paintFloat only touches the moved element's style, so it never steals the focus that just arrived.
    onFloatFocus(e) {
        const el = e.target.closest?.('[data-floater]');
        const id = el?.getAttribute('data-floater');
        if (!id) return;
        const r = raiseFloater(this.$doc, { floater: id });
        if (r.doc === this.$doc) return;
        this.$doc = r.doc;
        this.paintFloat(id);
        this.commit('raise');
    }
    // ---- pointer drag-to-dock: the moveTab/dockPanel calls above, reached by dragging a header or a pk-tab onto another group. Pointer capture is
    // set right away (like pk-sortable-item), but nothing else happens (no overlay, no preventDefault) until the pointer actually moves, so a plain
    // click still selects a tab. Grabbing needs another group to drop on (panelTrigger's own "movable"), and never the panel-menu trigger itself.
    // A floater has no separate title bar element: its own group() header (or tab strip) already shows the title, so that same element doubles as
    // the drag-to-move handle, plus a corner .floater-resize grip. Either shares one $drag object, one set of listeners and one grab/release helper
    // with the tree's own tab-drag-to-dock below (d.float tells onDragMove/onDragEnd which branch to run); moveFloater/resizeFloater already clamp
    // to bounds (.root's own rect, never the shell/viewport), so dock.js never re-derives that clamp math, only turns pointer deltas into calls.
    onDragStart(e) {
        if (e.button > 0 || e.target.closest?.('pk-dropdown, pk-button')) return;
        const floaterEl = e.target.closest?.('[data-floater]');
        if (floaterEl) {
            const grip = e.target.closest?.('.floater-resize'), handle = grip || e.target.closest?.('pk-tab, [part="header"]');
            const id = handle && floaterEl.getAttribute('data-floater'), f = id && findFloater(this.$doc, id);
            if (!f) return;
            e.stopPropagation();
            this.$doc = raiseFloater(this.$doc, { floater: id }).doc;
            this.paintFloat(id);
            this.grab(handle, e.pointerId);
            this.$drag = floatDrag(f, grip, e.pointerId, e.clientX, e.clientY);
            this.$drag.handle = handle;
            return;
        }
        if (this.$phoneStrip || groups(this.$doc).length < 2) return;
        const tab = e.target.closest?.('pk-tab');
        const handle = tab || e.target.closest?.('[part="header"]');
        const groupEl = handle?.closest?.('[data-node]');
        const groupId = groupEl?.getAttribute('data-node');
        const group = groupId && gid(this.$doc, groupId);
        if (!group) return;
        const panel = tab ? tab.getAttribute('value') : group.active;
        if (!panel) return;
        this.grab(handle, e.pointerId);
        this.$drag = tabDrag(panel, groupId, e.pointerId, e.clientX, e.clientY);
        this.$drag.handle = handle;
    }
    grab(handle, id) { try { handle.setPointerCapture(id); } catch (err) { this.debug?.('pointer capture refused (no synthetic pointer active)', err); } }
    // Past a small movement threshold (a click is never mistaken for a drag), hit-test the group under the pointer with shadowRoot.elementFromPoint
    // (e.target stays pinned to the captured handle) and mark its zone, or clear the mark over no group, a splitter, or the panel's own group.
    onDragMove(e) {
        const d = this.$drag;
        if (!d || e.pointerId !== d.pointerId) return;
        if (d.float) {
            e.preventDefault();
            const box = this.part('root').getBoundingClientRect();
            const r = dragFloater(this.$doc, { floater: d.id, start: d, dx: e.clientX - d.sx, dy: e.clientY - d.sy, resize: d.resize, bounds: { w: box.width, h: box.height } });
            if (r.doc !== this.$doc) { this.$doc = r.doc; this.paintFloat(d.id); }
            return;
        }
        if (!d.moved) {
            if (Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 4) return;
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
    // Zone center is moveTab, any edge is dockPanel, exactly like the matching Move menu item. Never moved, cancelled, or nowhere valid: no-op. A
    // floater drag/resize has no drop zone to resolve: onDragMove already applied it live, so ending the gesture is just a settling commit.
    onDragEnd(e) {
        const d = this.$drag;
        if (!d || e.pointerId !== d.pointerId) return;
        if (d.handle?.hasPointerCapture?.(d.pointerId)) d.handle.releasePointerCapture(d.pointerId);
        this.$drag = null;
        if (d.float) return this.commit('floater');
        this.toggleAttribute('dragging', false);
        this.clearDropZone();
        if (!d.moved || e.type === 'pointercancel' || !d.target) return;
        this.applyMove(d.zone === 'center' ? 'tab' : 'dock', d.panel, d.target, d.zone);
    }
    // Applies a floater's current rect/z straight to its own element's inline style, never draw() (a mid-drag redraw would tear down the element the
    // pointer just captured). The one place this.$doc moves ahead of the DOM until onDragEnd's commit settles it, mirroring onResize/pk-splitter.
    paintFloat(id) {
        const f = findFloater(this.$doc, id), el = this.part('root').querySelector?.(`[data-floater="${id}"]`);
        if (f && el) rectStyle(el, f);
    }
    // Close panel: it stops being declared to the model (updated() drops it from its group, or removes an emptied group, the same repair path a
    // panel leaving the host's DOM already takes), but the host keeps the child in its light DOM, so reopening loses nothing about it.
    closePanel(panel) {
        if (this.$closed.has(panel) || !this.$titles.has(panel)) return;
        const said = `${this.$titles.get(panel) ?? panel} closed`;
        this.$closed.add(panel);
        // synchronous, like a move: the redraw (a panel leaving its group, or the group itself) needs to happen before focus moves
        this.updated();
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
    // The chevron button in a single-panel header, a rail button, or the flyout's own Expand button (issue #636 - it carries the same data-panel
    // as the header's collapse-toggle, since restoring from the flyout is the same expandPanel call; reflyout(), called from the draw() below,
    // then notices the rail button is gone and closes the now-stale flyout on its own). Enter/Space activate any of them, no extra key handling
    // needed. Multi-panel tab groups do not offer collapse yet (see the model's collapsePanel doc comment); a click on a button with neither
    // data-panel nor data-rail-panel is ignored.
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
        const el = this.part('flyout'), x = el.firstElementChild;
        el.hidden = false;
        x.setAttribute('data-panel', panel);
        el.replaceChildren(x, make(this.ownerDocument, 'slot', { name: panel }));
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
        unplace(el); el.hidden = true;
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
