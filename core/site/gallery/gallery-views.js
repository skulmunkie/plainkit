// The Gallery's views: the building blocks every view is made of (a page title, a titled card, a data table ...), the foundations, the overview and the samples views. Each view is a
// function of the address's parts that returns the page's markup or fills the stack it is given; what it needs of the gallery (the mount's options, the stylesheets it read, the scope, a lazy
// sample frame) comes in through one ctx, so the views read no module state of their own (#401).
import { TEMPLATES_DIR, HAS_SITE } from './paths.js';
import { isScoped } from '../../js/gallery-options.js';
import { BREAKPOINTS, TEXT_PAIRS, LAYOUTS, RESPONSIVE_RULES, PATTERNS, TEMPLATES, ELEMENTS, loadElement } from './gallery.data.js';
import { PHONE_WIDTH } from './frame.js';
import { parseTokenBlocks, tokenKind } from '../../js/theme.js';
import { contrast, grade } from '../../js/colour.js';
import { initPlainkit } from '../../js/plainkit.js';
import { on } from '../../js/mount-support.js';

export const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const PAGE_SIZE = 40;

export const FOUNDATIONS = [
    ['colours', 'Colours', 'Every colour token in the dark and light themes, side by side, with WCAG contrast for the text pairs.'],
    ['typography', 'Typography', 'The font stack, headings, body and the text scale.'],
    ['spacing', 'Spacing', 'The spacing scale and the named roles built on it: label to input, field to field, card to card, section to section.'],
    ['radii-shadows', 'Radii and shadows', 'Corner radii, shadows, layers and touch targets.'],
    ['breakpoints', 'Breakpoints', 'The three responsive steps and what changes at each.'],
    ['utilities', 'Utilities', 'The u-* classes, searchable and paged.'],
    ['icons', 'Icons', 'The sprite: 24px line icons drawn in the surrounding text colour.'],
    ['tokens', 'Every token', 'All custom properties in tokens.css, searchable and paged.'],
];
export const LAYOUT_ITEMS = () => [['shell', 'App shell'], ['responsive', 'Responsive rules'], ...LAYOUTS.map(l => [l.id, l.title])];
// [id, title, path under samples/templates, summary, slots]
export const TEMPLATE_PAGES = TEMPLATES.map(t => [t.id, t.title, t.file.replace('samples/templates/', ''), t.summary, t.slots]);


export const KIND_LABEL = Object.fromEntries(['templates', 'patterns', 'layouts'].map(k => [k, k[0].toUpperCase() + k.slice(1)]));

// ---- small building blocks ------------------------------------------------------------------------------------------------
// A page title with its breadcrumb above and its lead below (a pk-page-header); a titled card; a card that is one link.
export const crumbs = (...parts) => `<pk-breadcrumb slot="breadcrumb" label="Breadcrumb">${parts.map(([label, href]) => (href ? `<a href="${href}">${esc(label)}</a>` : `<span aria-current="page">${esc(label)}</span>`)).join('')}</pk-breadcrumb>`;
export const heading = (title, lead, crumb = '') => `<pk-page-header class="gx-head" level="1" heading="${esc(title)}">${crumb}${lead ? `<pk-text tone="muted" slot="meta">${esc(lead)}</pk-text>` : ''}</pk-page-header>`;
export const section = (title, body) => `<pk-card class="gx-entry" heading="${esc(title)}">${body}</pk-card>`;
export const cardLink = (href, title, text, extra = '') => `<pk-card class="gx-tile" href="${href}" heading="${esc(title)}"><pk-text inline tone="muted">${esc(text)}</pk-text>${extra}</pk-card>`;
export const grid = html => `<pk-grid min="14rem">${html}</pk-grid>`;
export const notFound = (title, lead, back) => `<pk-empty-state heading="${esc(title)}"${lead ? ` description="${esc(lead)}"` : ''}>${back ? `<a slot="actions" href="${back[1]}">${esc(back[0])}</a>` : ''}</pk-empty-state>`;
export const nothing = () => '<pk-empty-state tone="compact" heading="Nothing in the gallery matches."></pk-empty-state>';
// A data table: the raw table goes inside pk-table (frame, scrolling), each cell labelled so a phone can lay a row out as a card (gallery.css).
export const dataTable = (label, cols, rows, numeric = []) => `<pk-table label="${esc(label)}"><table class="gx-table"><thead><tr>${cols.map((c, i) => `<th${numeric.includes(i) ? ' class="num"' : ''}>${c}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map((c, i) => `<td${numeric.includes(i) ? ' class="num"' : ''} data-label="${esc(String(cols[i]).replace(/<[^>]*>/g, ''))}">${c}</td>`).join('')}</tr>`).join('')}</tbody></table></pk-table>`;
export const codeBlock = (code, label = '') => `<pk-code-block${label ? ` label="${esc(label)}"` : ''} wrap>${esc(code)}</pk-code-block>`;

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

