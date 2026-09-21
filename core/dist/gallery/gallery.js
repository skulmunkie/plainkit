// The SDK gallery. ONE side nav (a pk-side-nav) whose tree is exactly the content: section > group > item. Every nav
// entry is a view with its own URL hash (#/elements/pk-button), so each view shows one topic and back/forward work. The
// top navbar (site/shell.js) is the only other navigation. Samples render in iframes (frame.js) so the phone switch is real.
// The gallery's own chrome, views and samples are pk-* elements.
// Framework-free; ES module driven by gallery.data.js.

import { readSetting, writeSetting } from './settings.js';
import { TOKENS_CSS, UTILITIES_CSS, SPACING_CSS, ICONS, TEMPLATES_DIR, PREVIEW, HAS_SITE } from './paths.js';
import { normalizeOptions, isScoped, restrictTree, leaves, filterLeaves, filterTree, initialHash } from '../js/gallery-options.js';
import { BREAKPOINTS, TEXT_PAIRS, LAYOUTS, RESPONSIVE_RULES, PATTERNS, TEMPLATES, ELEMENTS } from './gallery.data.js';
import { makeFrame, applyToFrame, applyToPage, PHONE_WIDTH } from './frame.js';
import { parseTokenBlocks, tokenKind, currentTheme, setTheme } from '../js/theme.js';
import { contrast, grade } from '../js/colour.js';
import { applyDynamic } from '../js/dynamic.js';
import { initPlainkit } from '../js/plainkit.js';
import { renderElement } from './elements-view.js';
import { createElementInspector } from '../js/element-inspector.js';

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const $ = (s, r = document) => r.querySelector(s);
const slug = s => s.replace(/\W+/g, '-').replace(/^-|-$/g, '').toLowerCase();
const PAGE_SIZE = 40;

const state = { theme: 'dark', width: 'desktop', scale: 1, filter: '', open: new Set() };
let opts = {};
let bare = false;
let baseTitle = 'Plainkit Gallery'; // the host page's own title, so a mounted gallery adds the section to it instead of replacing it
const frames = new Set();
let css = null;
let lazy = null;

const text = async path => (await fetch(new URL(path, import.meta.url))).text();

// A boolean or string prop set through its attribute, so it also lands on an element that is not upgraded yet (the elements load on demand).
const setAttr = (el, name, on) => { if (typeof on === 'boolean') el.toggleAttribute(name, on); else el.setAttribute(name, on); };

// ---- the content tree: section > group > item ---------------------------------------------------------------------------
const FOUNDATIONS = [
    ['colours', 'Colours', 'Every colour token in the dark and light themes, side by side, with WCAG contrast for the text pairs.'],
    ['typography', 'Typography', 'The font stack, headings, body and the text scale.'],
    ['spacing', 'Spacing', 'The spacing scale and the named roles built on it: label to input, field to field, card to card, section to section.'],
    ['radii-shadows', 'Radii and shadows', 'Corner radii, shadows, layers and touch targets.'],
    ['breakpoints', 'Breakpoints', 'The three responsive steps and what changes at each.'],
    ['utilities', 'Utilities', 'The u-* classes, searchable and paged.'],
    ['icons', 'Icons', 'The sprite: 24px line icons drawn in the surrounding text colour.'],
    ['tokens', 'Every token', 'All custom properties in tokens.css, searchable and paged.'],
];
const LAYOUT_ITEMS = () => [['shell', 'App shell'], ['responsive', 'Responsive rules'], ...LAYOUTS.map(l => [l.id, l.title])];
// [id, title, path under samples/templates, summary, slots]
const TEMPLATE_PAGES = TEMPLATES.map(t => [t.id, t.title, t.file.replace('samples/templates/', ''), t.summary, t.slots]);

const tree = () => restrictTree(allSections(), opts);
// What the overview pages may list: the mount's kind / group / control scope, then its filter. Unscoped and unfiltered, that is everything.
const scope = id => filterTree(tree(), opts.filter).find(s => s.id === id);
const scopeGroup = (sec, grp) => scope(sec)?.groups?.find(g => g.id === grp);
const keeps = (sec, grp, id) => Boolean(scopeGroup(sec, grp)?.items.some(i => i.id === id));

// 77 elements in one flat list is a wall on a phone: the nav folds them by the group their meta declares (the section title still opens the overview).
function elementGroups() {
    const by = new Map();
    for (const m of ELEMENTS) { const g = m.group || 'Other'; if (!by.has(g)) by.set(g, []); by.get(g).push({ id: m.tag, title: m.title, hash: `#/elements/${m.tag}` }); }
    return [...by].map(([title, items]) => ({ id: `el-${slug(title)}`, title, hash: '#/elements', items }));
}

function allSections() {
    return [
        { id: 'foundations', title: 'Foundations', items: FOUNDATIONS.map(([id, t]) => ({ id, title: t, hash: `#/foundations/${id}` })) },
        { id: 'elements', title: 'Elements', groups: elementGroups() },
        { id: 'samples', title: 'Samples', groups: [
            { id: 'templates', title: 'Templates', hash: '#/samples/templates', items: [{ id: 'overview', title: 'Overview', hash: '#/samples/templates' }, ...TEMPLATE_PAGES.map(([id, title]) => ({ id, title, hash: `#/samples/templates/${id}` }))] },
            { id: 'patterns', title: 'Patterns', hash: '#/samples/patterns', items: [{ id: 'overview', title: 'Overview', hash: '#/samples/patterns' }, ...PATTERNS.map(p => ({ id: p.id, title: p.title, hash: `#/samples/patterns/${p.id}` }))] },
            { id: 'layouts', title: 'Layouts', hash: '#/samples/layouts', items: [{ id: 'overview', title: 'Overview', hash: '#/samples/layouts' }, ...LAYOUT_ITEMS().map(([id, t]) => ({ id, title: t, hash: `#/samples/layouts/${id}` }))] },
        ] },
    ];
}

// A bare embed (no nav) with no route of its own lists the matching elements one after another.
const collection = () => bare && !location.hash && (isScoped(opts) || Boolean(opts.filter)) && tree().some(s => s.id === 'elements');

