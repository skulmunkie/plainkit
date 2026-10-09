// A tabbed panel that floats/docks over the whole page (or fills a container): dock to the bottom edge, resize between named
// sizes, toggle with a hotkey, pin open or closed. This is the generic shell mountDevTools uses for its own tabs (console, logs,
// quality...); an app with its own tool-type panels (properties, history, an outline, a console, a chat) around a canvas/record/page
// points mountToolDock at its own panels instead. Not pk-dock: pk-dock is a fixed workspace of resizable splits and tab groups for
// arranging several panels of page content against each other; mountToolDock is one panel with a tab strip that floats over the page.
//
//   const tools = await mountToolDock(null, { mode: 'dock', panels, label: 'My tools', launcherLabel: 'Tools' });
//   const page  = await mountToolDock(el, { mode: 'inline', panels, label: 'My tools', launcherLabel: 'Tools' });
//   tools.toggle(); tools.select(panels[0].id);
//
// Options: mode ('dock' | 'inline'; default 'dock'), hotkey (dock only; default 'Ctrl+`', '' turns it off), tab (first tab), open (dock
// only; start open), size ('small' | 'medium' | 'large'; dock height, default 'medium'), theme, panels (required; see below),
// label (required; the surface's accessible name), launcherLabel (required; the floating launcher button's text).
// A panel is { id, title, mount(element, context) } where mount returns nothing or { destroy(), activate(), deactivate() }; activate and
// deactivate are called as its tab is shown and hidden, so a panel can pause work while unseen. context is { doc, win, theme, whileHidden(fn), isTool(el) }.
// Returns { open(), close(), toggle(), isOpen(), select(id), tabs(), destroy() }.

import { ensureStyles, styleUrls, h, on } from '../../js/mount-support.js';
import { loadElements } from '../../js/loader.js';
import { createLogger } from '../../js/log.js';
import { matchesHotkey } from '../../js/hotkey.js';

const log = createLogger('tool-dock');
const STYLES = ['../../plainkit.css'];
const OWN_STYLES = ['./tool-dock.css'];

export const SIZES = Object.freeze({ small: '25vh', medium: '40vh', large: '65vh' });

// The chord matcher is shared with pk-tray (js/hotkey.js); it stays exported from here.
export { matchesHotkey };

export async function mountToolDock(container, options = {}) {
    const { mode = 'dock', hotkey = 'Ctrl+`', theme, panels = [], label, launcherLabel } = options;
    if (!label) { log.error('mountToolDock needs a label (the surface\'s accessible name)'); throw new TypeError('mountToolDock: label is required'); }
    if (!launcherLabel) { log.error('mountToolDock needs a launcherLabel (the floating launcher button\'s text)'); throw new TypeError('mountToolDock: launcherLabel is required'); }
    const doc = container?.ownerDocument ?? globalThis.document;
    const win = doc.defaultView;
    const dock = mode === 'dock';
    await ensureStyles([...styleUrls(STYLES, import.meta.url), ...styleUrls(OWN_STYLES, import.meta.url)], doc);

    const ids = panels.map(p => p.id);
    let active = ids.includes(options.tab) ? options.tab : ids[0];
    let opened = !dock || Boolean(options.open);
    const mounted = new Map();

    // menu: the dock has a fixed height (no room for the tabs to wrap onto more rows) and its own trailing controls
    // (dock size, close), so a scroll fade sitting right next to them is easy to miss; a "..." menu is the clearer overflow.
    const tabs = h(doc, 'pk-tabs', { value: active, label, overflow: 'menu' });
    const bodies = new Map();
    for (const p of panels) {
        tabs.append(h(doc, 'pk-tab', { value: p.id }, p.title));
        const body = h(doc, 'div', { class: 'td-panel-body' });
        bodies.set(p.id, body);
        tabs.append(h(doc, 'pk-tab-panel', { value: p.id }, body));
    }

    // Dock mode is a pk-tray (edge, launcher, sizes, hotkey and focus handling live in the element); inline mode is a plain section.
    const surface = h(doc, dock ? 'pk-tray' : 'section', dock
        ? { label, 'launcher-label': launcherLabel, hotkey, size: SIZES[options.size] ? options.size : 'medium', sizes: true, open: opened }
        : { class: 'td-surface', 'aria-label': label }, tabs);
    if (theme) surface.setAttribute('data-theme', theme);
    if (dock) doc.body.append(surface); else container.replaceChildren(surface);
    loadElements(surface).catch(err => log.debug('elements did not load (loadElements reports it)', err));

    // Every panel mounts up front (a console-style panel must record from the start); activate/deactivate follow what is visible.
    // whileHidden runs a measurement with the dock out of the way (so the page is measured, not the dock); isTool says whether an element is ours.
    const whileHidden = fn => {
        if (!dock) return fn();
        const [parent, next] = [surface.parentNode, surface.nextSibling]; // out of the document while fn measures
        surface.remove();
        try { return fn(); } finally { parent.insertBefore(surface, next); }
    };
    const context = { doc, win, theme, whileHidden, isTool: e => surface.contains(e) };
    await Promise.all(panels.map(async p => { mounted.set(p.id, (await p.mount(bodies.get(p.id), context)) ?? {}); }));
    const sync = () => { for (const [id, m] of mounted) (opened && id === active ? m.activate : m.deactivate)?.(); };
    on(tabs, 'pk-tab-change', e => { active = e.detail.value; sync(); });

    // The tray opens and closes itself (launcher, Close, Escape, the chord); follow it so the panels activate and deactivate.
    if (dock) {
        on(surface, 'pk-open', () => { opened = true; sync(); });
        on(surface, 'pk-close', e => { if (!e.defaultPrevented) { opened = false; sync(); } });
    }
    sync();

    const api = {
        open() { opened = true; if (dock) surface.show(); sync(); },
        close() { opened = false; if (dock) surface.hide(); sync(); },
        toggle() { opened ? api.close() : api.open(); },
        isOpen: () => opened,
        select(id) { if (ids.includes(id)) { active = id; tabs.setAttribute('value', id); sync(); } },
        tabs: () => ids.slice(),
        destroy() {
            for (const m of mounted.values()) { m.deactivate?.(); m.destroy?.(); }
            surface.remove();
        },
    };
    return api;
}
