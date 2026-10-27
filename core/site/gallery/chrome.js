// The Gallery's frame, built with DOM APIs for the embed page (a pk-app-shell with its own nav) and the site app's module (hosted: a plain stack, the app owns the nav): the preview bar (Display menu,
// Details), the slim bar of a full-page sample, the view and the docked Details drawer with its resize handle. chrome.shell goes into the page; show(full) says which page is on show (a full-page
// sample or null), paint() the theme, width or text size changed, inspect { live, change, shown } is what an element page tells the drawer. settings { get, set } keeps 'inspector' ('1' | '0') and
// 'inspector-w' (pixels); act { theme, width, scale, go } is what the controls do; on(target, type, fn) adds a listener the owner removes.
import { createLogger } from '../../js/log.js';
import { sectionsFor } from '../../js/gallery-sections.js';
import { mediaBelow } from '../../js/breakpoints.js';
import { applyDynamic } from '../../js/dynamic.js';
import { clampSize, keySize, pointerSize } from '../../js/size.js';
import { h } from './mount-support.js';
import { KIND_LABEL } from './gallery-views.js';

const log = createLogger('gallery-chrome');
// js/element-inspector.js belongs to the tools package: imported when the drawer first needs it, so a gallery without tools shows a notice instead of failing.
let inspectorModule = null;
const loadInspector = () => inspectorModule ??= import('../../js/element-inspector.js').catch(err => { log.warn('The element inspector could not load; add the tools option to enable it.', err); return null; });

// A boolean or string prop set through its attribute, so it also lands on an element that is not upgraded yet (the elements load on demand).
export const setAttr = (el, name, on) => { if (typeof on === 'boolean') el.toggleAttribute(name, on); else el.setAttribute(name, on); };

// The pagebar's title is the page's only heading in a full view (a template, pattern or layout preview has no pk-page-header): it should carry
// level-1 heading semantics only while that bar is actually showing, or a route that is not full would carry a second, invisible h1 in the DOM
// (the sweep's h1 count does not look at [hidden] or display: none). Pure, so it is tested without a doc.
export const pagebarTitleAttrs = isFull => (isFull ? { role: 'heading', 'aria-level': '1' } : {});

const SCALES = [['0.9', '90%'], ['1', '100%'], ['1.15', '115%'], ['1.3', '130%']];