function route() {
    const hash = location.hash || (isScoped(opts) && !collection() ? initialHash(tree()) : '');
    const [raw = '', a0, b0] = hash.replace(/^#\/?/, '').split('?')[0].split('/');
    // Old routes keep working: layouts and templates now live under samples, a control page is its element's page, building blocks are gone.
    if (raw === 'controls') { const tag = `pk-${b0}`; return { section: 'elements', a: ELEMENTS.some(m => m.tag === tag) ? tag : undefined }; }
    if (raw === 'samples' && a0 === 'blocks') return { section: 'samples' };
    if (raw === 'layouts') return { section: 'samples', a: 'layouts', b: a0 };
    if (raw === 'templates') return a0 === 'block' ? { section: 'samples' } : { section: 'samples', a: 'templates', b: a0 };
    return { section: raw || 'overview', a: a0, b: b0 };
}

// ---- nav -----------------------------------------------------------------------------------------------------------------
// A pk-side-nav built once from the tree: a section title (a link to its overview), then its items or its folding groups (pk-nav-item
// branches with a count). The element brings the filter box, the arrow-key tree navigation and, at 1024px and below, the off-canvas drawer.
const navEl = () => $('#gx-nav');
const navInput = () => navEl()?.shadowRoot?.querySelector('[part="filter-input"]') ?? null;

function el(tag, attrs = {}, ...kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) { if (v === false || v == null) continue; n.setAttribute(k, v === true ? '' : v); }
    n.append(...kids);
    return n;
}

function buildNav() {
    const nav = navEl(); if (!nav) return;
    const item = (it, slotName) => el('pk-nav-item', { href: it.hash, slot: slotName }, it.title);
    const home = isScoped(opts) ? initialHash(tree()) || '#/overview' : '#/overview';
    nav.replaceChildren(el('a', { slot: 'brand', href: home }, 'Gallery'), ...tree().flatMap(sec => [
        el('a', { class: 'gx-nav-title', href: `#/${sec.id}` }, sec.title),
        ...(sec.items ? sec.items.map(i => item(i)) : sec.groups.map(g => el('pk-nav-item', { 'data-branch': g.id }, g.title, el('span', { slot: 'badge' }, String(g.items.length)), ...g.items.map(i => item(i, 'children'))))),
    ]));
    syncNav();
}

// The current row and the folds that show it: the branch of the route, or one the reader opened. While a filter is typed the element opens the matches itself.
function syncNav() {
    const nav = navEl(); if (!nav) return;
    const r = route();
    for (const i of nav.querySelectorAll('pk-nav-item[href]')) setAttr(i, 'current', location.hash === i.getAttribute('href') || (Boolean(r.section) && i.getAttribute('href') === `#/${r.section}/${r.a}/${r.b}`));
    if (state.filter) return;
    for (const b of nav.querySelectorAll('pk-nav-item[data-branch]')) setAttr(b, 'expanded', state.open.has(b.dataset.branch) || Boolean(b.querySelector('pk-nav-item[current]')) || (r.section !== 'samples' && r.a === b.dataset.branch));
}

function setFilter(v) {
    state.filter = v;
    const input = navInput(); const nav = navEl();
    if (input && input.value !== v) input.value = v;
    if (typeof nav?.filter === 'function') nav.filter(v);
    if (!v) syncNav();
}

function closeContents() {
    const nav = navEl(); const btn = $('[data-gx-contents]');
    if (nav) setAttr(nav, 'open', false);
    if (btn) setAttr(btn, 'pressed', false);
}

// ---- frames (lazy) -------------------------------------------------------------------------------------------------------
function watchFrames() {
    lazy?.disconnect();
    lazy = new IntersectionObserver(entries => { for (const e of entries) if (e.isIntersecting) { lazy.unobserve(e.target); mountFrame(e.target); } }, { root: bare ? null : $('#gx-view'), rootMargin: '400px' });
}

function mountFrame(slotEl) {
    if (slotEl.dataset.mounted) return;
    slotEl.dataset.mounted = '1';
    const sample = JSON.parse(slotEl.dataset.sample);
    const fixed = slotEl.dataset.fixed;
    const frame = makeFrame(sample, fixed ? { ...state, width: fixed } : state, slotEl.dataset.control);
    if (fixed) frame.dataset.fixed = fixed;
    frames.add(frame);
    slotEl.replaceChildren(frame);
}

function slot(sample, control, fixed) {
    const div = document.createElement('div');
    div.className = 'gx-slot';
    div.dataset.sample = JSON.stringify(sample);
    div.dataset.control = control;
    if (fixed) div.dataset.fixed = fixed;
    div.style.minHeight = `${sample.height ?? 60}px`;
    lazy.observe(div);
    return div;
}

function refreshFrames(changes) {
    for (const f of frames) applyToFrame(f, f.dataset.fixed ? { ...changes, width: undefined } : changes);
    if (stage) applyToPage(stage, changes);
}

// ---- full-page samples -----------------------------------------------------------------------------------------------------
// A template, pattern or layout is a whole page, so it is shown as one: the preview fills the gallery's main area (the page scrolls itself, no
// heading or padding around it) and the toolbar shrinks to one slim bar. Templates are their own standalone pages; patterns and layouts are
// fragments that preview.html hosts as a page. The same URL is what "Open in new page" opens.
const KIND_LABEL = { templates: 'Templates', patterns: 'Patterns', layouts: 'Layouts' };
let full = null; // the full-page sample on show, or null
let stage = null; // its iframe

function fullPage() {
    if (bare) return null;
    const { section, a, b } = route();
    if (section !== 'samples' || !b) return null;
    if (a === 'templates') { const tp = TEMPLATE_PAGES.find(x => x[0] === b); return tp ? { kind: 'templates', id: b, title: tp[1], file: tp[2] } : null; }
    if (a === 'patterns') { const p = PATTERNS.find(x => x.id === b); return p ? { kind: 'patterns', id: b, title: p.title } : null; }
    if (a === 'layouts') { const l = b === 'shell' ? { title: 'App shell' } : LAYOUTS.find(x => x.id === b); return l ? { kind: 'layouts', id: b, title: l.title } : null; }
    return null;
}

const navVariant = () => (new URLSearchParams(location.hash.split('?')[1] ?? '').get('nav') === 'top' ? 'top' : 'side');

