// pk-dock's tree-to-DOM rendering, split out of components/dock/dock.js (issue #639) to keep dock.js's own bundle under the blanket per-element gzip
// budget: draw() and everything it calls (the splitter/tabs tree, the panel menu, the toolbar's Panels menu) is one cohesive, self-contained piece
// of dock.js that only ever runs from draw() itself, so moving it to its own statically-imported module shrinks dock.js's own measured file with
// no behaviour change (the generated dist module is never inlined into the element that imports it; see tools/build.mjs). Every export takes the
// pk-dock element instance (`el`) as its first argument and reads the same private fields dock.js always did ($doc, $titles, $phoneStrip, $flyout,
// $closed); nothing here is a public API of its own.
import { loadElements } from './loader.js';
import { groups, isEdgeGroup, defaultLayout, floatPanel } from './dock-model.js';

// The four ways to dock a panel beside another group (zone -> its menu label). Center (add as tab) is offered separately, first.
const ZONE_LABELS = [['left', 'Dock left of'], ['right', 'Dock right of'], ['top', 'Dock above'], ['bottom', 'Dock below']];

const make = (doc, tag, attrs = {}) => { const e = doc.createElement(tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); return e; };
export const rectStyle = (node, f) => Object.assign(node.style, { left: `${f.x}px`, top: `${f.y}px`, width: `${f.w}px`, height: `${f.h}px`, zIndex: f.z });

// Each `floating` entry (js/dock-model.js) is an absolutely-positioned overlay inside .root's own bounds (never the shell/viewport, per the
// design's "floating layer: inside the dock bounds only"), never drawn for the phone strip. Its group is a plain `tabs` node rendered by group()
// itself (data-floater doubles as the CSS hook and the id onDragStart reads back), rather than a second tab-rendering path or an extra wrapper.
export function drawFloating(el, d, floating) {
    const root = el.part('root');
    for (const f of floating) {
        const g = group(el, d, f.group, f.id);
        g.setAttribute('data-floater', f.id);
        rectStyle(g, f);
        // The frame itself is the keyboard handle (onFloatKeys). aria-describedby points at dock.html's one static hint, not a copy each.
        g.tabIndex = 0;
        g.setAttribute('aria-roledescription', 'floating panel');
        g.setAttribute('aria-describedby', 'floater-help');
        g.append(make(d, 'div', { 'data-grip': '' }));
        root.append(g);
    }
}

export function node(el, d, n) {
    if (n.type === 'tabs') return group(el, d, n);
    const s = make(d, 'pk-splitter', { orientation: n.orientation, size: n.size, min: n.min, max: n.max, label: el.resizeLabel, 'data-node': n.id });
    for (const [slot, child] of [['start', n.a], ['end', n.b]]) { const cell = make(d, 'div', { slot }); cell.append(node(el, d, child)); s.append(cell); }
    return s;
}

