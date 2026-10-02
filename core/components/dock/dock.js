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
import { defaultLayout, fromJson, resize, activate, groups, toJson, collapsePanel, expandPanel, floaters } from '../../js/dock-model.js';
// Rendering (draw() and everything it calls), the pointer drag-to-dock/floater-keyboard cluster and the collapse-to-rail flyout are split into
// their own modules (issue #639): dock.js's own gzip size stayed over the blanket per-element budget even after real minification (#600), because
// nobody had yet cut its own source size. Every export takes this element instance as its first argument; see each file for why it was pulled out.
import * as render from '../../js/dock-render.js';
import * as drag from '../../js/dock-drag.js';
import * as flyout from '../../js/dock-flyout.js';

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
            // Keyboard/focus equivalents of the pointer drag above (#618 step 3).
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
    // draw() and everything it calls (the splitter/tabs tree, the panel menu, the toolbar's Panels menu) live in js/dock-render.js (issue #639);
    // each thin method here just forwards to it with `this`.
    draw(phone) {
        const doc = this.$doc, root = this.part('root'), d = this.ownerDocument, floating = floaters(doc);
        // the phone strip flattens every group into one reading-order tab list, so "move to another group" has no target there
        this.$phoneStrip = Boolean(phone);
        render.drawToolbar(this, d);
        this.part('empty').hidden = Boolean(doc.root) || floating.length > 0;
        if (!doc.root && !floating.length) { root.replaceChildren(); return this.reflyout(); }
        if (phone) {
            const list = readingOrder(doc);
            root.replaceChildren(render.group(this, d, { id: 'phone', type: 'tabs', panels: list, active: list.includes(this.$phone) ? this.$phone : list[0] }));
            loadElements(root);
            return this.reflyout();
        }
        root.replaceChildren(...(doc.root ? [render.node(this, d, doc.root)] : []));
        render.drawFloating(this, d, floating);
        loadElements(root);
        this.reflyout();
    }
    // Re-finds the rail button for an open flyout after a redraw and repositions over it; js/dock-flyout.js (issue #639).
    reflyout() { flyout.reflyout(this); }
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
    // settle/applyMove/floatCmd/focusFloater/applyDockFloat (the move/float/dock-back-in commands a panel menu choice or a pointer drop resolves
    // to), the floater keyboard/focus and the pointer drag-to-dock/paint helpers below all live in js/dock-drag.js (issue #639: reached far less
    // often than the everyday open/close/resize/tab path, so they were the first cut out of dock.js's own bundle); each thin method here just
    // forwards to it with `this`.
    settle(doc, reason, said, focusNext) { drag.settle(this, doc, reason, said, focusNext); }
    applyMove(kind, panel, group, zone) { drag.applyMove(this, kind, panel, group, zone); }
    floatCmd(panel) { drag.floatCmd(this, panel); }
    focusFloater(panel) { drag.focusFloater(this, panel); }
    applyDockFloat(floaterId, target, zone) { drag.applyDockFloat(this, floaterId, target, zone); }
    onFloatKeys(e) { drag.onFloatKeys(this, e); }
    onFloatFocus(e) { drag.onFloatFocus(this, e); }
    paint(doc, id, reason, said) { drag.paint(this, doc, id, reason, said); }
    onDragStart(e) { drag.onDragStart(this, e); }
    grab(handle, id) { drag.grab(this, handle, id); }
    onDragMove(e) { drag.onDragMove(this, e, dropZone); }
    clearDropZone() { drag.clearDropZone(this); }
    onDragEnd(e) { drag.onDragEnd(this, e); }
    paintFloat(id) { drag.paintFloat(this, id); }
    // closePanel/openPanel/focusPanel, the collapse-to-rail toggle and the flyout open/close below all live in js/dock-flyout.js (issue #639: a
    // less-common path than the everyday open/close/resize/tab dock.js keeps for itself); each thin method here just forwards to it with `this`.
    closePanel(panel) { flyout.closePanel(this, panel); }
    openPanel(panel) { flyout.openPanel(this, panel); }
    focusPanel(panel) { flyout.focusPanel(this, panel); }
    onToggle(e) { flyout.onToggle(this, e, collapsePanel, expandPanel); }
    toggleFlyout(panel, btn) { flyout.toggleFlyout(this, panel, btn); }
    closeFlyout(e) { flyout.closeFlyout(this, e); }
    onFlyoutBlur(e) { flyout.onFlyoutBlur(this, e); }
};