function pageUrl(fp, extra = {}) {
    const q = new URLSearchParams();
    let url;
    if (fp.kind === 'templates') { url = new URL(TEMPLATES_DIR + fp.file, import.meta.url); q.set('nav', navVariant()); }
    else { url = new URL(PREVIEW, import.meta.url); q.set('kind', fp.kind); q.set('id', fp.id); }
    q.set('theme', state.theme);
    for (const [k, v] of Object.entries(extra)) q.set(k, v);
    url.search = q.toString();
    return url.href;
}

function fullView(fp) {
    const box = document.createElement('div');
    box.className = 'gx-stagebox';
    const frame = document.createElement('iframe');
    frame.className = 'gx-page-frame';
    frame.title = `${fp.title} as a full page`;
    frame.addEventListener('load', () => applyToPage(frame, state));
    frame.src = pageUrl(fp);
    applyToPage(frame, { width: state.width });
    stage = frame;
    box.append(frame);
    return box;
}

// The slim bar: back to the list, the title, the template nav variant, viewport, text size, theme, open in a new page.
function paintPagebar() {
    const shell = $('#gx-shell');
    if (!shell || !$('#gx-pagebar')) return;
    shell.classList.toggle('gx-full', Boolean(full));
    if (!full) return;
    const label = KIND_LABEL[full.kind];
    $('#gx-title').textContent = full.title;
    const back = $('#gx-back'); back.href = `#/samples/${full.kind}`; back.setAttribute('aria-label', `Back to ${label}`);
    $('#gx-back-label').textContent = label;
    $('#gx-open').href = pageUrl(full, { width: state.width });
    for (const n of document.querySelectorAll('#gx-pagebar [data-nav-scope]')) n.hidden = full.kind !== 'templates';
    for (const a of document.querySelectorAll('#gx-pagebar [data-nav]')) { a.dataset.goto = `#/samples/templates/${full.id}?nav=${a.dataset.nav}`; setAttr(a, a.localName === 'pk-menu-item' ? 'checked' : 'pressed', a.dataset.nav === navVariant()); }
    const th = $('#gx-theme'); th.textContent = state.theme === 'dark' ? 'Dark' : 'Light';
    th.setAttribute('label', `Theme: ${state.theme}. Switch to ${state.theme === 'dark' ? 'light' : 'dark'}`);
}

// ---- small building blocks ------------------------------------------------------------------------------------------------
// A page title with its breadcrumb above and its lead below (a pk-page-header); a titled card; a card that is one link.
const crumbs = (...parts) => `<pk-breadcrumb slot="breadcrumb" label="Breadcrumb">${parts.map(([label, href]) => (href ? `<a href="${href}">${esc(label)}</a>` : `<span aria-current="page">${esc(label)}</span>`)).join('')}</pk-breadcrumb>`;
const heading = (title, lead, crumb = '') => `<pk-page-header class="gx-head" level="1" heading="${esc(title)}">${crumb}${lead ? `<p class="muted" slot="meta">${esc(lead)}</p>` : ''}</pk-page-header>`;
const section = (title, body) => `<pk-card class="gx-entry" heading="${esc(title)}">${body}</pk-card>`;
const cardLink = (href, title, text, extra = '') => `<pk-card class="gx-tile" href="${href}" heading="${esc(title)}"><span class="muted">${esc(text)}</span>${extra}</pk-card>`;
const grid = html => `<pk-grid min="14rem">${html}</pk-grid>`;
const notFound = (title, lead, back) => `<pk-empty-state heading="${esc(title)}"${lead ? ` description="${esc(lead)}"` : ''}>${back ? `<a slot="actions" href="${back[1]}">${esc(back[0])}</a>` : ''}</pk-empty-state>`;
const nothing = () => '<pk-empty-state tone="compact" heading="Nothing in the gallery matches."></pk-empty-state>';
// A data table: the raw table goes inside pk-table (frame, scrolling), each cell labelled so a phone can lay a row out as a card (gallery.css).
const dataTable = (label, cols, rows, numeric = []) => `<pk-table label="${esc(label)}"><table class="gx-table"><thead><tr>${cols.map((c, i) => `<th${numeric.includes(i) ? ' class="num"' : ''}>${c}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map((c, i) => `<td${numeric.includes(i) ? ' class="num"' : ''} data-label="${esc(String(cols[i]).replace(/<[^>]*>/g, ''))}">${c}</td>`).join('')}</tr>`).join('')}</tbody></table></pk-table>`;
const codeBlock = (code, label = '') => `<pk-code-block${label ? ` label="${esc(label)}"` : ''} wrap>${esc(code)}</pk-code-block>`;

function probe(theme) {
    const d = document.createElement('div');
    d.hidden = true; d.setAttribute('data-theme', theme);
    document.body.append(d);
    return d;
}

function paged(items, page, render, hashBase) {
    const pages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
    const p = Math.min(Math.max(1, page), pages);
    const slice = items.slice((p - 1) * PAGE_SIZE, p * PAGE_SIZE);
    const nav = pages > 1 ? `<pk-pagination label="Pages" page="${p}" pages="${pages}" data-base="${esc(hashBase)}"></pk-pagination>` : '';
    return { html: render(slice), nav, p, pages };
}

const query = () => new URLSearchParams(location.hash.split('?')[1] ?? '');

