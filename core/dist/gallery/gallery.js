// The SDK gallery. ONE side nav (the SDK's own .snav) whose tree is exactly the content: section > group > item. Every nav
// entry is a view with its own URL hash (#/controls/actions/button), so each view shows one topic and back/forward work. The
// top navbar (site/shell.js) is the only other navigation. Samples render in iframes (frame.js) so the phone switch is real.
// Framework-free; ES module driven by gallery.data.js.

import { readSetting, writeSetting } from './settings.js';
import { TOKENS_CSS, UTILITIES_CSS, SPACING_CSS, ICONS, TEMPLATES_DIR, HAS_SITE } from './paths.js';
import { normalizeOptions, isScoped, restrictTree, leaves, filterLeaves, filterTree, initialHash } from '../js/gallery-options.js';
import { CONTROLS, KINDS, BREAKPOINTS, TEXT_PAIRS, LAYOUTS, RESPONSIVE_RULES, PATTERNS, TEMPLATES, ELEMENTS, PARAMS } from './gallery.data.js';
import { makeFrame, applyToFrame, PHONE_WIDTH } from './frame.js';
import { parseTokenBlocks, tokenKind, currentTheme, setTheme } from '../js/theme.js';
import { contrast, grade } from '../js/colour.js';
import { applyDynamic } from '../js/dynamic.js';
import { initPlainkit } from '../js/plainkit.js';
import { renderElement } from './elements-view.js';

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
const controlKinds = () => KINDS.filter(k => k !== 'Page templates');
const templates = () => CONTROLS.filter(c => c.kind === 'Page templates');
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
    // A group that shares its name with a controls group ("Layout & structure") is labelled as the elements one, so the two nav branches read differently.
    const taken = new Set(controlKinds());
    return [...by].map(([title, items]) => ({ id: `el-${slug(title)}`, title: taken.has(title) ? `${title} (elements)` : title, hash: '#/elements', items }));
}

function allSections() {
    return [
        { id: 'foundations', title: 'Foundations', items: FOUNDATIONS.map(([id, t]) => ({ id, title: t, hash: `#/foundations/${id}` })) },
        { id: 'controls', title: 'Controls', groups: controlKinds().map(k => ({ id: slug(k), title: k, hash: `#/controls/${slug(k)}`, items: CONTROLS.filter(c => c.kind === k).map(c => ({ id: c.id, title: c.name, hash: `#/controls/${slug(k)}/${c.id}` })) })) },
        { id: 'elements', title: 'Elements', groups: elementGroups() },
        { id: 'samples', title: 'Samples', groups: [
            { id: 'templates', title: 'Templates', hash: '#/samples/templates', items: [{ id: 'overview', title: 'Overview', hash: '#/samples/templates' }, ...TEMPLATE_PAGES.map(([id, title]) => ({ id, title, hash: `#/samples/templates/${id}` }))] },
            { id: 'patterns', title: 'Patterns', hash: '#/samples/patterns', items: [{ id: 'overview', title: 'Overview', hash: '#/samples/patterns' }, ...PATTERNS.map(p => ({ id: p.id, title: p.title, hash: `#/samples/patterns/${p.id}` }))] },
            { id: 'layouts', title: 'Layouts', hash: '#/samples/layouts', items: [{ id: 'overview', title: 'Overview', hash: '#/samples/layouts' }, ...LAYOUT_ITEMS().map(([id, t]) => ({ id, title: t, hash: `#/samples/layouts/${id}` }))] },
            { id: 'blocks', title: 'Building blocks', hash: '#/samples/blocks', items: [{ id: 'overview', title: 'Overview', hash: '#/samples/blocks' }, ...templates().map(c => ({ id: c.id, title: c.name, hash: `#/samples/blocks/${c.id}` }))] },
        ] },
    ];
}

// A bare embed (no nav) with no route of its own lists the matching controls one after another.
const collection = () => bare && !location.hash && (isScoped(opts) || Boolean(opts.filter)) && tree().some(s => s.id === 'controls');

