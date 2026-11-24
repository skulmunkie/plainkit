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
import { actionItems, renderActions } from './page-actions.js';

/** renderState(box, state, opts) then loadElements(box). `opts.error` (a caught value) becomes the description when none is given. */
export function showState(box, state, opts = {}) {
    const { error, ...rest } = opts;
    if (error !== undefined && rest.description === undefined) rest.description = error?.message ?? String(error);
    renderState(box, state, rest);
    if (state !== 'ready') loadElements(box);
}

/** showState into the element's drawn box (`$s`, made in connected); a factory-supplied title (a child in slot "title") is the page's one heading, so none is drawn (except while loading). */
export const drawState = (el, state, opts) => showState(el.$s, state, { ...opts, heading: [...(el.children ?? [])].some(c => c.getAttribute?.('slot') === 'title') && state !== 'loading' ? null : opts.heading });

/** The title bar keys of a page factory's config that the page element forwards to its shell (showTitleBar). */
export const titleBarKeys = c => Object.fromEntries(['badges', 'newAction', 'actionsCollapse', 'actionsOverflow', 'overflowLabel', 'homeHref', 'homeLabel', 'homeIcon', 'variant', 'wrapTitle'].filter(k => c[k] !== undefined).map(k => [k, c[k]]));

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
 * The title bar, filled into the page's pk-page-shell `shell` (a child of the page's shadow tree) from `host.config` { heading?, breadcrumb?: [{ label, href? }], actions?: [{ key, label, icon?, href?, variant?, disabled?, busy?, hint? }], newAction? (one item, drawn first as the primary), actionsCollapse? ('always' | 'phone' | 'tablet' | 'none', one value for the bar), badges?: [{ label, variant?, id?, popover?: true | { heading? } (with an id: a pk-badge-popover; its body is the host child slot="badge-<id>") }], actionsOverflow?, overflowLabel?, homeHref?, homeLabel?, homeIcon?, variant? ('page' | 'section' | 'record': the compact single row), wrapTitle? }:
 * the shell draws the pk-page-header; the breadcrumb, actions and title are its slotted children. `cfg` overrides `host.config` for a page whose own config already uses `heading` or `actions` for something else (record, list).
 * Nothing is drawn when none is set (the shell hides an empty header). An action's `hint` shows as a tooltip on the button; the items are drawn by js/page-actions.js. A click on an action fires `pk-action` on the host with { key }; the host never owns the markup.
 */
export function showTitleBar(host, shell, cfg = host.config) {
    const { heading, breadcrumb = [], actions = [], badges = [] } = cfg ?? {};
    const doc = host.ownerDocument, mine = [...(host.children ?? [])].some(c => c.slot === 'title'), titled = heading || (cfg === host.config && mine); // a heading in config, or (for the host's own config) the app's title in its title slot
    for (const n of shell.$bar ?? []) n.remove();
    const kids = shell.$bar = [];
    shell.setAttribute('heading', heading ?? '');
    for (const k of ['homeHref', 'homeLabel', 'homeIcon', 'actionsOverflow', 'overflowLabel']) { // as on pk-page-header
        const a = k.replace(/[A-Z]/g, c => '-' + c.toLowerCase());
        if (cfg?.[k]) shell.setAttribute(a, cfg[k]); else shell.removeAttribute?.(a);
    }
    for (const [k, a] of [['variant', 'variant'], ['wrapTitle', 'wrap-title']]) { // the header's look (config.variant: 'record' is the compact single row), forwarded to pk-page-shell as on a record page
        if (cfg?.[k]) shell.setAttribute(a, cfg[k] === true ? '' : cfg[k]); else shell.removeAttribute?.(a);
    }
    shell.setAttribute('data-bare', String(!titled && !breadcrumb.length && !actions.length && !cfg?.newAction && !badges.length)); // nothing to draw: the shell drops its empty header
    for (const b of badges) {
        const pop = b.popover && b.id != null; // a popover: a pk-badge-popover whose panel is the host child slot="badge-<id>" (forwarded through a slot of this tree)
        const chip = doc.createElement(pop ? 'pk-badge-popover' : 'pk-badge');
        chip.slot = 'badges'; chip.textContent = b.label;
        if (b.variant) chip.variant = b.variant;
        if (pop) {
            if (b.popover.heading) chip.setAttribute('heading', b.popover.heading);
            const body = doc.createElement('slot');
            body.name = 'badge-' + b.id; body.slot = 'details';
            chip.append(body);
        }
        kids.push(chip);
    }
    // The header draws a home crumb only for its own crumbs list, so a homeHref sends the trail there (as crumbs) instead of a slotted pk-breadcrumb.
    if (cfg?.homeHref) shell.setAttribute('crumbs', JSON.stringify(breadcrumb)); else shell.removeAttribute?.('crumbs');
    if (breadcrumb.length && !cfg?.homeHref) {
        const nav = doc.createElement('pk-breadcrumb');
        nav.slot = 'breadcrumb';
        for (const c of breadcrumb) { const a = doc.createElement('a'); a.textContent = c.label; if (c.href) a.href = c.href; nav.append(a); }
        kids.push(nav);
    }
    kids.push(...renderActions(host, actionItems(actions, cfg?.newAction, (k, m) => host.warnOnce?.(k, m)), { collapse: cfg?.actionsCollapse, warn: (k, m) => host.warnOnce?.(k, m) }));
    if (titled) { // the host's own pk-heading (titleHeading, appended by the page factory) fills this slot; used on its own, the fallback draws the same title
        const fwd = doc.createElement('slot');
        fwd.setAttribute('name', 'title'); fwd.slot = 'title';
        if (heading && !mine) fwd.append(titleHeading(doc, heading, { focusable: false }));
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