// ---- foundations views ---------------------------------------------------------------------------------------------------
function viewFoundation(id) {
    const tokens = parseTokenBlocks(css.tokens);
    const val = (node, name) => getComputedStyle(node).getPropertyValue(name).trim();
    const scale = prefix => Object.entries(tokens.root).filter(([n]) => n.startsWith(prefix));
    const dark = probe('dark'); const light = probe('light');
    try {
        switch (id) {
            case 'colours': {
                const names = Object.keys(tokens.dark).filter(n => n.startsWith('--color-'));
                const swatch = (theme, node, n) => `<div data-theme="${theme}" class="gx-swatch-cell"><span class="gx-swatch" data-dyn="background:var(${n})"></span><code>${esc(val(node, n))}</code></div>`;
                const pair = ([fg, bg]) => { const c = node => { const r = contrast(val(node, fg), val(node, bg)); return r === null ? 'n/a' : `${r.toFixed(2)}:1 ${grade(r)}`; }; return [`<code>${fg}</code> on <code>${bg}</code>`, c(dark), c(light)]; };
                return heading('Colours', 'Read live from the computed CSS variables inside a dark and a light scope; ratios are WCAG contrast calculated in JS.')
                    + section('Palette', dataTable('Colour tokens', ['Token', 'Dark', 'Light'], names.map(n => [`<code>${n}</code>`, swatch('dark', dark, n), swatch('light', light, n)])))
                    + section('Text pairs', dataTable('Text contrast pairs', ['Pair', 'Dark', 'Light'], TEXT_PAIRS.map(pair), [1, 2]));
            }
            case 'typography':
                return heading('Typography', 'Font stack, headings, body text and the size scale.')
                    + section('Type', `<p class="muted">Font stack <code>--font-sans</code>: <code>${esc(val(dark, '--font-sans'))}</code></p><p class="u-fs-1p1r u-m0">Heading 1 (the page title uses h1)</p><h2>Heading 2</h2><h3>Heading 3</h3><h4>Heading 4</h4><p>Body text. The quick brown fox jumps over the lazy dog.</p><p class="muted">Muted text for secondary notes.</p><p><a href="#/foundations/typography">A link</a> and <code>inline code</code>.</p>`)
                    + section('Text scale', `<pk-cluster gap="md" align="baseline">${scale('--text-').map(([n, v]) => `<span data-dyn="font-size:var(${n})">Aa <span class="muted u-text-xs">${n} ${esc(v)}</span></span>`).join('')}</pk-cluster>`);
            case 'spacing': {
                const roles = Object.entries(tokens.root).filter(([n]) => /^--(gap|pad|flow)-/.test(n));
                return heading('Spacing', 'One scale, and named roles built on it. Components and utilities read the roles, never a literal, so a density mode moves the whole rhythm.')
                    + section('The scale', scale('--space-').map(([n, v]) => `<div class="gx-space-row"><code>${n}</code><span class="muted">${esc(v)}</span><span class="gx-space-bar" data-dyn="width:var(${n})"></span></div>`).join(''))
                    + section('Roles', `${dataTable('Spacing roles', ['Role', 'Value'], roles.map(([n, v]) => [`<code>${n}</code>`, `<code>${esc(v)}</code>`]))}<p class="muted">Compact density overrides these on any element with <code>data-density="compact"</code>. See the <a href="../spacing/index.html">spacing page</a> for the rhythm in use.</p>`);
            }
            case 'radii-shadows':
                return heading('Radii and shadows', 'Corner radii, shadows, layers and touch targets.')
                    + section('Radii', `<pk-cluster gap="md">${scale('--radius-').map(([n, v]) => `<span class="gx-box" data-dyn="border-radius:var(${n})"><code>${n}</code><span class="muted u-text-xs">${esc(v)}</span></span>`).join('')}</pk-cluster>`)
                    + section('Shadows', `<pk-cluster gap="md">${[...scale('--shadow-'), ...Object.entries(tokens.dark).filter(([n]) => /shadow/.test(n) && !n.startsWith('--shadow-'))].slice(0, 8).map(([n]) => `<span class="gx-box" data-dyn="box-shadow:var(${n})"><code>${n}</code></span>`).join('')}</pk-cluster>`)
                    + section('Layers and targets', `<pk-cluster gap="md">${[...scale('--z-'), ...scale('--touch'), ...scale('--app-'), ...scale('--shell-')].map(([n, v]) => `<span class="gx-z"><code>${n}</code> <span class="muted u-text-xs">${esc(v)}</span></span>`).join('')}</pk-cluster>`);
            case 'breakpoints':
                return heading('Breakpoints', 'Media queries cannot read a variable, so the three steps are literals. Use the Phone width switch to see 640px apply in every sample.')
                    + section('Steps', dataTable('Breakpoints', ['Name', 'max-width', 'What changes'], BREAKPOINTS.map(b => [b.name, `<code>${b.px}px</code>`, esc(b.meaning)]), [1]));
            case 'utilities': {
                const all = [...css.utilities.matchAll(/\.(u-[\w-]+)\s*\{([^}]*)\}/g)].map(m => ({ name: m[1], decl: m[2].trim().replace(/\s*!important/g, '') })).concat([...css.spacing.matchAll(/^\.([a-z]+-[\w]+) \{ ([^}]*)\}/gm)].map(m => ({ name: m[1], decl: m[2].trim() })));
                const q = query(); const f = (q.get('q') ?? '').toLowerCase();
                const list = all.filter(u => u.name.includes(f));
                const pg = paged(list, Number(q.get('p')) || 1, rows => dataTable('Utility classes', ['Class', 'Declaration', 'Effect'], rows.map(u => [`<code>${u.name}</code>`, `<code>${esc(u.decl)}</code>`, `<div class="gx-effect"><span class="${u.name}">Sample</span></div>`])), `#/foundations/utilities${f ? `?q=${encodeURIComponent(f)}` : ''}`);
                return heading('Utilities', `${all.length} utility classes (u-*, and spacing p-* m-* gap-* mapped to tokens), ${list.length} shown.`)
                    + section('Find a class', `<form class="gx-find" data-find="#/foundations/utilities"><pk-field label="Filter"><pk-input type="search" name="q" value="${esc(f)}" placeholder="e.g. mt, text, gap"></pk-input></pk-field></form>${pg.html}${pg.nav}`);
            }
            case 'icons': {
                const ids = [...css.icons.matchAll(/<symbol id="([^"]+)"/g)].map(m => m[1]);
                return heading('Icons', 'The sprite sdk/icons.svg. Icon-only controls must carry an aria-label.')
                    + section(`${ids.length} icons`, `<div class="gx-icons">${ids.map(i => `<div class="gx-icon"><pk-icon name="${i}" size="lg"></pk-icon><code>${i}</code></div>`).join('')}</div>`);
            }
            default: {
                const q = query(); const f = (q.get('q') ?? '').toLowerCase(); const kind = q.get('kind') ?? 'all';
                const all = [...new Set([...Object.keys(tokens.dark), ...Object.keys(tokens.light), ...Object.keys(tokens.root)])].sort();
                const list = all.filter(n => n.includes(f) && (kind === 'all' || tokenKind(n, tokens.dark[n] ?? tokens.root[n] ?? '') === kind));
                const params = new URLSearchParams({ ...(f ? { q: f } : {}), ...(kind !== 'all' ? { kind } : {}) }).toString();
                const pg = paged(list, Number(q.get('p')) || 1, rows => dataTable('Design tokens', ['Token', 'Kind', 'Dark / shared', 'Light'], rows.map(n => [`<code>${n}</code>`, tokenKind(n, tokens.dark[n] ?? tokens.root[n] ?? ''), `<code>${esc(tokens.dark[n] ?? tokens.root[n] ?? '')}</code>`, `<code>${esc(tokens.light[n] ?? '')}</code>`])), `#/foundations/tokens${params ? `?${params}` : ''}`);
                return heading('Every token', `${list.length} of ${all.length} custom properties declared in tokens.css. Edit them in the theme editor.`)
                    + section('Find a token', `<form class="gx-find" data-find="#/foundations/tokens"><pk-cluster align="end"><pk-field label="Filter"><pk-input type="search" name="q" value="${esc(f)}" placeholder="e.g. accent, radius"></pk-input></pk-field><pk-field label="Kind"><pk-select name="kind" value="${esc(kind)}">${['all', 'colour', 'font', 'size', 'shadow', 'layer', 'other'].map(k => `<option>${k}</option>`).join('')}</pk-select></pk-field></pk-cluster></form>${pg.html}${pg.nav}`);
            }
        }
    } finally { dark.remove(); light.remove(); }
}