function route() {
    const hash = location.hash || (isScoped(opts) && !collection() ? initialHash(tree()) : '');
    const [raw = '', a0, b0] = hash.replace(/^#\/?/, '').split('?')[0].split('/');
    // Old routes keep working: layouts and templates now live under samples.
    if (raw === 'layouts') return { section: 'samples', a: 'layouts', b: a0 };
    if (raw === 'templates') return { section: 'samples', a: a0 === 'block' ? 'blocks' : 'templates', b: a0 === 'block' ? b0 : a0 };
    return { section: raw || 'overview', a: a0, b: b0 };
}

// ---- nav -----------------------------------------------------------------------------------------------------------------
function renderNav() {
    const nav = $('#gx-nav'); if (!nav) return;
    const r = route(); const f = state.filter.toLowerCase();
    const link = (it, extra = '') => `<li><a class="snav-link${extra}" href="${it.hash}"${location.hash === it.hash || (r.section && it.hash === `#/${r.section}/${r.a}/${r.b}`) ? ' aria-current="page"' : ''}><span class="snav-label">${esc(it.title)}</span></a></li>`;
    nav.innerHTML = `
        <a class="snav-brand" href="${isScoped(opts) ? initialHash(tree()) || '#/overview' : '#/overview'}"><span class="snav-brand-text">Gallery</span></a>
        <div class="snav-filter"><input type="search" id="gx-search" aria-label="Filter the contents" placeholder="Filter the contents" value="${esc(state.filter)}"></div>
        <nav class="snav-scroll" aria-label="Gallery contents">${tree().map(sec => {
            const overview = `#/${sec.id}`;
            const head = `<a class="snav-group-title" href="${overview}">${esc(sec.title)}</a>`;
            if (sec.items) return `<ul class="snav-group">${head}${sec.items.filter(i => !f || i.title.toLowerCase().includes(f)).map(i => link(i)).join('')}</ul>`;
            return `<ul class="snav-group">${head}${sec.groups.map(g => {
                const items = g.items.filter(i => !f || i.title.toLowerCase().includes(f) || g.title.toLowerCase().includes(f));
                if (!items.length) return '';
                const open = f || state.open.has(g.id) || (r.section === sec.id && r.a === g.id) || g.items.some(i => i.hash === location.hash);
                return `<li class="snav-branch"><button type="button" class="snav-link snav-toggle" aria-expanded="${!!open}" data-branch="${g.id}"><span class="snav-label">${esc(g.title)}</span><span class="snav-badge">${g.items.length}</span></button><ul class="snav-sub"${open ? '' : ' hidden'}>${items.map(i => link(i)).join('')}</ul></li>`;
            }).join('')}</ul>`;
        }).join('')}</nav>`;
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

function refreshFrames(changes) { for (const f of frames) applyToFrame(f, f.dataset.fixed ? { ...changes, width: undefined } : changes); }

// ---- small building blocks ------------------------------------------------------------------------------------------------
const heading = (title, lead) => `<header class="gx-head"><h1>${esc(title)}</h1>${lead ? `<p class="muted">${esc(lead)}</p>` : ''}</header>`;
const section = (title, body) => `<section class="card gx-entry"><div class="card-header section-header"><h2 class="section-header-title">${esc(title)}</h2></div>${body}</section>`;
const cardLink = (href, title, text, extra = '') => `<a class="card gx-tile" href="${href}"><strong>${esc(title)}</strong><span class="muted">${esc(text)}</span>${extra}</a>`;

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
    const nav = pages > 1 ? `<ul class="pagination" aria-label="Pages">${Array.from({ length: pages }, (_, i) => `<li><a class="page-link" href="${hashBase}?p=${i + 1}"${i + 1 === p ? ' aria-current="page"' : ''}>${i + 1}</a></li>`).join('')}</ul>` : '';
    return { html: render(slice), nav, p, pages };
}

const query = () => new URLSearchParams(location.hash.split('?')[1] ?? '');

// ---- foundations views ---------------------------------------------------------------------------------------------------
function viewFoundation(id) {
    const tokens = parseTokenBlocks(css.tokens);
    const val = (el, name) => getComputedStyle(el).getPropertyValue(name).trim();
    const scale = prefix => Object.entries(tokens.root).filter(([n]) => n.startsWith(prefix));
    const dark = probe('dark'); const light = probe('light');
    try {
        switch (id) {
            case 'colours': {
                const names = Object.keys(tokens.dark).filter(n => n.startsWith('--color-'));
                const swatch = (theme, el, n) => `<div data-theme="${theme}" class="gx-swatch-cell"><span class="gx-swatch" data-dyn="background:var(${n})"></span><code>${esc(val(el, n))}</code></div>`;
                const pair = ([fg, bg]) => { const c = el => { const r = contrast(val(el, fg), val(el, bg)); return r === null ? 'n/a' : `${r.toFixed(2)}:1 ${grade(r)}`; }; return `<tr><td><code>${fg}</code> on <code>${bg}</code></td><td class="num">${c(dark)}</td><td class="num">${c(light)}</td></tr>`; };
                return heading('Colours', 'Read live from the computed CSS variables inside a dark and a light scope; ratios are WCAG contrast calculated in JS.')
                    + section('Palette', `<table class="data gx-table"><thead><tr><th>Token</th><th>Dark</th><th>Light</th></tr></thead><tbody>${names.map(n => `<tr><td><code>${n}</code></td><td>${swatch('dark', dark, n)}</td><td>${swatch('light', light, n)}</td></tr>`).join('')}</tbody></table>`)
                    + section('Text pairs', `<table class="data gx-table"><thead><tr><th>Pair</th><th class="num">Dark</th><th class="num">Light</th></tr></thead><tbody>${TEXT_PAIRS.map(pair).join('')}</tbody></table>`);
            }
            case 'typography':
                return heading('Typography', 'Font stack, headings, body text and the size scale.')
                    + section('Type', `<p class="muted">Font stack <code>--font-sans</code>: <code>${esc(val(dark, '--font-sans'))}</code></p><p class="u-fs-1p1r u-m0">Heading 1 (the page title uses h1)</p><h2>Heading 2</h2><h3>Heading 3</h3><h4>Heading 4</h4><p>Body text. The quick brown fox jumps over the lazy dog.</p><p class="muted">Muted text for secondary notes.</p><p><a href="#/foundations/typography">A link</a> and <code>inline code</code>.</p>`)
                    + section('Text scale', `<div class="gx-demo cluster cluster--horizontal cluster--gap-md cluster--align-baseline cluster--justify-start">${scale('--text-').map(([n, v]) => `<span data-dyn="font-size:var(${n})">Aa <span class="muted u-text-xs">${n} ${esc(v)}</span></span>`).join('')}</div>`);
            case 'spacing': {
                const roles = Object.entries(tokens.root).filter(([n]) => /^--(gap|pad|flow)-/.test(n));
                return heading('Spacing', 'One scale, and named roles built on it. Components and utilities read the roles, never a literal, so a density mode moves the whole rhythm.')
                    + section('The scale', scale('--space-').map(([n, v]) => `<div class="gx-space-row"><code>${n}</code><span class="muted">${esc(v)}</span><span class="gx-space-bar" data-dyn="width:var(${n})"></span></div>`).join(''))
                    + section('Roles', `<table class="data gx-table"><thead><tr><th>Role</th><th>Value</th></tr></thead><tbody>${roles.map(([n, v]) => `<tr><td><code>${n}</code></td><td><code>${esc(v)}</code></td></tr>`).join('')}</tbody></table><p class="muted">Compact density overrides these on any element with <code>data-density="compact"</code>. See the <a href="../spacing/index.html">spacing page</a> for the rhythm in use.</p>`);
            }
            case 'radii-shadows':
                return heading('Radii and shadows', 'Corner radii, shadows, layers and touch targets.')
                    + section('Radii', `<div class="cluster cluster--horizontal cluster--gap-md cluster--align-center cluster--justify-start">${scale('--radius-').map(([n, v]) => `<span class="gx-box" data-dyn="border-radius:var(${n})"><code>${n}</code><span class="muted u-text-xs">${esc(v)}</span></span>`).join('')}</div>`)
                    + section('Shadows', `<div class="cluster cluster--horizontal cluster--gap-md cluster--align-center cluster--justify-start">${[...scale('--shadow-'), ...Object.entries(tokens.dark).filter(([n]) => /shadow/.test(n) && !n.startsWith('--shadow-'))].slice(0, 8).map(([n]) => `<span class="gx-box" data-dyn="box-shadow:var(${n})"><code>${n}</code></span>`).join('')}</div>`)
                    + section('Layers and targets', `<div class="cluster cluster--horizontal cluster--gap-md cluster--align-center cluster--justify-start">${[...scale('--z-'), ...scale('--touch'), ...scale('--app-'), ...scale('--shell-')].map(([n, v]) => `<span class="gx-z"><code>${n}</code> <span class="muted u-text-xs">${esc(v)}</span></span>`).join('')}</div>`);
            case 'breakpoints':
                return heading('Breakpoints', 'Media queries cannot read a variable, so the three steps are literals. Use the Phone width switch to see 640px apply in every sample.')
                    + section('Steps', `<table class="data gx-table"><thead><tr><th>Name</th><th class="num">max-width</th><th>What changes</th></tr></thead><tbody>${BREAKPOINTS.map(b => `<tr><td>${b.name}</td><td class="num"><code>${b.px}px</code></td><td>${esc(b.meaning)}</td></tr>`).join('')}</tbody></table>`);
            case 'utilities': {
                const all = [...css.utilities.matchAll(/\.(u-[\w-]+)\s*\{([^}]*)\}/g)].map(m => ({ name: m[1], decl: m[2].trim().replace(/\s*!important/g, '') })).concat([...css.spacing.matchAll(/^\.([a-z]+-[\w]+) \{ ([^}]*)\}/gm)].map(m => ({ name: m[1], decl: m[2].trim() })));
                const q = query(); const f = (q.get('q') ?? '').toLowerCase();
                const list = all.filter(u => u.name.includes(f));
                const pg = paged(list, Number(q.get('p')) || 1, rows => `<table class="data gx-table"><thead><tr><th>Class</th><th>Declaration</th><th>Effect</th></tr></thead><tbody>${rows.map(u => `<tr><td><code>${u.name}</code></td><td><code>${esc(u.decl)}</code></td><td><div class="gx-effect"><span class="${u.name}">Sample</span></div></td></tr>`).join('')}</tbody></table>`, `#/foundations/utilities${f ? `?q=${encodeURIComponent(f)}&` : ''}`.replace(/&$/, ''));
                return heading('Utilities', `${all.length} utility classes (u-*, and spacing p-* m-* gap-* mapped to tokens), ${list.length} shown.`)
                    + section('Find a class', `<form class="gx-find" data-find="#/foundations/utilities"><label class="ff"><span>Filter</span><input type="search" name="q" value="${esc(f)}" placeholder="e.g. mt, text, gap"></label></form>${pg.html}${pg.nav}`);
            }
            case 'icons': {
                const ids = [...css.icons.matchAll(/<symbol id="([^"]+)"/g)].map(m => m[1]);
                return heading('Icons', 'The sprite sdk/icons.svg. Icon-only controls must carry an aria-label.')
                    + section(`${ids.length} icons`, `<div class="gx-icons">${ids.map(i => `<div class="gx-icon"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><use href="${ICONS}#${i}"/></svg><code>${i}</code></div>`).join('')}</div>`);
            }
            default: {
                const q = query(); const f = (q.get('q') ?? '').toLowerCase(); const kind = q.get('kind') ?? 'all';
                const all = [...new Set([...Object.keys(tokens.dark), ...Object.keys(tokens.light), ...Object.keys(tokens.root)])].sort();
                const list = all.filter(n => n.includes(f) && (kind === 'all' || tokenKind(n, tokens.dark[n] ?? tokens.root[n] ?? '') === kind));
                const base = `#/foundations/tokens?${new URLSearchParams({ ...(f ? { q: f } : {}), ...(kind !== 'all' ? { kind } : {}) })}`;
                const pg = paged(list, Number(q.get('p')) || 1, rows => `<table class="data gx-table"><thead><tr><th>Token</th><th>Kind</th><th>Dark / shared</th><th>Light</th></tr></thead><tbody>${rows.map(n => `<tr><td><code>${n}</code></td><td>${tokenKind(n, tokens.dark[n] ?? tokens.root[n] ?? '')}</td><td><code>${esc(tokens.dark[n] ?? tokens.root[n] ?? '')}</code></td><td><code>${esc(tokens.light[n] ?? '')}</code></td></tr>`).join('')}</tbody></table>`, base.endsWith('?') ? base.slice(0, -1) : base);
                return heading('Every token', `${list.length} of ${all.length} custom properties declared in tokens.css. Edit them in the theme editor.`)
                    + section('Find a token', `<form class="gx-find" data-find="#/foundations/tokens"><div class="form-row"><label class="ff"><span>Filter</span><input type="search" name="q" value="${esc(f)}" placeholder="e.g. accent, radius"></label><label class="ff"><span>Kind</span><select name="kind">${['all', 'colour', 'font', 'size', 'shadow', 'layer', 'other'].map(k => `<option${k === kind ? ' selected' : ''}>${k}</option>`).join('')}</select></label></div></form>${pg.html}${pg.nav}`);
            }
        }
    } finally { dark.remove(); light.remove(); }
}