// floaterId (only from drawFloating) steers panelTrigger toward dockFloating's targets instead of moveTab/dockPanel's tree-only ones.
export function group(el, d, n, floaterId) {
    const g = el.shadowRoot.querySelector('template').content.firstElementChild.cloneNode(true), title = id => el.$titles.get(id) ?? id;
    g.setAttribute('data-node', n.id);
    const h = g.querySelector('[part="header"]'), body = g.querySelector('[part="body"]'), movable = !el.$phoneStrip && groups(el.$doc).length > 1;
    const railBtn = g.querySelector('[part="rail-button"]');
    // A grab cursor where a pointer drag can actually pick this group up.
    g.toggleAttribute('data-movable', movable);
    if (n.panels.length === 1) {
        const panel = n.panels[0], collapsed = (el.$doc.collapsed ?? []).includes(panel), bodyId = `b-${panel}`;
        // A collapsed group at a screen edge folds to a narrow rail button (icon strip in miniature: title only for now) that opens the panel as a
        // flyout on click, the familiar IDE behaviour; a collapsed group that is not at an edge (the centre column) keeps the header-only fold.
        if (collapsed && isEdgeGroup(el.$doc, n.id)) {
            h.remove(); body.remove();
            g.setAttribute('data-rail', '');
            g.setAttribute('aria-label', title(panel));
            railBtn.hidden = false;
            railBtn.setAttribute('data-rail-panel', panel);
            railBtn.pressed = el.$flyout === panel;
            railBtn.controls = el.part('flyout');
            railBtn.textContent = title(panel);
            return g;
        }
        railBtn.remove();
        h.id = `h-${panel}`;
        const toggle = h.querySelector('[part="collapse-toggle"]');
        toggle.hidden = !canCollapse(el, panel);
        toggle.pressed = !collapsed;
        toggle.controls = body;
        toggle.setAttribute('data-panel', panel);
        toggle.querySelector('[part="title"]').textContent = title(panel);
        if (!el.$phoneStrip) h.append(panelTrigger(el, d, panel, n.id, movable, floaterId));
        body.id = bodyId;
        body.hidden = collapsed;
        body.append(make(d, 'slot', { name: panel }));
        g.setAttribute('aria-labelledby', h.id);
        return g;
    }
    h.remove(); body.remove(); railBtn.remove();
    g.setAttribute('aria-label', el.label || 'Panels');
    // scroll: a group's tab list never wraps onto a second row (a narrow group, or the phone strip's own row) — it scrolls sideways instead, like pk-tabs elsewhere.
    const tabs = make(d, 'pk-tabs', { value: n.active, scroll: '' });
    for (const id of n.panels) {
        const tab = make(d, 'pk-tab', { value: id }); tab.textContent = title(id);
        const panel = make(d, 'pk-tab-panel', { value: id }), pbody = make(d, 'div', { part: 'body' }); pbody.append(make(d, 'slot', { name: id })); panel.append(pbody);
        tabs.append(tab, panel);
    }
    if (!el.$phoneStrip) {
        const trailing = make(d, 'div', { slot: 'trailing' });
        trailing.append(panelTrigger(el, d, n.active, n.id, movable, floaterId));
        tabs.append(trailing);
    }
    g.append(tabs);
    return g;
}

// A panel menu: "Move to..." (every other group) when movable, then Float, then Close. floaterId (already floating, from drawFloating) swaps the
// Move section for dockFloating's own "dock back in" targets instead: moveTab/dockPanel only know tree panels.
export function panelTrigger(el, d, panel, group, movable, floaterId) {
    const dd = make(d, 'pk-dropdown', { placement: 'bottom-end' });
    const btn = make(d, 'pk-button', { slot: 'trigger', variant: 'ghost', size: 'mini', icon: '', 'icon-name': 'more', label: `${el.$titles.get(panel) ?? panel} panel menu` });
    dd.append(btn);
    const targets = floaterId ? groups(el.$doc) : movable ? groups(el.$doc).filter(t => t.id !== group) : [];
    const subj = floaterId ?? panel, verb = floaterId ? 'dockfloat' : 'dock', tabVerb = floaterId ? 'dockfloat' : 'tab';
    for (const target of targets) {
        const targetTitle = el.$titles.get(target.active) ?? target.active;
        const header = make(d, 'pk-menu-item', { type: 'header' }); header.textContent = targetTitle;
        const tab = make(d, 'pk-menu-item', { value: `${tabVerb}:${subj}:${target.id}${floaterId ? ':center' : ''}` }); tab.textContent = 'Add as tab';
        dd.append(header, tab);
        for (const [zone, text] of ZONE_LABELS) {
            const item = make(d, 'pk-menu-item', { value: `${verb}:${subj}:${target.id}:${zone}` }); item.textContent = `${text} ${targetTitle}`;
            dd.append(item);
        }
    }
    if (targets.length) dd.append(make(d, 'pk-menu-item', { type: 'divider' }));
    if (!floaterId && !el.$phoneStrip && canFloat(el, panel)) {
        const float = make(d, 'pk-menu-item', { value: `float:${panel}` }); float.textContent = 'Float';
        dd.append(float, make(d, 'pk-menu-item', { type: 'divider' }));
    }
    if (canClose(el, panel)) { const close = make(d, 'pk-menu-item', { value: `close:${panel}` }); close.textContent = 'Close'; dd.append(close); }
    return dd;
}