// What the docked inspector shows: { meta, element } for the element page that is open (element is its playground's live element), or null.
let inspecting = null;
let inspector = null; // the element inspector (js/element-inspector.js), created with the chrome

// ---- views ---------------------------------------------------------------------------------------------------------------
function overviewHtml() {
    const narrowed = isScoped(opts) || Boolean(opts.filter);
    const cards = [
        ['#/foundations', 'Foundations', 'Colours, type, spacing, radii, breakpoints, utilities, icons and every token.'],
        ['#/elements', 'Elements', `${ELEMENTS.length} custom elements generated from their API data, each with a live playground.`],
        ['#/samples', 'Samples', `${TEMPLATE_PAGES.length} page templates, ${PATTERNS.length} patterns and ${LAYOUTS.length + 2} layouts, all built only from the SDK.`],
        ...(HAS_SITE && !narrowed ? [
            ['../theme/index.html', 'Theme editor', 'Edit every token live and export the override block.'],
            ['../scorecard/index.html', 'Scorecard', 'Performance, look and accessibility scores, the size sweep and security findings.'],
            ['../files/index.html', 'Files', 'Browse the SDK source in the code explorer.'],
        ] : []),
    ];
    return heading('Plainkit', 'Plain HTML, CSS and JS: no framework, no build step to use it, no runtime dependencies.')
        + grid(cards.filter(([h]) => !h.startsWith('#/') || !narrowed || scope(h.slice(2))).map(([h, t, d]) => cardLink(h, t, d)).join(''))
        + section('Quick start', `${codeBlock('<link rel="stylesheet" href="plainkit/dist/plainkit.min.css">\n<script type="module">import { initPlainkit } from \'./plainkit/dist/js/plainkit.js\'; initPlainkit();</script>', 'HTML')}<p class="muted">Set <code>data-theme</code> to dark or light and <code>data-density="compact"</code> on any element.</p>`);
}