// ctx: opts() the mount's options, css() the stylesheets read at mount (tokens, utilities, spacing, icons), scope(id) what the scope and filter leave of a section (scopeGroup(section, group) and keeps(section, group, id) likewise), slot(sample, control, fixed) a lazy sample frame, state the gallery's theme and width.
export function createViews(ctx) {
    const { scope, scopeGroup, keeps, slot, state } = ctx;
    function viewFoundation(id) {
        const tokens = parseTokenBlocks(ctx.css().tokens);
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
                        + section('Type', `<pk-text tone="muted">Font stack <code>--font-sans</code>: <code>${esc(val(dark, '--font-sans'))}</code></pk-text><p class="u-fs-1p1r u-m0">Heading 1 (the page title uses h1)</p><h2>Heading 2</h2><h3>Heading 3</h3><h4>Heading 4</h4><p>Body text. The quick brown fox jumps over the lazy dog.</p><pk-text tone="muted">Muted text for secondary notes.</pk-text><p><a href="#/foundations/typography">A link</a> and <code>inline code</code>.</p>`)
                        + section('Text scale', `<pk-cluster class="gx-demo" gap="md" align="baseline">${scale('--text-').map(([n, v]) => `<span data-dyn="font-size:var(${n})">Aa <pk-text inline tone="muted" size="meta">${n} ${esc(v)}</pk-text></span>`).join('')}</pk-cluster>`);
                case 'spacing': {
                    const roles = Object.entries(tokens.root).filter(([n]) => /^--(gap|pad|flow)-/.test(n));
                    return heading('Spacing', 'One scale, and named roles built on it. Components and utilities read the roles, never a literal, so a density mode moves the whole rhythm.')
                        + section('The scale', scale('--space-').map(([n, v]) => `<div class="gx-space-row"><code>${n}</code><pk-text inline tone="muted">${esc(v)}</pk-text><span class="gx-space-bar" data-dyn="width:var(${n})"></span></div>`).join(''))
                        + section('Roles', `${dataTable('Spacing roles', ['Role', 'Value'], roles.map(([n, v]) => [`<code>${n}</code>`, `<code>${esc(v)}</code>`]))}<pk-text tone="muted">Compact density overrides these on any element with <code>data-density="compact"</code>. See the <a href="../spacing/index.html">spacing page</a> for the rhythm in use.</pk-text>`);
                }
                case 'radii-shadows':
                    return heading('Radii and shadows', 'Corner radii, shadows, layers and touch targets.')
                        + section('Radii', `<pk-cluster gap="md">${scale('--radius-').map(([n, v]) => `<span class="gx-box" data-dyn="border-radius:var(${n})"><code>${n}</code><pk-text inline tone="muted" size="meta">${esc(v)}</pk-text></span>`).join('')}</pk-cluster>`)
                        + section('Shadows', `<pk-cluster gap="md">${[...scale('--shadow-'), ...Object.entries(tokens.dark).filter(([n]) => /shadow/.test(n) && !n.startsWith('--shadow-'))].slice(0, 8).map(([n]) => `<span class="gx-box" data-dyn="box-shadow:var(${n})"><code>${n}</code></span>`).join('')}</pk-cluster>`)
                        + section('Layers and targets', `<pk-cluster gap="md">${[...scale('--z-'), ...scale('--touch'), ...scale('--app-'), ...scale('--shell-')].map(([n, v]) => `<span class="gx-z"><code>${n}</code> <pk-text inline tone="muted" size="meta">${esc(v)}</pk-text></span>`).join('')}</pk-cluster>`);
                case 'breakpoints':
                    return heading('Breakpoints', 'Media queries cannot read a variable, so the three steps are literals. Use the Phone width switch to see 640px apply in every sample.')
                        + section('Steps', dataTable('Breakpoints', ['Name', 'max-width', 'What changes'], BREAKPOINTS.map(b => [b.name, `<code>${b.px}px</code>`, esc(b.meaning)]), [1]));
                case 'utilities': {
                    const all = [...ctx.css().utilities.matchAll(/\.(u-[\w-]+)\s*\{([^}]*)\}/g)].map(m => ({ name: m[1], decl: m[2].trim().replace(/\s*!important/g, '') })).concat([...ctx.css().spacing.matchAll(/^\.([a-z]+-[\w]+) \{ ([^}]*)\}/gm)].map(m => ({ name: m[1], decl: m[2].trim() })));
                    const q = query(); const f = (q.get('q') ?? '').toLowerCase();
                    const list = all.filter(u => u.name.includes(f));
                    const pg = paged(list, Number(q.get('p')) || 1, rows => dataTable('Utility classes', ['Class', 'Declaration', 'Effect'], rows.map(u => [`<code>${u.name}</code>`, `<code>${esc(u.decl)}</code>`, `<div class="gx-effect"><span class="${u.name}">Sample</span></div>`])), `#/foundations/utilities${f ? `?q=${encodeURIComponent(f)}` : ''}`);
                    return heading('Utilities', `${all.length} utility classes (u-*, and spacing p-* m-* gap-* mapped to tokens), ${list.length} shown.`)
                        + section('Find a class', `<form class="gx-find" data-find="#/foundations/utilities"><pk-field label="Filter"><pk-input type="search" name="q" value="${esc(f)}" placeholder="e.g. mt, text, gap"></pk-input></pk-field></form>${pg.html}${pg.nav}`);
                }
                case 'icons': {
                    const ids = [...ctx.css().icons.matchAll(/<symbol id="([^"]+)"/g)].map(m => m[1]);
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


    // ---- views ---------------------------------------------------------------------------------------------------------------
    function overviewHtml() {
        const narrowed = isScoped(ctx.opts()) || Boolean(ctx.opts().filter);
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
            + section('Quick start', `${codeBlock('<link rel="stylesheet" href="plainkit/dist/plainkit.min.css">\n<script type="module">import { initPlainkit } from \'./plainkit/dist/js/init.js\'; initPlainkit();</script>', 'HTML')}<pk-text tone="muted">Set <code>data-theme</code> to dark or light and <code>data-density="compact"</code> on any element.</pk-text>`);
    }

    function samplesView(out, put, a, b) {
        const groups = KIND_LABEL;
        if (!a) return put(heading('Samples', 'Everything here is built only from the SDK: templates (page structures), patterns (composed behaviours) and layouts.') + grid(Object.entries(groups).filter(([id]) => scopeGroup('samples', id)).map(([id, t]) => cardLink(`#/samples/${id}`, t, new Map([['templates', `${TEMPLATE_PAGES.length} full-page templates with a slot contract.`], ['patterns', `${PATTERNS.length} realistic composed examples.`], ['layouts', 'Page anatomies at desktop and phone width.']]).get(id))).join('')));
        const groupCrumb = (id, name) => crumbs(['Samples', '#/samples'], [groups[id], `#/samples/${id}`], [name]);
        if (a === 'templates') {
            if (!b) return put(heading('Templates', 'Full-page templates, each a runnable example with a slot contract: preview one in the side-nav or top-nav variant, light or dark.', crumbs(['Samples', '#/samples'], ['Templates'])) + grid(TEMPLATE_PAGES.filter(([id]) => keeps('samples', 'templates', id)).map(([id, tt, , d]) => cardLink(`#/samples/templates/${id}`, tt, d)).join('')));
            const tp = TEMPLATE_PAGES.find(x => x[0] === b);
            if (!tp) return put(notFound('Not found', '', ['Back to templates', '#/samples/templates']));
            const q = new URLSearchParams(location.hash.split('?')[1] ?? ''); const nav = q.get('nav') === 'top' ? 'top' : 'side'; const th = q.get('theme') ?? state.theme;
            const link = (k, v, l) => { const p = new URLSearchParams({ nav, theme: th, [k]: v }); return `<pk-button variant="ghost" size="mini" toggle${(k === 'nav' ? nav : th) === v ? ' pressed' : ''} data-goto="#/samples/templates/${b}?${p}">${l}</pk-button>`; };
            put(heading(tp[1], tp[3], groupCrumb('templates', tp[1])) + `<pk-cluster gap="sm"><a href="#/samples/templates">Back to templates</a><pk-button-group label="Navigation variant" mode="single">${link('nav', 'side', 'Side nav')}${link('nav', 'top', 'Top nav')}</pk-button-group><pk-button-group label="Theme" mode="single">${link('theme', 'dark', 'Dark')}${link('theme', 'light', 'Light')}</pk-button-group><a href="${TEMPLATES_DIR}${tp[2]}?nav=${nav}&theme=${th}" target="_blank" rel="noopener">Open full page</a></pk-cluster><pk-text tone="muted"><strong>Slots:</strong> ${esc(tp[4])}</pk-text><iframe class="gx-frame gx-stage" title="${esc(tp[1])} template" src="${TEMPLATES_DIR}${tp[2]}?nav=${nav}&theme=${th}" data-dyn="width:${state.width === 'phone' ? PHONE_WIDTH + 'px' : '100%'}"></iframe>`);
            return out;
        }
        if (a === 'patterns') {
            if (!b) return put(heading('Patterns', 'Composed examples: several elements working together to do one job.', crumbs(['Samples', '#/samples'], ['Patterns'])) + grid(PATTERNS.filter(p => keeps('samples', 'patterns', p.id)).map(p => cardLink(`#/samples/patterns/${p.id}`, p.title, p.summary)).join('')));
            const p = PATTERNS.find(x => x.id === b);
            if (!p) return put(notFound('Not found', '', ['Back to patterns', '#/samples/patterns']));
            put(`${heading(p.title, p.summary, groupCrumb('patterns', p.title))}<pk-card class="gx-entry"><pk-text tone="muted"><strong>Built from:</strong> ${esc(p.built)}</pk-text><pk-text tone="muted"><strong>Mobile:</strong> ${esc(p.mobile)}</pk-text><pk-text tone="muted"><strong>Elements used:</strong> ${p.used.map(u => { const m = ELEMENTS.find(x => x.tag === `pk-${u}`); return m ? `<a href="#/elements/${m.tag}">${esc(m.title)}</a>` : esc(u); }).join(', ')}</pk-text><div class="gx-pair"><div><h3>Desktop</h3></div><div><h3>Phone (375px frame)</h3></div></div><p><a href="#/samples/patterns">Back to patterns</a></p></pk-card>`);
            const [d, ph] = out.querySelectorAll('.gx-pair > div');
            // A pattern that ships a script runs it in each frame, on that frame's own markup (frame-boot.js).
            d.append(slot({ title: `${p.title} desktop`, html: p.html, pattern: p.script }, `pattern-${p.id}`, 'desktop')); ph.append(slot({ title: `${p.title} phone`, html: p.html, pattern: p.script }, `pattern-${p.id}`, 'phone'));
            return out;
        }
        if (a === 'layouts') {
            if (!b) return put(heading('Layouts', 'How the elements compose into pages.', crumbs(['Samples', '#/samples'], ['Layouts'])) + grid(LAYOUT_ITEMS().filter(([id]) => keeps('samples', 'layouts', id)).map(([id, t]) => cardLink(`#/samples/layouts/${id}`, t, '')).join('')));
            if (b === 'responsive') return put(heading('Responsive rules', '', groupCrumb('layouts', 'Responsive rules')) + section('Width steps', `${dataTable('Responsive width steps', ['Width', 'What changes'], RESPONSIVE_RULES.map(r => [r.width, esc(r.change)]))}<pk-text tone="muted">Design mobile-first: write the phone layout, then add the multi-column layout above it.</pk-text>`));
            if (b === 'shell') { put(heading('App shell', 'A sidebar, a main column with the top bar, the page body and a footer strip. The header and footer strips share one height token each.', groupCrumb('layouts', 'App shell')) + '<pk-card class="gx-entry"><div class="gx-samples"></div></pk-card>'); const box = $('.gx-samples', out); loadElement('pk-app-shell').then(m => { if (box.isConnected) box.append(slot({ title: 'App shell', html: m.examples[0].html }, 'app-shell')); }); return out; }
            const l = LAYOUTS.find(x => x.id === b);
            if (!l) return put(notFound('Not found', '', ['Back to layouts', '#/samples/layouts']));
            put(`${heading(l.title, l.summary, groupCrumb('layouts', l.title))}<pk-card class="gx-entry"><pk-text tone="muted"><strong>Built from:</strong> ${esc(l.built)}</pk-text><pk-text tone="muted"><strong>Mobile:</strong> ${esc(l.mobile)}</pk-text><div class="gx-pair"><div><h3>Desktop</h3></div><div><h3>Phone (375px frame)</h3></div></div></pk-card>`);
            const [d, ph] = out.querySelectorAll('.gx-pair > div');
            d.append(slot({ title: `${l.title} desktop`, html: l.html }, `layout-${l.id}`, 'desktop')); ph.append(slot({ title: `${l.title} phone`, html: l.html }, `layout-${l.id}`, 'phone'));
            return out;
        }
        return put(notFound('Not found', '', ['Back to samples', '#/samples']));
    }
    return { viewFoundation, overviewHtml, samplesView };
}