// The toolbar: a stable, always-there row (host apps fill slot toolbar-start with their own File/Edit/View-style menus; the dock never invents
// their content, only gives it a place next to its own controls) plus, at its end, the Panels menu once something is closed. The toolbar itself
// shows whenever the host gave it something (the slot) or the dock has (a closed panel); with neither, it collapses to nothing rather than
// reserving an empty bar.
export function drawToolbar(el, d) {
    const bar = el.part('toolbar'), closed = [...el.$titles ?? []].map(([id]) => id).filter(id => el.$closed.has(id));
    bar.querySelector('[data-panels]')?.remove();
    bar.hidden = closed.length === 0 && el.slotted('toolbar-start').length === 0;
    if (!closed.length) return;
    const panels = make(d, 'div', { 'data-panels': '' });
    const dd = make(d, 'pk-dropdown', { placement: 'bottom-end' });
    const btn = make(d, 'pk-button', { slot: 'trigger', variant: 'ghost', size: 'mini', icon: '', 'icon-name': 'dashboard', label: `Panels (${closed.length} closed)` });
    dd.append(btn);
    for (const id of closed) { const item = make(d, 'pk-menu-item', { value: `open:${id}` }); item.textContent = `Open ${el.$titles.get(id) ?? id}`; dd.append(item); }
    panels.append(dd);
    bar.append(panels);
    loadElements(bar);
}

// Panel declarations (issue #432 phase D1; in this module so no new dock file needs a package entry): a host declares per-panel options as data-* attributes
// on the slotted node, read live and never written. data-closable="false" / data-collapsible="false" drop Close / the collapse toggle; data-open="false" starts a
// panel closed; data-float starts it floating; the first panel with an explicit data-group="center" is the permanent centre (never closed or floated, and the tab the
// phone strip starts on).
const pnode = (el, id) => [...el.children].find(c => c.getAttribute('slot') === id);
const off = (c, name) => c?.getAttribute(name) === 'false';

// The panel id of the centre panel, or undefined.
export const center = el => [...el.children].find(c => c.getAttribute('data-group') === 'center' && c.getAttribute('slot'))?.getAttribute('slot');
export const canClose = (el, id) => id !== center(el) && !off(pnode(el, id), 'data-closable');
export const canFloat = (el, id) => id !== center(el) && el.floating !== false;
export const canCollapse = (el, id) => !off(pnode(el, id), 'data-collapsible');

// First connect, and resetLayout(): panels with data-open="false" start closed and the phone strip starts on the centre panel.
export function init(el, all) {
    el.$closed = new Set(all.filter(p => off(pnode(el, p.id), 'data-open') && canClose(el, p.id)).map(p => p.id));
    el.$phone = center(el);
}

// The default arrangement for the open panels, with data-float panels taken out of their groups.
export function seed(el, panels) {
    let doc = defaultLayout(panels);
    for (const p of panels) if (pnode(el, p.id)?.getAttribute('data-float') != null && canFloat(el, p.id)) doc = floatPanel(doc, { panel: p.id, rect: { x: 48, y: 48, w: 260, h: 180 } }).doc;
    return doc;
}

// resetLayout(): closed panels reopen (except data-open="false" ones) and the default arrangement returns.
export function reset(el, all) {
    init(el, all);
    el.$given = {}; el.layout = null;
    el.updated();
    el.commit('reset');
}