function samplesView(out, put, a, b) {
    const groups = { templates: 'Templates', patterns: 'Patterns', layouts: 'Layouts' };
    if (!a) return put(heading('Samples', 'Everything here is built only from the SDK: templates (page structures), patterns (composed behaviours) and layouts.') + grid(Object.entries(groups).filter(([id]) => scopeGroup('samples', id)).map(([id, t]) => cardLink(`#/samples/${id}`, t, { templates: `${TEMPLATE_PAGES.length} full-page templates with a slot contract.`, patterns: `${PATTERNS.length} realistic composed examples.`, layouts: 'Page anatomies at desktop and phone width.' }[id])).join('')));
    const groupCrumb = (id, name) => crumbs(['Samples', '#/samples'], [groups[id], `#/samples/${id}`], [name]);
    if (a === 'templates') {
        if (!b) return put(heading('Templates', 'Full-page templates, each a runnable example with a slot contract: preview one in the side-nav or top-nav variant, light or dark.', crumbs(['Samples', '#/samples'], ['Templates'])) + grid(TEMPLATE_PAGES.filter(([id]) => keeps('samples', 'templates', id)).map(([id, tt, , d]) => cardLink(`#/samples/templates/${id}`, tt, d)).join('')));
        const tp = TEMPLATE_PAGES.find(x => x[0] === b);
        if (!tp) return put(notFound('Not found', '', ['Back to templates', '#/samples/templates']));
        const q = new URLSearchParams(location.hash.split('?')[1] ?? ''); const nav = q.get('nav') === 'top' ? 'top' : 'side'; const th = q.get('theme') ?? state.theme;
        const link = (k, v, l) => { const p = new URLSearchParams({ nav, theme: th, [k]: v }); return `<pk-button variant="ghost" size="mini" toggle${(k === 'nav' ? nav : th) === v ? ' pressed' : ''} data-goto="#/samples/templates/${b}?${p}">${l}</pk-button>`; };
        put(heading(tp[1], tp[3], groupCrumb('templates', tp[1])) + `<pk-cluster gap="sm"><a href="#/samples/templates">Back to templates</a><pk-button-group label="Navigation variant" mode="single">${link('nav', 'side', 'Side nav')}${link('nav', 'top', 'Top nav')}</pk-button-group><pk-button-group label="Theme" mode="single">${link('theme', 'dark', 'Dark')}${link('theme', 'light', 'Light')}</pk-button-group><a href="${TEMPLATES_DIR}${tp[2]}?nav=${nav}&theme=${th}" target="_blank" rel="noopener">Open full page</a></pk-cluster><p class="muted"><strong>Slots:</strong> ${esc(tp[4])}</p><iframe class="gx-frame gx-stage" title="${esc(tp[1])} template" src="${TEMPLATES_DIR}${tp[2]}?nav=${nav}&theme=${th}" data-dyn="width:${state.width === 'phone' ? PHONE_WIDTH + 'px' : '100%'}"></iframe>`);
        return out;
    }
    if (a === 'patterns') {
        if (!b) return put(heading('Patterns', 'Composed examples: several elements working together to do one job.', crumbs(['Samples', '#/samples'], ['Patterns'])) + grid(PATTERNS.filter(p => keeps('samples', 'patterns', p.id)).map(p => cardLink(`#/samples/patterns/${p.id}`, p.title, p.summary)).join('')));
        const p = PATTERNS.find(x => x.id === b);
        if (!p) return put(notFound('Not found', '', ['Back to patterns', '#/samples/patterns']));
        put(`${heading(p.title, p.summary, groupCrumb('patterns', p.title))}<pk-card class="gx-entry"><p class="muted"><strong>Built from:</strong> ${esc(p.built)}</p><p class="muted"><strong>Mobile:</strong> ${esc(p.mobile)}</p><p class="muted"><strong>Elements used:</strong> ${p.used.map(u => { const m = ELEMENTS.find(x => x.tag === `pk-${u}`); return m ? `<a href="#/elements/${m.tag}">${esc(m.title)}</a>` : esc(u); }).join(', ')}</p><div class="gx-pair"><div><h3>Desktop</h3></div><div><h3>Phone (375px frame)</h3></div></div><p><a href="#/samples/patterns">Back to patterns</a></p></pk-card>`);
        const [d, ph] = out.querySelectorAll('.gx-pair > div');
        d.append(slot({ title: `${p.title} desktop`, html: p.html }, `pattern-${p.id}`, 'desktop')); ph.append(slot({ title: `${p.title} phone`, html: p.html }, `pattern-${p.id}`, 'phone'));
        return out;
    }
    if (a === 'layouts') {
        if (!b) return put(heading('Layouts', 'How the elements compose into pages.', crumbs(['Samples', '#/samples'], ['Layouts'])) + grid(LAYOUT_ITEMS().filter(([id]) => keeps('samples', 'layouts', id)).map(([id, t]) => cardLink(`#/samples/layouts/${id}`, t, '')).join('')));
        if (b === 'responsive') return put(heading('Responsive rules', '', groupCrumb('layouts', 'Responsive rules')) + section('Width steps', `${dataTable('Responsive width steps', ['Width', 'What changes'], RESPONSIVE_RULES.map(r => [r.width, esc(r.change)]))}<p class="muted">Design mobile-first: write the phone layout, then add the multi-column layout above it.</p>`));
        if (b === 'shell') { put(heading('App shell', 'A sidebar, a main column with the top bar, the page body and a footer strip. The header and footer strips share one height token each.', groupCrumb('layouts', 'App shell')) + '<pk-card class="gx-entry"><div class="gx-samples"></div></pk-card>'); $('.gx-samples', out).append(slot({ title: 'App shell', html: ELEMENTS.find(m => m.tag === 'pk-app-shell').examples[0].html }, 'app-shell')); return out; }
        const l = LAYOUTS.find(x => x.id === b);
        if (!l) return put(notFound('Not found', '', ['Back to layouts', '#/samples/layouts']));
        put(`${heading(l.title, l.summary, groupCrumb('layouts', l.title))}<pk-card class="gx-entry"><p class="muted"><strong>Built from:</strong> ${esc(l.built)}</p><p class="muted"><strong>Mobile:</strong> ${esc(l.mobile)}</p><div class="gx-pair"><div><h3>Desktop</h3></div><div><h3>Phone (375px frame)</h3></div></div></pk-card>`);
        const [d, ph] = out.querySelectorAll('.gx-pair > div');
        d.append(slot({ title: `${l.title} desktop`, html: l.html }, `layout-${l.id}`, 'desktop')); ph.append(slot({ title: `${l.title} phone`, html: l.html }, `layout-${l.id}`, 'phone'));
        return out;
    }
    return put(notFound('Not found', '', ['Back to samples', '#/samples']));
}

function view() {
    inspecting = null; stage = null;
    full = fullPage();
    if (full) return fullView(full);
    const { section: sec, a, b } = route();
    const out = document.createElement('pk-stack'); out.className = 'gx-page';
    watchFrames();
    const put = html => { out.innerHTML = html; applyDynamic(out); return out; };
    if (collection()) {
        const shown = filterLeaves(leaves(tree()), opts.filter).filter(l => l.section.id === 'elements');
        if (!shown.length) return put(nothing());
        for (const l of shown) out.append(renderElement(ELEMENTS.find(m => m.tag === l.id)));
        return out;
    }
    // An overview the mount's scope or filter leaves empty says so instead of listing what the embedder cut.
    if (!a && ['foundations', 'elements', 'samples'].includes(sec) && !scope(sec)) return put(nothing());
    if (sec === 'foundations') {
        if (!a) return put(heading('Foundations', 'The tokens every control reads.') + grid(FOUNDATIONS.filter(([id]) => scope('foundations')?.items.some(i => i.id === id)).map(([id, t, d]) => cardLink(`#/foundations/${id}`, t, d)).join('')));
        return put(viewFoundation(a));
    }
    if (sec === 'overview') return put(overviewHtml());
    if (sec === 'elements') {
        const meta = ELEMENTS.find(m => m.tag === a);
        if (meta) { out.append(renderElement(meta, { onLive: element => { inspecting = { meta, element }; }, onChange: () => inspector?.refresh() })); return out; }
        return put(heading('Elements', 'Custom elements with Shadow DOM: declared props, slots, events and parts. Each page below is generated from the element\'s API data, with a live playground.') + scope('elements').groups.map(g => `<section class="gx-el-group"><h2>${esc(g.title)} <span class="muted">${g.items.length}</span></h2>${grid(g.items.map(i => { const m = ELEMENTS.find(x => x.tag === i.id); return cardLink(i.hash, `<${m.tag}>`, m.summary.split('. ')[0].replace(/\.$/, '') + '.'); }).join(''))}</section>`).join(''));
    }
    if (sec === 'samples') return samplesView(out, put, a, b);
    return put(notFound('Not found'));
}

// ---- assembly ------------------------------------------------------------------------------------------------------------
function render() {
    const body = $('#gx-view');
    body.replaceChildren(view());
    body.scrollTop = 0;
    syncNav();
    renderInspector();
    paintToolbar();
    if (!bare) {
        document.title = `${full ? `${full.title} - ${KIND_LABEL[full.kind]}` : route().section} - ${baseTitle}`;
        closeContents();
    }
}

const phone = () => matchMedia('(max-width: 640px)').matches;

