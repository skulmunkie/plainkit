// pk-dock behaviour: renders a dock-tree layout (js/dock-model.js) with pk-splitter for every split and pk-tabs for every group of panels, and turns a resize or a tab
// choice into a pk-layout-change. Panels are the host's own children: any element with slot="<panel id>" (and data-heading, data-group hints). They are slotted, never moved,
// so a panel keeps its state wherever it is docked. The layout logic lives in the model; this file only draws it. Below the phone breakpoint the tree is drawn as one
// tab strip of every panel and the layout is left untouched. A collapsed group at a screen edge (js/dock-model.js's isEdgeGroup) folds to a rail button instead
// of a header; activating it opens the panel as a flyout, positioned with js/positioning.js like pk-context-menu's own menu. The flyout opens with
// an Expand button (issue #636) ahead of the panel's own content, that restores the panel to a normal docked header - the only way back from a
// collapsed rail short of reloading or clearing persistKey's stored layout, and deliberately a separate action from opening/closing the flyout.
import { mediaBelow } from '../../js/breakpoints.js';
import { loadElements } from '../../js/loader.js';
import { fromJson, resize, activate, groups, toJson, collapsePanel, expandPanel, floaters } from '../../js/dock-model.js';
// Rendering (draw() and everything it calls), the pointer drag-to-dock/floater-keyboard cluster and the collapse-to-rail flyout are split into
// their own modules (issue #639): dock.js's own gzip size stayed over the blanket per-element budget even after real minification (#600), because
// nobody had yet cut its own source size. Every export takes this element instance as its first argument; see each file for why it was pulled out.
import * as render from '../../js/dock-render.js';
import * as drag from '../../js/dock-drag.js';
import * as flyout from '../../js/dock-flyout.js';

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


const forward = (ns, names) => Object.fromEntries(names.split(' ').map(n => [n, function (...a) { return ns[n](this, ...a); }]));

export default Base => {
    const Dock = class extends Base {
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
    // The per-element store behind persistKey lives in js/dock-flyout.js (headroom for dock.js, #432 phase D0).
    syncPersist() { flyout.syncPersist(this); }
    updated() {
        this.syncPersist();
        // update() runs once from connectedCallback before connected() gets to set anything up
        const all = readPanels(this.children), phone = Boolean(this.$mq?.matches);
        if (!this.$closed) render.init(this, all);
        // A closed panel stays a host child (so its state, and the memory that it exists, are not lost) but is left out of what the model is told is
        // declared: fromJson then drops it from its group like any panel that is no longer declared, and reopening (removing it from $closed) is just
        // the mirror of a panel newly appearing, which fromJson already re-adds to a group. No dock-model.js change needed for either direction.
        const panels = all.filter(p => !this.$closed.has(p.id));
        // a toolbar-start child added or removed redraws the toolbar too
        const key = JSON.stringify(panels) + phone + this.slotted('toolbar-start').length;
        if (this.layout === this.$given && key === this.$key) return;
        const first = !this.$doc, own = this.layout === this.$given;
        const source = own ? this.$doc && toJson(this.$doc) : this.layout;
        const r = source == null ? { doc: render.seed(this, panels), problems: [] } : fromJson(source, { panels });
        for (const p of r.problems) this.warnOnce(`${p.code}:${p.path}`, p.message, { code: p.code });
        const repaired = !first && own && readingOrder(this.$doc).length > 0 && toJson(r.doc) !== toJson(this.$doc);
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
        if (this.confirmLayout) return flyout.confirm(this, reason, readPanels(this.children));
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
    // Public: back to the default arrangement (js/dock-decl.js); fires pk-layout-change with reason 'reset'.
    resetLayout() { render.reset(this, readPanels(this.children)); }
    // Public (#432 D2): the drawn layout as a JSON string (null before the first draw), and a layout to apply. setLayout validates it like the layout
    // property (and draws it without a pk-layout-change, as setting that does) and returns the repairs the validation made ([] when it was clean).
    getLayout() { return this.$doc ? toJson(this.$doc) : null; }
    setLayout(json) {
        const r = fromJson(json, { panels: readPanels(this.children).filter(p => !this.$closed?.has(p.id)) });
        this.layout = json;
        return r.problems;
    }
    // Public (#432 D2): the menus' own commands from code, with their reasons, announcements and refusals. dockPanel's target is a group id of the layout.
    floatPanel(id, rect) { if (render.canFloat(this, id)) this.floatCmd(id, rect); }
    dockPanel(id, { target, zone = 'center' } = {}) { this.applyMove(zone === 'center' ? 'tab' : 'dock', id, target, zone); }
    collapsePanel(id) { if (render.canCollapse(this, id)) drag.collapseCmd(this, id); }
    raisePanel(id) { drag.raiseCmd(this, id); }
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
    // The other thin forwarders (each calls the same-named export of dock-drag.js / dock-flyout.js with `this` first) are added below by forward().
    onDragMove(e) { drag.onDragMove(this, e, dropZone); }
    onToggle(e) { flyout.onToggle(this, e, collapsePanel, expandPanel); }
    };
    return Object.assign(Dock.prototype, forward(drag, 'settle applyMove floatCmd focusFloater applyDockFloat onFloatKeys onFloatFocus paint onDragStart grab clearDropZone onDragEnd paintFloat'), forward(flyout, 'closePanel openPanel focusPanel toggleFlyout closeFlyout onFlyoutBlur')), Dock;
};