// ---- controls ------------------------------------------------------------------------------------------------------------
function paramTable(component) {
    const rows = PARAMS[component];
    if (!rows?.length) return '<p class="muted">No parameters.</p>';
    const item = ([n, t, d, req, s]) => `<li><div class="gx-param-head"><code>${esc(n)}</code><span class="gx-param-type">${esc(t)}${d ? ` = ${esc(d)}` : ''}</span></div>${s ? `<p class="gx-param-text">${esc(s)}</p>` : ''}</li>`;
    const attr = r => /^(AdditionalAttributes|ExtraClass|Title)$/.test(r[0]);
    const required = rows.filter(r => r[3]); const optional = rows.filter(r => !r[3] && !attr(r)); const inherited = rows.filter(r => !r[3] && attr(r));
    return (required.length ? `<h4>Required</h4><ul class="gx-params">${required.map(item).join('')}</ul>` : '') + `<h4>Optional</h4><ul class="gx-params">${optional.map(item).join('')}</ul>` + (inherited.length ? `<details><summary>Attributes and extras (${inherited.length})</summary><ul class="gx-params">${inherited.map(item).join('')}</ul></details>` : '');
}

let inspector = null;
function contractHtml(c) {
    return `<div class="stack">
        <div><h3>Snippet <button type="button" class="btn-mini btn-ghost" data-copy="${esc(c.id)}">Copy</button></h3><pre class="gx-code"><code>${esc(c.snippet)}</code></pre></div>
        <div><h3>Class contract</h3><p>${(c.classes ?? []).map(k => `<code>${esc(k)}</code>`).join(' ') || '<span class="muted">none</span>'}</p></div>
        <p class="muted"><strong>CSS:</strong> ${c.css.map(f => `<code>${f}</code>`).join(', ') || 'none'}${c.js?.length ? ` &middot; <strong>JS:</strong> ${c.js.map(f => `<code>${f}</code>`).join(', ')}` : ''}</p>
        ${c.blazor ? `<div><h3>Blazor: <code>${esc(c.blazor.component)}</code></h3><pre class="gx-code"><code>${esc(c.blazor.snippet)}</code></pre>${paramTable(c.blazor.component)}</div>` : ''}</div>`;
}

