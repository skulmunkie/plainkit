// The dev tools as a module: mountDevTools(container, options) puts the SDK's live tools (performance, console, and any panel you add)
// in one tabbed surface, either docked over the page (Ctrl+` toggles it, like a browser's dev tools) or inline in a container.
// Built only from SDK components (pk-tabs, pk-button, pk-button-group) around the performance and console modules, plus the Quality
// (the SDK page checks on the live page), Inspector (pk-* elements on the page) and Theme (the theme editor, live on this page) panels in panels.js.
//
//   const tools = await mountDevTools(null, { mode: 'dock' });      // a floating button and a bottom dock on any page
//   const page  = await mountDevTools(el, { mode: 'inline' });      // the same tabs, filling a container
//   tools.toggle(); tools.select('console');
//
// Options: mode ('dock' | 'inline'; default 'dock'), hotkey (dock only; default 'Ctrl+`', '' turns it off), tab (first tab), open (dock
// only; start open), size ('small' | 'medium' | 'large'; dock height, default 'medium'), theme, panels (extra tabs, below).
// A panel is { id, title, mount(element, context) } where mount returns nothing or { destroy(), activate(), deactivate() }; activate and
// deactivate are called as its tab is shown and hidden, so a panel can pause work while unseen. context is { doc, win, theme, whileHidden(fn), isTool(el) }.
// Returns { open(), close(), toggle(), isOpen(), select(id), tabs(), destroy() }.

import { mountPerformance } from '../performance/performance.js';
import { mountConsole } from '../console/console.js';
import { ensureStyles, styleUrls } from '../../js/mount-support.js';
import { loadElements } from '../../js/loader.js';
import { qualityPanel, inspectorPanel, themePanel } from './panels.js';

const STYLES = ['../../plainkit.css'];
const OWN_STYLES = ['./devtools.css'];

export const SIZES = Object.freeze({ small: '25vh', medium: '40vh', large: '65vh' });

// The built-in panels, in the shape a panel of your own takes. Console mounts first so it records from the start.
export const BUILT_IN = Object.freeze([
    { id: 'console', title: 'Console', mount: async el => { const c = await mountConsole(el, {}); return { destroy: () => c.destroy() }; } },
    {
        id: 'performance', title: 'Performance',
        mount: async el => { const p = await mountPerformance(el, { autostart: false }); return { destroy: () => p.destroy(), activate: () => p.start(), deactivate: () => p.stop() }; },
    },
    qualityPanel,
    inspectorPanel,
    themePanel,
]);

function h(doc, tag, props = {}, ...children) {
    const el = doc.createElement(tag);
    for (const [k, v] of Object.entries(props)) if (v !== undefined && v !== null && v !== false) el.setAttribute(k, v === true ? '' : v);
    el.append(...children.filter(c => c !== null && c !== undefined));
    return el;
}

// Does this key event match a chord like "Ctrl+`" or "Ctrl+Shift+D"?
export function matchesHotkey(event, chord) {
    if (!chord) return false;
    const parts = chord.split('+').map(s => s.trim());
    const key = parts.pop();
    const want = new Set(parts.map(p => p.toLowerCase()));
    const has = { ctrl: Boolean(event.ctrlKey || event.metaKey), shift: Boolean(event.shiftKey), alt: Boolean(event.altKey) };
    return event.key.toLowerCase() === key.toLowerCase()
        && want.has('ctrl') === has.ctrl && want.has('shift') === has.shift && want.has('alt') === has.alt;
}

