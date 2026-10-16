// The shared shell every page-type element composes (#423): one place that draws a page's state region (loading, empty, error, forbidden or
// ready) AND makes sure the pk-* elements that state uses are loaded, so a page type says what state it is in and nothing more.
// showTitleBar (breadcrumb + actions) and showTabs draw the rest of the frame; page types compose them (#423).
//
//   import { showState } from '../../js/page-shell.js';
//   showState(box, 'loading', { label: 'Loading orders' });
//   showState(box, 'error', { error: err, retry: () => this.fetch() });   // description defaults to the error's message
//   showState(box, 'ready');
import { renderState } from './page-states.js';
import { loadElements } from './loader.js';

/** renderState(box, state, opts) then loadElements(box). `opts.error` (a caught value) becomes the description when none is given. */
export function showState(box, state, opts = {}) {
    const { error, ...rest } = opts;
    if (error !== undefined && rest.description === undefined) rest.description = error?.message ?? String(error);
    renderState(box, state, rest);
    if (state !== 'ready') loadElements(box);
}

/** The page title as the SDK's heading element: a pk-heading level 1 for the page element's light DOM (slot "title"; `plain` keeps the heading's own size; the factory that creates the page appends it, so it is findable under main and focusable with tabindex -1). */
export function titleHeading(doc, text, { focusable = true, plain = false } = {}) {
    const h = doc.createElement('pk-heading');
    for (const [k, v] of Object.entries({ slot: 'title', level: 1, ...(plain ? {} : { weight: 'semibold', variant: 'h3' }) })) h.setAttribute(k, v);
    if (focusable) h.setAttribute('tabindex', '-1');
    h.textContent = text;
    return h;
}

/**
 * Mounts a built-in page element `el` in `host` with its title: the host owns the light DOM, so the factory appends the pk-heading (titleHeading), and waits until the
 * title bar's elements are defined, so the title bar is drawn (and focusable) when mountPage resolves, which is when the app moves focus to the title.
 */
export function mountTitled(host, el, text, opts) {
    let dead = false;
    const doc = host.ownerDocument, win = doc.defaultView, stop = () => { dead = true; el.remove(); }, cleanup = () => stop();
    if (text) el.append(titleHeading(doc, text, opts));
    if (!win) { host.append(el); return cleanup; }
    // Appended once the elements the title bar needs are defined (found in a detached tree), so the bar is drawn with the page and the content under it never shifts down.
    const probe = doc.createElement('div'), tags = text ? [el.localName, 'pk-heading'] : [el.localName];
    probe.append(el);
    if (text && !opts?.plain) { for (const n of ['pk-page-shell', 'pk-page-header']) { probe.append(doc.createElement(n)); tags.push(n); } }
    loadElements(probe);
    const ready = Promise.all(tags.map(n => win.customElements.whenDefined(n))).then(() => { if (!dead) host.append(el); });
    // The cleanup is also a thenable: awaiting the factory (mountPage does) waits until the page is in, then yields a plain cleanup.
    return Object.assign(cleanup, { then: (ok, no) => ready.then(() => ok(stop), no) });
}

/**
 * The title bar, filled into the page's pk-page-shell `shell` (a child of the page's shadow tree) from `host.config` { heading?, breadcrumb?: [{ label, href? }], actions?: [{ key, label, href?, variant?, hint? }] }:
 * the shell draws the pk-page-header; the breadcrumb, actions and title are its slotted children. `cfg` overrides `host.config` for a page whose own config already uses `heading` or `actions` for something else (record, list).
 * Nothing is drawn when none is set (the shell hides an empty header). An action's `hint` shows as a tooltip on the button. A click on an action fires `pk-action` on the host with { key }; the host never owns the markup.
 */
export function showTitleBar(host, shell, cfg = host.config) {
    const { heading, breadcrumb = [], actions = [] } = cfg ?? {};
    const doc = host.ownerDocument;
    for (const n of shell.$bar ?? []) n.remove();
    const kids = shell.$bar = [];
    shell.setAttribute('heading', heading ?? '');
    shell.setAttribute('data-bare', String(!heading && !breadcrumb.length && !actions.length)); // nothing to draw: the shell drops its empty header
    if (breadcrumb.length) {
        const nav = doc.createElement('pk-breadcrumb');
        nav.slot = 'breadcrumb';
        for (const c of breadcrumb) { const a = doc.createElement('a'); a.textContent = c.label; if (c.href) a.href = c.href; nav.append(a); }
        kids.push(nav);
    }
    for (const a of actions) {
        const btn = doc.createElement('pk-button');
        btn.slot = 'actions';
        btn.textContent = a.label ?? a.key;
        if (a.variant) btn.variant = a.variant;
        if (a.href) btn.href = a.href;
        else btn.addEventListener('click', () => host.dispatchEvent(new CustomEvent('pk-action', { bubbles: true, detail: { key: a.key } })));
        if (a.hint) {
            const tip = doc.createElement('pk-tooltip');
            tip.text = a.hint; tip.slot = 'actions'; btn.removeAttribute('slot');
            tip.append(btn);
            kids.push(tip);
        } else kids.push(btn);
    }
    if (heading) { // the host's own pk-heading (titleHeading, appended by the page factory) fills this slot; used on its own, the fallback draws the same title
        const fwd = doc.createElement('slot');
        fwd.setAttribute('name', 'title'); fwd.slot = 'title';
        fwd.append(titleHeading(doc, heading, { focusable: false }));
        kids.push(fwd);
    }
    shell.append(...kids);
    loadElements(shell);
}

/**
 * Optional tabs: a pk-tabs strip in `box` with one pk-tab-panel per `tabs` entry ([{ id, label }]); `draw(panel, id)` fills a panel and `onShow(id)`
 * runs for the first tab now and for each tab the reader opens. State stays with the caller: a page-wide state (showState) replaces the whole strip,
 * a per-tab or per-widget state lives inside the panel it belongs to, so one tab loading or failing never blanks another.
 */
export function showTabs(box, tabs, draw, onShow, start) {
    const strip = box.ownerDocument.createElement('pk-tabs');
    strip.setAttribute('part', 'tabs');
    for (const t of tabs) {
        const tab = box.ownerDocument.createElement('pk-tab');
        tab.value = t.id;
        tab.textContent = t.label ?? t.id;
        const panel = box.ownerDocument.createElement('pk-tab-panel');
        panel.value = t.id;
        draw(panel, t.id);
        strip.append(tab, panel);
    }
    const first = tabs.some(t => t.id === start) ? start : tabs[0].id;
    strip.value = first;
    strip.addEventListener('pk-tab-change', e => onShow(e.detail.value));
    box.append(strip);
    loadElements(box);
    onShow(first);
}