export function createChrome({ doc, B, hosted, state, settings, act, on, pageUrl, navVariant, sections = () => [] }) {
    const el = (tag, attrs, ...kids) => h(doc, tag, attrs, ...kids);
    // The viewport and the text size live in one Display menu at every width, shared by the preview bar and the slim bar (no per-breakpoint variants).
    const radios = (head, attr, rows, current, scoped) => [el('pk-menu-item', { type: 'header', 'data-nav-scope': scoped, hidden: scoped }, head),
        ...rows.map(([v, l]) => el('pk-menu-item', { type: 'radio', [`data-${attr}`]: v, checked: v === current, 'data-nav-scope': scoped, hidden: scoped }, l))];
    const display = withNav => el('pk-dropdown', { placement: 'bottom-end' }, el('pk-button', { slot: 'trigger', variant: 'ghost' }, 'Display'),
        ...(withNav ? radios('Navigation', 'nav', [['side', 'Side'], ['top', 'Top']], 'side', true) : []), ...radios('Viewport', 'set-width', [['desktop', 'Desktop'], ['phone', 'Phone 375']], 'desktop'), ...radios('Text size', 'scale', SCALES, '1'));
    const at = name => (hosted ? {} : { slot: name }); // the stack has no slots
    const title = el('strong', { id: 'gx-title' }), back = el('pk-button', { variant: 'ghost', icon: true, id: 'gx-back', href: `${B()}/samples`, label: 'Back' }, el('pk-icon', { name: 'chevron-left' }));
    const theme = el('pk-button', { variant: 'ghost', id: 'gx-theme', 'data-toggle-theme': true }), open = el('pk-button', { variant: 'ghost', id: 'gx-open', href: `${B()}/samples`, target: '_blank', rel: 'noopener', label: 'Open in a new page' }, 'Open');
    const details = el('pk-button', { variant: 'ghost', toggle: true, id: 'gx-inspect', 'aria-controls': 'gx-inspector', hidden: true }, 'Details');
    const bar = el('pk-toolbar', { ...at('header'), id: 'gx-bar', role: 'toolbar', 'aria-label': 'Preview settings' }, display(false), details);
    const pagebar = el('pk-toolbar', { ...at('header'), id: 'gx-pagebar', role: 'toolbar', 'aria-label': 'Page preview', hidden: true }, back, title, display(true), theme, open);
    const view = el('div', { id: 'gx-view' }), handle = el('div', { id: 'gx-resize', role: 'separator', 'aria-orientation': 'vertical', 'aria-label': 'Resize the inspector', tabindex: 0, hidden: true });
    const body = el('pk-stack', { fill: true, gap: 'none', id: 'gx-body' }), drawer = el('pk-drawer', { docked: true, id: 'gx-inspector', heading: 'Inspector', 'aria-label': 'Inspector' }, el('div', { id: 'gx-inspector-body' }));
    body.append(view, handle, drawer);
    // the embed's own nav column and its phone button come first; the site app has its own
    const nav = hosted ? null : el('pk-side-nav', { slot: 'nav', id: 'gx-nav', class: 'gx-nav', label: 'Gallery contents', filterable: true });
    const shell = hosted ? el('pk-stack', { fill: true, gap: 'none', 'data-flush': true, id: 'gx-shell' }, bar, pagebar, body)
        : el('pk-app-shell', { flush: true, id: 'gx-shell' }, nav, el('pk-button', { slot: 'header', variant: 'ghost', toggle: true, 'data-nav-toggle': true }, 'Contents'), bar, pagebar, body);

    const cur = { full: null, inspecting: null }; let inspector = null;
    const phone = () => mediaBelow('phone').matches;

    // The slim bar: back to the list, the title, the template nav variant, viewport, text size, theme, open in a new page.
    function paint() {
        for (const b of shell.querySelectorAll('[data-set-theme]')) setAttr(b, 'pressed', b.dataset.setTheme === state.theme);
        for (const b of shell.querySelectorAll('[data-set-width]')) setAttr(b, 'checked', b.dataset.setWidth === state.width);
        for (const i of shell.querySelectorAll('pk-menu-item[data-scale]')) setAttr(i, 'checked', Number(i.dataset.scale) === state.scale);
        const full = cur.full;
        shell.toggleAttribute('data-full', Boolean(full));
        bar.hidden = Boolean(full); pagebar.hidden = !full;
        if (nav) nav.hidden = Boolean(full);
        const attrs = pagebarTitleAttrs(Boolean(full));
        for (const name of ['role', 'aria-level']) { if (attrs[name] !== undefined) title.setAttribute(name, attrs[name]); else title.removeAttribute(name); }
        if (!full) return;
        title.textContent = full.title;
        back.setAttribute('href', `${B()}/samples/${full.kind}`); back.setAttribute('label', `Back to ${KIND_LABEL[full.kind]}`);
        open.setAttribute('href', pageUrl(full, { width: state.width }));
        for (const n of pagebar.querySelectorAll('[data-nav-scope]')) n.hidden = full.kind !== 'templates';
        for (const a of pagebar.querySelectorAll('[data-nav]')) { a.dataset.goto = `${B()}/samples/${full.kind}/${full.id}?nav=${a.dataset.nav}`; setAttr(a, 'checked', a.dataset.nav === navVariant()); }
        theme.textContent = state.theme === 'dark' ? 'Dark' : 'Light';
        theme.setAttribute('label', `Theme: ${state.theme}. Switch to ${state.theme === 'dark' ? 'light' : 'dark'}`);
    }

    function setInspector(openIt, remember = true) {
        setAttr(drawer, 'open', openIt);
        setAttr(details, 'pressed', openIt);
        handle.hidden = !openIt;
        view.toggleAttribute('data-inspecting', openIt);
        if (remember) settings.set('inspector', openIt ? '1' : '0');
    }
    function renderInspector() {
        // A full-page sample owns the whole area; every other view has the Details drawer: an element page fills it, the rest show its empty state.
        details.hidden = Boolean(cur.full);
        if (cur.full) { setAttr(drawer, 'open', false); handle.hidden = true; view.removeAttribute('data-inspecting'); return; }
        const now = cur.inspecting;
        drawer.setAttribute('heading', now ? `${now.meta.title}: details` : 'Inspector');
        const inspectorBody = drawer.querySelector('#gx-inspector-body');
        loadInspector().then(mod => {
            if (!mod) { inspectorBody.textContent = 'Add the tools option to enable the inspector.'; return; }
            inspector ??= mod.createElementInspector(inspectorBody);
            inspector.show(now && { meta: now.meta, element: now.element, extraSections: sectionsFor(sections(), now.meta.tag).map(mod.sectionFromData) });
        });
        const stored = settings.get('inspector');
        setInspector(stored == null ? Boolean(now) && !phone() : stored === '1', false);
    }

    // The inspector's own drag-resize handle: pk-splitter's pointer/keyboard/clamp engine (js/size.js, shared with pk-splitter rather than
    // duplicated), but not the pk-splitter element itself. The docked drawer it resizes positions itself absolutely (via --inspector-w) and
    // becomes a full-width bottom sheet on phone (drawer.css); nesting it as a splitter pane would fight that sizing on the very breakpoint
    // where the handle is hidden anyway, so this stays a plain handle that reports a width in pixels (unit: 'px'), with the box's end edge
    // standing in for pk-splitter's "start" via rtl: true (see #391).
    const win = doc.defaultView;
    const bounds = () => ({ min: 320, max: Math.round(win.innerWidth * 0.7) });
    const width = () => parseInt(win.getComputedStyle(shell).getPropertyValue('--inspector-w'), 10) || 0;
    const apply = px => { const { min, max } = bounds(); const w = clampSize(px, min, max); shell.dataset.dyn = `--inspector-w:${w}px`; applyDynamic(shell); return w; };
    const saved = Number(settings.get('inspector-w')); if (saved) apply(saved);
    const remember = w => settings.set('inspector-w', String(w));
    on(handle, 'pointerdown', e => {
        e.preventDefault(); handle.setPointerCapture(e.pointerId);
        const move = ev => { const box = body.getBoundingClientRect(); apply(pointerSize(ev.clientX, 0, box.left, box.width, 0, true, 'px')); };
        const up = () => { handle.removeEventListener('pointermove', move); handle.removeEventListener('pointerup', up); remember(width()); };
        on(handle, 'pointermove', move); on(handle, 'pointerup', up);
    });
    on(handle, 'keydown', e => {
        const { min, max } = bounds();
        const next = keySize(e.key, width(), { min, max, step: 24, horizontal: true, rtl: true });
        if (next !== null) remember(apply(next));
    });
    on(drawer, 'pk-close', () => setInspector(false));
    on(shell, 'click', e => {
        if (e.target.closest('#gx-inspect')) setInspector(!drawer.hasAttribute('open'));
        const t = e.target.closest('[data-set-theme]'), tt = e.target.closest('[data-toggle-theme]');
        if (t || tt) act.theme(t ? t.dataset.setTheme : state.theme === 'dark' ? 'light' : 'dark');
        const w = e.target.closest('[data-set-width]'); if (w) act.width(w.dataset.setWidth);
        const go = e.target.closest('[data-goto]'); if (go) act.go(go.dataset.goto);
        const sc = e.target.closest('pk-menu-item[data-scale]'); if (sc) act.scale(Number(sc.dataset.scale));
    });
    paint();
    return {
        shell, view, nav, paint,
        show(full) { cur.full = full; cur.inspecting = null; paint(); renderInspector(); },
        redraw() { if (inspector && cur.inspecting) renderInspector(); },
        inspect: { live: (meta, element) => { cur.inspecting = { meta, element }; }, change: () => inspector?.refresh(), shown: renderInspector },
    };
}