function renderInspector() {
    const box = $('#gx-inspector'); const toggle = $('#gx-inspect');
    if (!box) return;
    // A full-page sample owns the whole area; every other view has the Details drawer: an element page fills it, the rest show its empty state.
    toggle.hidden = Boolean(full);
    if (full) { setAttr(box, 'open', false); $('#gx-resize').hidden = true; $('#gx-view').classList.remove('gx-view--inspecting'); return; }
    box.setAttribute('heading', inspecting ? `${inspecting.meta.title}: details` : 'Inspector');
    inspector ??= createElementInspector($('#gx-inspector-body'));
    inspector.show(inspecting && { meta: inspecting.meta, element: inspecting.element });
    const stored = readSetting('pk-gallery-inspector');
    const open = stored === null ? Boolean(inspecting) && !phone() : stored === '1';
    setInspector(open, false);
}

function setInspector(open, remember = true) {
    setAttr($('#gx-inspector'), 'open', open);
    setAttr($('#gx-inspect'), 'pressed', open);
    $('#gx-resize').hidden = !open;
    $('#gx-view').classList.toggle('gx-view--inspecting', open);
    if (remember) writeSetting('pk-gallery-inspector', open ? '1' : '0');
}

function initResize() {
    const handle = $('#gx-resize'); const shell = $('#gx-shell'); const body = $('.gx-body');
    const apply = px => { const w = Math.min(Math.max(px, 320), Math.round(innerWidth * 0.7)); shell.style.setProperty('--inspector-w', w + 'px'); return w; };
    const saved = Number(readSetting('pk-gallery-inspector-w')); if (saved) apply(saved);
    handle.addEventListener('pointerdown', e => {
        e.preventDefault(); handle.setPointerCapture(e.pointerId);
        const move = ev => apply(body.getBoundingClientRect().right - ev.clientX);
        const up = () => { handle.removeEventListener('pointermove', move); handle.removeEventListener('pointerup', up); writeSetting('pk-gallery-inspector-w', String(parseInt(getComputedStyle(shell).getPropertyValue('--inspector-w'), 10) || 0)); };
        handle.addEventListener('pointermove', move); handle.addEventListener('pointerup', up);
    });
    handle.addEventListener('keydown', e => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        const cur = body.getBoundingClientRect().right - handle.getBoundingClientRect().right; const w = apply(cur + (e.key === 'ArrowLeft' ? 24 : -24)); writeSetting('pk-gallery-inspector-w', String(w));
    });
}

function paintToolbar() {
    document.querySelectorAll('[data-set-theme]').forEach(b => setAttr(b, 'pressed', b.dataset.setTheme === state.theme));
    document.querySelectorAll('[data-set-width]').forEach(b => setAttr(b, 'pressed', b.dataset.setWidth === state.width));
    document.querySelectorAll('pk-select.gx-scale').forEach(s => setAttr(s, 'value', String(state.scale)));
    document.querySelectorAll('pk-menu-item[data-scale]').forEach(m => setAttr(m, 'checked', Number(m.dataset.scale) === state.scale));
    paintPagebar();
}

function setScale(v) { state.scale = v; writeSetting('pk-gallery-scale', String(v)); refreshFrames({ scale: v }); paintToolbar(); }

// The viewport switch and the text size are shared by the wide bar and the slim bar; a phone gets the text size in a Display menu.
const SCALES = [['0.9', '90%'], ['1', '100%'], ['1.15', '115%'], ['1.3', '130%']];
const viewportSwitch = () => '<pk-button-group label="Viewport" mode="single"><pk-button variant="ghost" toggle data-set-width="desktop" pressed>Desktop</pk-button><pk-button variant="ghost" toggle data-set-width="phone">Phone 375</pk-button></pk-button-group>';
const scaleSelect = () => `<pk-field label="Text size" layout="inline" size="sm"><pk-select class="gx-scale" value="1">${SCALES.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</pk-select></pk-field>`;
const scaleItems = () => `<pk-menu-item type="header">Text size</pk-menu-item>${SCALES.map(([v, l]) => `<pk-menu-item type="radio" data-scale="${v}">${l}</pk-menu-item>`).join('')}`;

const CHROME_HTML = `
    <div class="gx-shell" id="gx-shell">
        <pk-side-nav id="gx-nav" class="gx-nav" label="Gallery contents" filterable></pk-side-nav>
        <main class="gx-main">
            <div class="gx-bar gx-bar-main" role="toolbar" aria-label="Preview settings">
                <pk-button variant="ghost" toggle class="gx-contents" data-gx-contents>Contents</pk-button>
                <div class="gx-group gx-desktop-only"><span class="gx-group-label">Viewport</span>${viewportSwitch()}</div>
                <div class="gx-group gx-desktop-only">${scaleSelect()}</div>
                <pk-dropdown placement="bottom-end" class="gx-phone-only gx-end"><pk-button slot="trigger" variant="ghost">Display</pk-button>${scaleItems()}</pk-dropdown>
                <pk-button variant="ghost" toggle class="gx-inspect" id="gx-inspect" aria-controls="gx-inspector" hidden>Details</pk-button>
            </div>
            <div class="gx-bar gx-pagebar" id="gx-pagebar" role="toolbar" aria-label="Page preview">
                <a class="gx-linkbtn gx-back" id="gx-back" href="#/samples"><pk-icon name="chevron-left"></pk-icon><span class="gx-wide-only" id="gx-back-label">Back</span></a>
                <strong class="gx-title" id="gx-title"></strong>
                <div class="gx-group gx-wide-only" data-nav-scope hidden><pk-button-group label="Navigation variant" mode="single"><pk-button variant="ghost" toggle data-nav="side">Side</pk-button><pk-button variant="ghost" toggle data-nav="top">Top</pk-button></pk-button-group></div>
                <div class="gx-group gx-desktop-only">${viewportSwitch()}</div>
                <div class="gx-group gx-wide-only">${scaleSelect()}</div>
                <pk-dropdown placement="bottom-end" class="gx-compact-only"><pk-button slot="trigger" variant="ghost" icon label="Display options"><pk-icon name="settings"></pk-icon></pk-button><pk-menu-item type="header" data-nav-scope hidden>Navigation</pk-menu-item><pk-menu-item type="radio" data-nav="side" data-nav-scope hidden>Side</pk-menu-item><pk-menu-item type="radio" data-nav="top" data-nav-scope hidden>Top</pk-menu-item>${scaleItems()}</pk-dropdown>
                <pk-button variant="ghost" class="gx-theme" id="gx-theme" data-toggle-theme></pk-button>
                <a class="gx-linkbtn gx-open" id="gx-open" href="#" target="_blank" rel="noopener"><span class="gx-wide-only">Open in new page</span><span class="gx-compact-only">Open</span></a>
            </div>
            <div class="gx-body">
                <div class="gx-view" id="gx-view"></div>
                <div class="gx-resize" id="gx-resize" role="separator" aria-orientation="vertical" aria-label="Resize the inspector" tabindex="0" hidden></div>
                <pk-drawer docked id="gx-inspector" heading="Inspector" aria-label="Inspector"><div id="gx-inspector-body"></div></pk-drawer>
            </div>
        </main>
    </div>`;