function viewControl(c) {
    inspector = { title: c.name, html: contractHtml(c) };
    const el = document.createElement('div');
    el.className = 'stack';
    el.innerHTML = `${heading(c.name, c.purpose)}
        <section class="card gx-entry"><p class="muted">${c.replaces ? `<strong>Replaces:</strong> ${esc(c.replaces)}<br>` : ''}<strong>Mobile:</strong> ${esc(c.mobile)}</p>${c.states?.length ? `<p class="muted"><strong>States:</strong> ${c.states.map(esc).join(', ')}</p>` : ''}<div class="gx-samples stack"></div></section>`;
    const host = $('.gx-samples', el);
    for (const s of c.samples) { const h = document.createElement('h3'); h.textContent = s.title; host.append(h, slot(s, c.id)); }
    return el;
}

const controlCard = (c, kindSlug) => cardLink(`#/controls/${kindSlug}/${c.id}`, c.name, c.purpose.split('. ')[0].replace(/.$/, '') + '.', `<span class="gx-states">${(c.states ?? []).slice(0, 4).map(s => `<span class="chip">${esc(s)}</span>`).join(' ')}</span>`);

// ---- views ---------------------------------------------------------------------------------------------------------------
const crumbs = (...parts) => `<nav class="page-crumbs" aria-label="Breadcrumb">${parts.map(([label, href], i) => (href ? `<a href="${href}">${esc(label)}</a><span class="page-crumbs-sep" aria-hidden="true">&rsaquo;</span>` : `<span class="page-crumbs-current">${esc(label)}</span>`)).join('')}</nav>`;