export async function mountDevTools(container, options = {}) {
    const { mode = 'dock', hotkey = 'Ctrl+`', theme, panels = [] } = options;
    const doc = container?.ownerDocument ?? globalThis.document;
    const win = doc.defaultView;
    const dock = mode === 'dock';
    await ensureStyles([...styleUrls(STYLES, import.meta.url), ...styleUrls(OWN_STYLES, import.meta.url)], doc);

    const all = [...BUILT_IN, ...panels];
    const ids = all.map(p => p.id);
    let active = ids.includes(options.tab) ? options.tab : ids[0];
    let opened = !dock || Boolean(options.open);
    const mounted = new Map();

    const tabs = h(doc, 'pk-tabs', { value: active, label: 'Dev tools' });
    const bodies = new Map();
    for (const p of all) {
        tabs.append(h(doc, 'pk-tab', { value: p.id }, p.title));
        const body = h(doc, 'div', { class: 'dt-panel-body' });
        bodies.set(p.id, body);
        tabs.append(h(doc, 'pk-tab-panel', { value: p.id }, body));
    }

    const surface = h(doc, dock ? 'aside' : 'section', { class: `dt-surface dt-surface--${mode}`, 'aria-label': 'Dev tools' }, tabs);
    let toggleButton = null;
    let sizes = null;
    if (theme) surface.setAttribute('data-theme', theme);
    if (dock) {
        surface.hidden = !opened;
        surface.style.setProperty('--dt-height', SIZES[options.size] ?? SIZES.medium);
        sizes = h(doc, 'pk-button-group', { label: 'Dock height', mode: 'single', slot: 'trailing' },
            ...Object.keys(SIZES).map(k => h(doc, 'pk-button', { toggle: true, variant: 'ghost', size: 'mini', value: k, pressed: k === (options.size ?? 'medium') }, k[0].toUpperCase() + k.slice(1))));
        const close = h(doc, 'pk-button', { size: 'mini', variant: 'ghost', label: 'Close dev tools', slot: 'trailing' }, 'Close');
        tabs.append(sizes, close);
        close.addEventListener('click', () => api.close());
        sizes.addEventListener('pk-toggle', e => { const v = e.target.closest('pk-button')?.getAttribute('value'); if (v && SIZES[v]) surface.style.setProperty('--dt-height', SIZES[v]); });
        toggleButton = h(doc, 'pk-button', { class: 'dt-launcher', size: 'mini', variant: 'secondary' }, 'Dev tools');
        toggleButton.addEventListener('click', () => api.toggle());
        doc.body.append(surface, toggleButton);
    } else {
        container.replaceChildren(surface);
    }
    loadElements(surface).catch(() => {});
    if (toggleButton) loadElements(toggleButton).catch(() => {});

    // Every panel mounts up front (the console must record from the start); activate/deactivate follow what is visible.
    // whileHidden runs a measurement with the tools out of the way (so the page is measured, not the tools); isTool says whether an element is ours.
    const whileHidden = fn => {
        const before = [surface.hidden, toggleButton?.hidden];
        surface.hidden = true; if (toggleButton) toggleButton.hidden = true;
        try { return fn(); } finally { surface.hidden = before[0]; if (toggleButton) toggleButton.hidden = before[1]; }
    };
    const context = { doc, win, theme, whileHidden, isTool: e => surface.contains(e) || e === toggleButton };
    await Promise.all(all.map(async p => { mounted.set(p.id, (await p.mount(bodies.get(p.id), context)) ?? {}); }));
    const sync = () => { for (const [id, m] of mounted) (opened && id === active ? m.activate : m.deactivate)?.(); };
    tabs.addEventListener('pk-tab-change', e => { active = e.detail.value; sync(); });

    const onKey = e => { if (dock && matchesHotkey(e, hotkey)) { e.preventDefault(); api.toggle(); } };
    if (dock) doc.addEventListener('keydown', onKey);
    sync();

    const api = {
        open() { opened = true; if (dock) { surface.hidden = false; toggleButton.setAttribute('aria-pressed', 'true'); } sync(); },
        close() { opened = false; if (dock) { surface.hidden = true; toggleButton.setAttribute('aria-pressed', 'false'); } sync(); },
        toggle() { opened ? api.close() : api.open(); },
        isOpen: () => opened,
        select(id) { if (ids.includes(id)) { active = id; tabs.setAttribute('value', id); sync(); } },
        tabs: () => ids.slice(),
        destroy() {
            doc.removeEventListener('keydown', onKey);
            for (const m of mounted.values()) { m.deactivate?.(); m.destroy?.(); }
            surface.remove(); toggleButton?.remove();
        },
    };
    return api;
}