const BARE_HTML = '<div class="gx-flow" id="gx-shell"><div class="gx-view" id="gx-view"></div></div>';

// Show the gallery in `container` (its document must load the SDK stylesheets and gallery.css). Options: kind, group, control, theme,
// width, filter, chrome ('full' keeps the nav, toolbar and inspector; 'none' shows only the content). Resolves once the first view is drawn.
export async function mountGallery(container, options = {}) {
    opts = normalizeOptions(options);
    baseTitle = document.title || baseTitle;
    bare = opts.chrome === 'none';
    state.theme = opts.theme ?? currentTheme(document.documentElement);
    state.width = opts.width ?? (readSetting('pk-gallery-width') === 'phone' ? 'phone' : 'desktop');
    state.scale = bare ? 1 : Number(readSetting('pk-gallery-scale')) || 1;
    state.filter = opts.filter ?? '';
    state.open = new Set(bare ? [] : JSON.parse(readSetting('pk-gallery-open') ?? '[]'));
    if (opts.theme) setTheme(document.documentElement, opts.theme);
    document.documentElement.dataset.width = state.width;
    container.innerHTML = bare ? BARE_HTML : CHROME_HTML;
    if (!bare) container.classList.add('gx-mount');
    css = { tokens: await text(TOKENS_CSS), utilities: await text(UTILITIES_CSS), spacing: await text(SPACING_CSS), icons: await text(ICONS) };
    if (!bare) buildNav();
    paintToolbar();
    render();
    // The chrome and the pages are elements, loaded on demand; a host that only mounts the gallery has not called initPlainkit, so the gallery does (idempotent per root).
    // (A host that has already called it, like the SDK site's own shell, passes init: false: the behaviours must be wired once, or every click toggles twice.)
    if (options.init !== false) initPlainkit(document);

    if (!bare) {
        initResize();
        // The nav's filter box lives in the element: a filter given by the mount waits for the element to exist.
        customElements.whenDefined('pk-side-nav').then(() => { if (state.filter) setFilter(state.filter); });
        navEl().addEventListener('input', e => { const t = e.composedPath()[0]; if (t?.matches?.('[part="filter-input"]')) { state.filter = t.value; if (!t.value) syncNav(); } });
        // A branch the reader opens or folds is remembered (the element also opens matches while a filter is typed: that does not emit).
        navEl().addEventListener('pk-toggle', e => { const b = e.target.closest?.('pk-nav-item[data-branch]'); if (!b) return; if (b.hasAttribute('expanded')) state.open.add(b.dataset.branch); else state.open.delete(b.dataset.branch); writeSetting('pk-gallery-open', JSON.stringify([...state.open])); });
        // Escape or a tap on the backdrop closes the phone Contents drawer; the element hands focus back to its button.
        navEl().addEventListener('pk-close', () => { const btn = $('[data-gx-contents]'); if (btn) setAttr(btn, 'pressed', false); });
        $('#gx-inspector').addEventListener('pk-close', () => setInspector(false));
    }
    window.addEventListener('hashchange', render);
    $('#gx-shell').addEventListener('click', e => {
        const contents = e.target.closest('[data-gx-contents]');
        if (contents) { const on = !navEl().hasAttribute('open'); setAttr(navEl(), 'open', on); setAttr(contents, 'pressed', on); }
        if (e.target.closest('#gx-inspect')) setInspector(!$('#gx-inspector').hasAttribute('open'));
        const t = e.target.closest('[data-set-theme]');
        const tt = e.target.closest('[data-toggle-theme]');
        const next = t ? t.dataset.setTheme : tt ? (state.theme === 'dark' ? 'light' : 'dark') : null;
        if (next) { setTheme(document.documentElement, next); writeSetting('pk-site-theme', next); state.theme = next; refreshFrames({ theme: state.theme }); paintToolbar(); }
        const w = e.target.closest('[data-set-width]');
        if (w) { state.width = w.dataset.setWidth; document.documentElement.dataset.width = state.width; writeSetting('pk-gallery-width', state.width); refreshFrames({ width: state.width }); paintToolbar(); }
        const go = e.target.closest('[data-goto]');
        if (go) location.hash = go.dataset.goto;
        const sc = e.target.closest('pk-menu-item[data-scale]');
        if (sc) setScale(Number(sc.dataset.scale));
    });
    $('#gx-shell').addEventListener('change', e => { const s = e.target.closest?.('pk-select.gx-scale'); if (s) setScale(Number(s.value)); });
    document.addEventListener('site-search', e => setFilter(e.detail));
    document.addEventListener('site-theme', e => { state.theme = e.detail; refreshFrames({ theme: state.theme }); paintToolbar(); });
    const view = $('#gx-view');
    view.addEventListener('submit', e => { e.preventDefault(); });
    view.addEventListener('pk-page', e => { const base = e.target.dataset?.base; if (base) location.hash = `${base}${base.includes('?') ? '&' : '?'}p=${e.detail.page}`; });
    view.addEventListener('input', e => {
        const form = e.target.closest('.gx-find'); if (!form) return;
        clearTimeout(form._t);
        form._t = setTimeout(() => { const p = new URLSearchParams([...new FormData(form)].filter(([, v]) => v && v !== 'all')); location.hash = `${form.dataset.find}${p.toString() ? '?' + p : ''}`; setTimeout(() => { const n = $('.gx-find pk-input[type=search]', view); n?.focus(); const c = n?.shadowRoot?.querySelector('[part="control"]'); c?.setSelectionRange(c.value.length, c.value.length); }, 30); }, 250);
    });
    view.addEventListener('change', e => { const form = e.target.closest('.gx-find'); if (form) form.dispatchEvent(new Event('input', { bubbles: true })); });
}