function overviewHtml() {
    const narrowed = isScoped(opts) || Boolean(opts.filter);
    const cards = [
        ['#/foundations', 'Foundations', 'Colours, type, spacing, radii, breakpoints, utilities, icons and every token.'],
        ['#/controls', 'Controls', `${CONTROLS.filter(c => c.kind !== 'Page templates').length} controls with live samples, states and the markup contract.`],
        ['#/elements', 'Elements', `${ELEMENTS.length} custom elements generated from their API data, each with a live playground.`],
        ['#/samples', 'Samples', `${TEMPLATE_PAGES.length} page templates, ${PATTERNS.length} patterns and ${LAYOUTS.length + 2} layouts, all built only from the SDK.`],
        ...(HAS_SITE && !narrowed ? [
            ['../theme/index.html', 'Theme editor', 'Edit every token live and export the override block.'],
            ['../scorecard/index.html', 'Scorecard', 'Performance, look and accessibility scores, the size sweep and security findings.'],
            ['../files/index.html', 'Files', 'Browse the SDK source in the code explorer.'],
        ] : []),
    ];
    return heading('Plainkit', 'Plain HTML, CSS and JS: no framework, no build step to use it, no runtime dependencies.')
        + `<div class="grid">${cards.filter(([h]) => !h.startsWith('#/') || !narrowed || scope(h.slice(2))).map(([h, t, d]) => cardLink(h, t, d)).join('')}</div>`
        + section('Quick start', `<pre class="gx-code"><code>&lt;link rel="stylesheet" href="plainkit/dist/plainkit.min.css"&gt;\n&lt;script type="module"&gt;import { initPlainkit } from './plainkit/dist/js/plainkit.js'; initPlainkit();&lt;/script&gt;</code></pre><p class="muted">Set <code>data-theme</code> to dark or light and <code>data-density="compact"</code> on any element.</p>`);
}

function samplesView(out, put, a, b) {
    const back = (label, href) => `<a class="btn-mini btn-primary" href="${href}">${esc(label)}</a>`;
    const groups = { templates: 'Templates', patterns: 'Patterns', layouts: 'Layouts', blocks: 'Building blocks' };
    if (!a) return put(heading('Samples', 'Everything here is built only from the SDK: templates (page structures), patterns (composed behaviours), layouts and building blocks.') + `<div class="grid">${Object.entries(groups).filter(([id]) => scopeGroup('samples', id)).map(([id, t]) => cardLink(`#/samples/${id}`, t, { templates: `${TEMPLATE_PAGES.length} full-page templates with a slot contract.`, patterns: `${PATTERNS.length} realistic composed examples.`, layouts: 'Page anatomies at desktop and phone width.', blocks: 'The reusable templates and the top bar.' }[id])).join('')}</div>`);
    const groupCrumb = (id, name) => crumbs(['Samples', '#/samples'], [groups[id], `#/samples/${id}`], [name]);
    if (a === 'templates') {
        if (!b) return put(crumbs(['Samples', '#/samples'], ['Templates']) + heading('Templates', 'Full-page templates, each a runnable example with a slot contract: preview one in the side-nav or top-nav variant, light or dark.') + `<div class="grid">${TEMPLATE_PAGES.filter(([id]) => keeps('samples', 'templates', id)).map(([id, tt, , d]) => cardLink(`#/samples/templates/${id}`, tt, d)).join('')}</div>`);
        const tp = TEMPLATE_PAGES.find(x => x[0] === b);
        if (!tp) return put(heading('Not found') + `<p>${back('Back to templates', '#/samples/templates')}</p>`);
        const q = new URLSearchParams(location.hash.split('?')[1] ?? ''); const nav = q.get('nav') === 'top' ? 'top' : 'side'; const th = q.get('theme') ?? state.theme;
        const link = (k, v, l) => { const p = new URLSearchParams({ nav, theme: th, [k]: v }); return `<a class="btn-mini btn-ghost" href="#/samples/templates/${b}?${p}" aria-pressed="${(k === 'nav' ? nav : th) === v}">${l}</a>`; };
        put(groupCrumb('templates', tp[1]) + heading(tp[1], tp[3]) + `<div class="cluster cluster--horizontal cluster--gap-sm cluster--align-center cluster--justify-start">${back('Back to templates', '#/samples/templates')}${link('nav', 'side', 'Side nav')}${link('nav', 'top', 'Top nav')}${link('theme', 'dark', 'Dark')}${link('theme', 'light', 'Light')}<a class="btn-mini btn-ghost" href="${TEMPLATES_DIR}${tp[2]}?nav=${nav}&theme=${th}" target="_blank" rel="noopener">Open full page</a></div><p class="muted"><strong>Slots:</strong> ${esc(tp[4])}</p><iframe class="gx-frame gx-stage" title="${esc(tp[1])} template" src="${TEMPLATES_DIR}${tp[2]}?nav=${nav}&theme=${th}" data-dyn="width:${state.width === 'phone' ? PHONE_WIDTH + 'px' : '100%'}"></iframe>`);
        return out;
    }
    if (a === 'patterns') {
        if (!b) return put(crumbs(['Samples', '#/samples'], ['Patterns']) + heading('Patterns', 'Composed examples: several controls working together to do one job.') + `<div class="grid">${PATTERNS.filter(p => keeps('samples', 'patterns', p.id)).map(p => cardLink(`#/samples/patterns/${p.id}`, p.title, p.summary)).join('')}</div>`);
        const p = PATTERNS.find(x => x.id === b);
        if (!p) return put(heading('Not found') + `<p>${back('Back to patterns', '#/samples/patterns')}</p>`);
        put(`${groupCrumb('patterns', p.title)}${heading(p.title, p.summary)}<section class="card gx-entry"><p class="muted"><strong>Built from:</strong> ${esc(p.built)}</p><p class="muted"><strong>Mobile:</strong> ${esc(p.mobile)}</p><p class="muted"><strong>Controls used:</strong> ${p.used.map(u => { const c = CONTROLS.find(x => x.id === u); return c ? `<a href="#/controls/${slug(c.kind)}/${c.id}">${esc(c.name)}</a>` : esc(u); }).join(', ')}</p><div class="gx-pair"><div><h3>Desktop</h3></div><div><h3>Phone (375px frame)</h3></div></div><p>${back('Back to patterns', '#/samples/patterns')}</p></section>`);
        const [d, ph] = out.querySelectorAll('.gx-pair > div');
        d.append(slot({ title: `${p.title} desktop`, html: p.html }, `pattern-${p.id}`, 'desktop')); ph.append(slot({ title: `${p.title} phone`, html: p.html }, `pattern-${p.id}`, 'phone'));
        return out;
    }
    if (a === 'layouts') {
        if (!b) return put(crumbs(['Samples', '#/samples'], ['Layouts']) + heading('Layouts', 'How the controls compose into pages.') + `<div class="grid">${LAYOUT_ITEMS().filter(([id]) => keeps('samples', 'layouts', id)).map(([id, t]) => cardLink(`#/samples/layouts/${id}`, t, '')).join('')}</div>`);
        if (b === 'responsive') return put(groupCrumb('layouts', 'Responsive rules') + heading('Responsive rules') + section('Width steps', `<table class="data gx-table"><thead><tr><th>Width</th><th>What changes</th></tr></thead><tbody>${RESPONSIVE_RULES.map(r => `<tr><td>${r.width}</td><td>${esc(r.change)}</td></tr>`).join('')}</tbody></table><p class="muted">Design mobile-first: write the phone layout, then add the multi-column layout above it.</p>`));
        if (b === 'shell') { put(groupCrumb('layouts', 'App shell') + heading('App shell', 'A sidebar, a main column with the top bar, the page body and a footer strip. The header and footer strips share one height token each.') + '<section class="card gx-entry"><div class="gx-samples"></div></section>'); $('.gx-samples', out).append(slot(CONTROLS.find(c => c.id === 'app-shell').samples[0], 'app-shell')); return out; }
        const l = LAYOUTS.find(x => x.id === b);
        if (!l) return put(heading('Not found') + `<p>${back('Back to layouts', '#/samples/layouts')}</p>`);
        put(`${groupCrumb('layouts', l.title)}${heading(l.title, l.summary)}<section class="card gx-entry"><p class="muted"><strong>Built from:</strong> ${esc(l.built)}</p><p class="muted"><strong>Mobile:</strong> ${esc(l.mobile)}</p><div class="gx-pair"><div><h3>Desktop</h3></div><div><h3>Phone (375px frame)</h3></div></div></section>`);
        const [d, ph] = out.querySelectorAll('.gx-pair > div');
        d.append(slot({ title: `${l.title} desktop`, html: l.html }, `layout-${l.id}`, 'desktop')); ph.append(slot({ title: `${l.title} phone`, html: l.html }, `layout-${l.id}`, 'phone'));
        return out;
    }
    if (a === 'blocks') {
        if (!b) return put(crumbs(['Samples', '#/samples'], ['Building blocks']) + heading('Building blocks', 'The reusable page templates and the top bar.') + `<div class="grid">${templates().filter(c => keeps('samples', 'blocks', c.id)).map(c => cardLink(`#/samples/blocks/${c.id}`, c.name, c.purpose.split('. ')[0].replace(/.$/, '') + '.')).join('')}</div>`);
        const c = templates().find(x => x.id === b);
        if (!c) return put(heading('Not found') + `<p>${back('Back to building blocks', '#/samples/blocks')}</p>`);
        out.append(viewControl(c)); out.insertAdjacentHTML('afterbegin', groupCrumb('blocks', c.name)); return out;
    }
    return put(heading('Not found') + `<p>${back('Back to samples', '#/samples')}</p>`);
}

function view() {
    inspector = null;
    const { section: sec, a, b } = route();
    const out = document.createElement('div'); out.className = 'container stack';
    watchFrames();
    const put = html => { out.innerHTML = html; applyDynamic(out); return out; };
    if (collection()) {
        const shown = filterLeaves(leaves(tree()), opts.filter).filter(l => l.section.id === 'controls');
        if (!shown.length) return put('<p class="muted">Nothing in the gallery matches.</p>');
        for (const l of shown) out.append(viewControl(CONTROLS.find(c => c.id === l.id)));
        return out;
    }
    // An overview the mount's scope or filter leaves empty says so instead of listing what the embedder cut.
    if (!a && ['foundations', 'controls', 'elements', 'samples'].includes(sec) && !scope(sec)) return put('<p class="muted">Nothing in the gallery matches.</p>');
    if (sec === 'foundations') {
        if (!a) return put(heading('Foundations', 'The tokens every control reads.') + `<div class="grid">${FOUNDATIONS.filter(([id]) => scope('foundations')?.items.some(i => i.id === id)).map(([id, t, d]) => cardLink(`#/foundations/${id}`, t, d)).join('')}</div>`);
        return put(viewFoundation(a));
    }
    if (sec === 'controls') {
        if (!a) { const gs = scope('controls').groups; return put(heading('Controls', `${gs.reduce((n, g) => n + g.items.length, 0)} controls in ${gs.length} groups. Pick a group.`) + `<div class="grid">${gs.map(g => cardLink(g.hash, g.title, g.items.map(i => i.title).join(', '))).join('')}</div>`); }
        const kind = controlKinds().find(k => slug(k) === a);
        if (!kind) return put(heading('Not found', 'No such group.'));
        if (!b) { const items = scopeGroup('controls', a)?.items ?? []; return put(heading(kind, `${items.length} controls.`) + `<div class="grid">${items.map(i => controlCard(CONTROLS.find(c => c.id === i.id), a)).join('')}</div>`); }
        const c = CONTROLS.find(x => x.id === b);
        if (!c) return put(heading('Not found', 'No such control.'));
        out.append(viewControl(c)); return out;
    }
    if (sec === 'overview') return put(overviewHtml());
    if (sec === 'elements') {
        const meta = ELEMENTS.find(m => m.tag === a);
        if (meta) { out.append(renderElement(meta)); return out; }
        return put(heading('Elements', 'Custom elements with Shadow DOM: declared props, slots, events and parts. Each page below is generated from the element\'s API data, with a live playground.') + scope('elements').groups.map(g => `<section class="gx-el-group"><h2>${esc(g.title)} <span class="muted">${g.items.length}</span></h2><div class="grid">${g.items.map(i => { const m = ELEMENTS.find(x => x.tag === i.id); return cardLink(i.hash, `<${m.tag}>`, m.summary.split('. ')[0].replace(/\.$/, '') + '.'); }).join('')}</div></section>`).join(''));
    }
    if (sec === 'samples') return samplesView(out, put, a, b);
    return put(heading('Not found'));
}

// ---- assembly ------------------------------------------------------------------------------------------------------------
function render() {
    const body = $('#gx-view');
    body.replaceChildren(view());
    body.scrollTop = 0;
    renderNav();
    renderInspector();
    if (!bare) {
        document.title = `${route().section} - ${baseTitle}`;
        $('#gx-shell').classList.remove('workspace--nav');
        $('[data-gx-contents]').setAttribute('aria-expanded', 'false');
    }
}

const phone = () => matchMedia('(max-width: 640px)').matches;

function renderInspector() {
    const box = $('#gx-inspector'); const toggle = $('#gx-inspect');
    if (!box) return;
    toggle.hidden = !inspector;
    if (!inspector) { box.hidden = true; $('#gx-view').classList.remove('workspace-pane--inspecting'); return; }
    $('h2', box).textContent = `${inspector.title}: markup`;
    $('#gx-inspector-body').innerHTML = inspector.html;
    const stored = readSetting('pk-gallery-inspector');
    const open = stored === null ? !phone() : stored === '1';
    setInspector(open, false);
}

function setInspector(open, remember = true) {
    $('#gx-inspector').hidden = !open;
    $('#gx-inspect').setAttribute('aria-pressed', String(open));
    $('#gx-view').classList.toggle('workspace-pane--inspecting', open);
    if (remember) writeSetting('pk-gallery-inspector', open ? '1' : '0');
}

function initResize() {
    const handle = $('#gx-resize'); const shell = $('#gx-shell');
    const apply = px => { const w = Math.min(Math.max(px, 320), Math.round(innerWidth * 0.7)); shell.style.setProperty('--inspector-w', w + 'px'); return w; };
    const saved = Number(readSetting('pk-gallery-inspector-w')); if (saved) apply(saved);
    handle.addEventListener('pointerdown', e => {
        e.preventDefault(); handle.setPointerCapture(e.pointerId);
        const move = ev => apply(shell.getBoundingClientRect().right - ev.clientX);
        const up = () => { handle.removeEventListener('pointermove', move); handle.removeEventListener('pointerup', up); writeSetting('pk-gallery-inspector-w', String(parseInt(getComputedStyle(shell).getPropertyValue('--inspector-w'), 10) || 0)); };
        handle.addEventListener('pointermove', move); handle.addEventListener('pointerup', up);
    });
    handle.addEventListener('keydown', e => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        const cur = $('#gx-inspector').getBoundingClientRect().width; const w = apply(cur + (e.key === 'ArrowLeft' ? 24 : -24)); writeSetting('pk-gallery-inspector-w', String(w));
    });
}

function paintToolbar() {
    document.querySelectorAll('[data-set-theme]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.setTheme === state.theme)));
    document.querySelectorAll('[data-set-width]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.setWidth === state.width)));
    document.querySelectorAll('.gx-scale').forEach(s => { s.value = String(state.scale); });
}

const CHROME_HTML = `
    <div class="workspace workspace--fill" id="gx-shell">
        <aside class="workspace-nav" id="gx-nav" aria-label="Gallery contents"></aside>
        <main class="workspace-main">
            <div class="workspace-bar" role="toolbar" aria-label="Preview settings">
                <button type="button" class="btn-ghost gx-contents" data-gx-contents aria-expanded="false">Contents</button>
                <div class="gx-group gx-desktop-only" role="group" aria-label="Viewport"><span class="gx-group-label">Viewport</span><div class="btn-group"><button type="button" class="btn-ghost" data-set-width="desktop" aria-pressed="true">Desktop</button><button type="button" class="btn-ghost" data-set-width="phone" aria-pressed="false">Phone 375</button></div></div>
                <div class="gx-group gx-desktop-only"><label class="gx-group-label" for="gx-scale">Text size</label><select id="gx-scale" class="gx-scale"><option value="0.9">90%</option><option value="1">100%</option><option value="1.15">115%</option><option value="1.3">130%</option></select></div>
                <div class="dropdown dropdown--end gx-phone-only gx-end" data-pk-dropdown><button type="button" class="btn-ghost" aria-expanded="false" aria-haspopup="true">Display</button><div class="dropdown-menu" hidden><label class="ff gx-menu-field"><span>Text size</span><select class="gx-scale" aria-label="Text size"><option value="0.9">90%</option><option value="1">100%</option><option value="1.15">115%</option><option value="1.3">130%</option></select></label></div></div>
                <button type="button" class="btn-ghost gx-inspect" id="gx-inspect" aria-pressed="false" aria-controls="gx-inspector" hidden>Details</button>
            </div>
            <div class="gx-body">
            <div class="workspace-pane gx-view" id="gx-view"></div>
            <div class="flyout-panel flyout-panel--docked" id="gx-inspector" role="complementary" aria-label="Inspector" hidden>
                <div class="gx-resize" id="gx-resize" role="separator" aria-orientation="vertical" aria-label="Resize the inspector" tabindex="0"></div>
                <header class="flyout-header"><h2>Inspector</h2><button type="button" class="btn-mini btn-ghost flyout-close" aria-label="Close inspector" data-gx-inspect-close>&#10005;</button></header>
                <div class="flyout-body" id="gx-inspector-body"></div>
            </div>
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
    paintToolbar();
    render();
    // The chrome's menus and the element pages need the SDK behaviours and element modules; a host that only mounts the gallery has not called initPlainkit, so the gallery does (idempotent per root).
    initPlainkit(document);

    if (!bare) initResize();
    window.addEventListener('hashchange', render);
    // Escape closes the phone Contents list and hands focus back to its button, so the keyboard is never stranded inside it.
    $('#gx-shell').addEventListener('keydown', e => {
        const shell = $('#gx-shell'); const btn = $('[data-gx-contents]');
        if (e.key !== 'Escape' || !btn || !shell.classList.contains('workspace--nav') || !e.target.closest('#gx-nav')) return;
        shell.classList.remove('workspace--nav'); btn.setAttribute('aria-expanded', 'false'); btn.focus();
    });
    $('#gx-shell').addEventListener('click', e => {
        if (e.target.closest('[data-gx-contents]')) { const on = $('#gx-shell').classList.toggle('workspace--nav'); e.target.closest('[data-gx-contents]').setAttribute('aria-expanded', String(on)); if (on) ($('#gx-search') ?? $('#gx-nav')?.querySelector('a, button'))?.focus(); }
        if (e.target.closest('#gx-inspect')) setInspector($('#gx-inspector').hidden);
        if (e.target.closest('[data-gx-inspect-close]')) setInspector(false);
        const t = e.target.closest('[data-set-theme]');
        if (t) { setTheme(document.documentElement, t.dataset.setTheme); writeSetting('pk-site-theme', t.dataset.setTheme); state.theme = t.dataset.setTheme; refreshFrames({ theme: state.theme }); paintToolbar(); }
        const w = e.target.closest('[data-set-width]');
        if (w) { state.width = w.dataset.setWidth; document.documentElement.dataset.width = state.width; writeSetting('pk-gallery-width', state.width); refreshFrames({ width: state.width }); paintToolbar(); }
        const br = e.target.closest('[data-branch]');
        if (br) { const id = br.dataset.branch; state.open.has(id) ? state.open.delete(id) : state.open.add(id); writeSetting('pk-gallery-open', JSON.stringify([...state.open])); const open = state.open.has(id); br.setAttribute('aria-expanded', String(open)); br.nextElementSibling.hidden = !open; }
        const c = e.target.closest('[data-copy]');
        if (c) { const d = CONTROLS.find(x => x.id === c.dataset.copy); navigator.clipboard?.writeText(d.snippet).then(() => { c.textContent = 'Copied'; setTimeout(() => { c.textContent = 'Copy'; }, 1200); }, () => {}); }
    });
    document.querySelectorAll('.gx-scale').forEach(sel => sel.addEventListener('change', e => { state.scale = Number(e.target.value); writeSetting('pk-gallery-scale', String(state.scale)); refreshFrames({ scale: state.scale }); paintToolbar(); }));
    const filterChanged = v => { state.filter = v; renderNav(); const i = $('#gx-search'); if (i && i.value !== v) i.value = v; if (i && document.activeElement !== i && v) i.focus(); };
    $('#gx-nav')?.addEventListener('input', e => { if (e.target.id === 'gx-search') filterChanged(e.target.value); });
    document.addEventListener('site-search', e => filterChanged(e.detail));
    document.addEventListener('site-theme', e => { state.theme = e.detail; refreshFrames({ theme: state.theme }); paintToolbar(); });
    $('#gx-view').addEventListener('submit', e => { e.preventDefault(); });
    $('#gx-view').addEventListener('input', e => {
        const form = e.target.closest('.gx-find'); if (!form) return;
        clearTimeout(form._t);
        form._t = setTimeout(() => { const p = new URLSearchParams([...new FormData(form)].filter(([, v]) => v && v !== 'all')); location.hash = `${form.dataset.find}${p.toString() ? '?' + p : ''}`; setTimeout(() => { const n = $('#gx-view .gx-find input[type=search]'); n?.focus(); n?.setSelectionRange(n.value.length, n.value.length); }, 30); }, 250);
    });
}
