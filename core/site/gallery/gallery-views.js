// The Gallery's views: the building blocks every view is made of (a page title, a titled card, a data table ...), the foundations, the overview and the samples views. Each view is a
// function of the address's parts that returns the page's DOM or fills the stack it is given; what it needs of the gallery comes in through one ctx, so the views read no module state of their own (#401).
// Built with DOM APIs (#1339): text is a text node, so nothing is escaped or parsed as markup.
import { TEMPLATES_DIR, HAS_SITE } from './paths.js';
import { isScoped } from '../../js/gallery-options.js';
import { BREAKPOINTS, TEXT_PAIRS, LAYOUTS, RESPONSIVE_RULES, PATTERNS, TEMPLATES, ELEMENTS, loadElement } from './gallery.data.js';
import { PHONE_WIDTH } from './frame.js';
import { parseTokenBlocks, tokenKind } from '../../js/theme.js';
import { contrast, grade } from '../../js/colour.js';
import { h } from './mount-support.js';

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
// The blocks of one document (a page title, a titled card, a card that is one link ...). Children are nodes, strings (text) or arrays of them; null and false are left out.
export function blocks(doc) {
    const el = (tag, props, ...kids) => h(doc, tag, props, ...kids.flat(Infinity));
    const code = text => el('code', {}, text);
    const frag = (...kids) => { const f = doc.createDocumentFragment(); f.append(...kids.flat(Infinity).filter(k => k !== null && k !== undefined && k !== false)); return f; };
    const crumbs = (...parts) => el('pk-breadcrumb', { slot: 'breadcrumb', label: 'Breadcrumb' }, parts.map(([label, href]) => (href ? el('a', { href }, label) : el('span', { 'aria-current': 'page' }, label))));
    const heading = (title, lead, crumb = null) => el('pk-page-header', { 'data-gx': 'head', level: '1', heading: title }, crumb, lead ? el('pk-text', { tone: 'muted', slot: 'meta' }, lead) : null);
    const section = (title, ...body) => el('pk-card', { heading: title }, el('pk-stack', { gap: 'sm' }, body));
    const cardLink = (href, title, text, extra = null) => el('pk-card', { 'data-gx': 'tile', href, heading: title }, el('pk-text', { inline: true, tone: 'muted' }, text), extra);
    const grid = (...cards) => el('pk-grid', { 'data-gx': 'tiles', min: '14rem' }, cards);
    const notFound = (title, lead, back) => el('pk-empty-state', { heading: title, ...(lead ? { description: lead } : {}) }, back ? el('a', { slot: 'actions', href: back[1] }, back[0]) : null);
    const nothing = () => el('pk-empty-state', { tone: 'compact', heading: 'Nothing in the gallery matches.' });
    // A data table: the raw table goes inside pk-table (frame, scrolling), each cell labelled so a phone can lay a row out as a card (gallery.css).
    const dataTable = (label, cols, rows, numeric = []) => {
        const columns = cols.map((label, i) => ({ key: `c${i}`, label, ...(numeric.includes(i) ? { align: 'end' } : {}) }));
        const data = rows.map((r, n) => ({ id: n, ...Object.fromEntries(r.map((_, i) => [`c${i}`, ''])) }));
        return el('pk-table', { label, cards: true, columns: JSON.stringify(columns), rows: JSON.stringify(data) }, rows.map((r, n) => r.map((c, i) => el('span', { slot: `cell-${n}-c${i}` }, c))));
    };
    const codeBlock = (text, label = '') => el('pk-code-block', { ...(label ? { label } : {}), wrap: true }, text);
    return { el, code, frag, crumbs, heading, section, cardLink, grid, notFound, nothing, dataTable, codeBlock };
}

function probe(doc, theme) {
    const d = h(doc, 'div', { hidden: true, 'data-theme': theme });
    doc.body.append(d);
    return d;
}

// ---- foundations views ---------------------------------------------------------------------------------------------------

// ctx: B() the gallery's address base ('#' + the host's prefix, per mount), prefix() that prefix, opts() the mount's options, query() the route's query, css() the stylesheets read at mount (tokens, utilities, spacing, icons), scope(id) what the scope and filter leave of a section (scopeGroup(section, group) and keeps(section, group, id) likewise), slot(sample, control, fixed) a lazy sample frame, state the gallery's theme and width.
export function createViews(ctx) {
    const { scope, scopeGroup, keeps, slot, state, query, B } = ctx; // query(): the route's query object, from the router
    const { el, code, frag, crumbs, heading, section, cardLink, grid, notFound, dataTable, codeBlock } = blocks(ctx.doc);
    const specimen = (token, kind) => el('pk-specimen', { token, ...(kind ? { kind } : {}) });
    const cluster = (gap, ...kids) => el('pk-cluster', { gap }, kids);
    const paged = (items, page, render, hashBase) => {
        const pages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
        const p = Math.min(Math.max(1, page), pages);
        return { table: render(items.slice((p - 1) * PAGE_SIZE, p * PAGE_SIZE)), nav: pages > 1 ? el('pk-pagination', { label: 'Pages', page: p, pages, 'data-base': hashBase }) : null };
    };
    const finder = (base, ...fields) => el('pk-form', {}, el('form', { 'data-find': base }, fields));
    const filterField = (f, placeholder) => el('pk-field', { label: 'Filter' }, el('pk-input', { type: 'search', name: 'q', value: f, placeholder }));
    function viewFoundation(id) {
        const tokens = parseTokenBlocks(ctx.css().tokens);
        const val = (node, name) => getComputedStyle(node).getPropertyValue(name).trim();
        // A length wider than the specimen's sample box (8rem) cannot be drawn to scale; it is listed as text rather than as a clamped bar showing a wrong width.
        const sized = (n, v) => parseFloat(v) * (/rem$/.test(v) ? 16 : 1) <= 128 ? specimen(n, 'size') : el('pk-text', { tone: 'muted' }, code(n), ` ${v}`);
        const scale = prefix => Object.entries(tokens.root).filter(([n]) => n.startsWith(prefix));
        const dark = probe(ctx.doc, 'dark'); const light = probe(ctx.doc, 'light');
        try {
            switch (id) {
                case 'colours': {
                    const names = Object.keys(tokens.dark).filter(n => n.startsWith('--color-'));
                    const swatch = (theme, node, n) => el('div', { 'data-theme': theme, 'data-gx': 'swatch-cell' }, el('span', { 'data-gx': 'swatch', 'data-dyn': `background:var(${n})` }), code(val(node, n)));
                    const pair = ([fg, bg]) => { const c = node => { const r = contrast(val(node, fg), val(node, bg)); return r === null ? 'n/a' : `${r.toFixed(2)}:1 ${grade(r)}`; }; return [[code(fg), ' on ', code(bg)], c(dark), c(light)]; };
                    return frag(heading('Colours', 'Read live from the computed CSS variables inside a dark and a light scope; ratios are WCAG contrast calculated in JS.'),
                        section('Palette', dataTable('Colour tokens', ['Token', 'Dark', 'Light'], names.map(n => [code(n), swatch('dark', dark, n), swatch('light', light, n)]))),
                        section('Text pairs', dataTable('Text contrast pairs', ['Pair', 'Dark', 'Light'], TEXT_PAIRS.map(pair), [1, 2])));
                }
                case 'typography':
                    return frag(heading('Typography', 'Font stack, headings, body text and the size scale.'),
                        section('Type', el('pk-text', { tone: 'muted' }, 'Font stack ', code('--font-sans'), ': ', code(val(dark, '--font-sans'))), el('pk-text', { size: 'lg' }, 'Heading 1 (the page title uses h1)'), el('h2', {}, 'Heading 2'), el('h3', {}, 'Heading 3'), el('h4', {}, 'Heading 4'), el('p', {}, 'Body text. The quick brown fox jumps over the lazy dog.'), el('pk-text', { tone: 'muted' }, 'Muted text for secondary notes.'), el('p', {}, el('a', { href: `${B()}/foundations/typography` }, 'A link'), ' and ', code('inline code'), '.')),
                        section('Text scale', el('pk-cluster', { gap: 'md', align: 'baseline' }, scale('--text-').map(([n, v]) => el('span', { 'data-dyn': `font-size:var(${n})` }, 'Aa ', el('pk-text', { inline: true, tone: 'muted', size: 'meta' }, `${n} ${v}`))))));
                case 'spacing': {
                    const roles = Object.entries(tokens.root).filter(([n]) => /^--(gap|pad|flow)-/.test(n));
                    return frag(heading('Spacing', 'One scale, and named roles built on it. Components and utilities read the roles, never a literal, so a density mode moves the whole rhythm.'),
                        section('The scale', scale('--space-').map(([n]) => specimen(n))),
                        section('Roles', dataTable('Spacing roles', ['Role', 'Value'], roles.map(([n, v]) => [code(n), code(v)])), el('pk-text', { tone: 'muted' }, 'Compact density overrides these on any element with ', code('data-density="compact"'), '. See the ', el('a', { href: '../spacing/index.html' }, 'spacing page'), ' for the rhythm in use.')));
                }
                case 'radii-shadows':
                    return frag(heading('Radii and shadows', 'Corner radii, shadows, layers and touch targets.'),
                        section('Radii', cluster('md', scale('--radius-').map(([n]) => specimen(n)))),
                        section('Shadows', cluster('md', [...scale('--shadow-'), ...Object.entries(tokens.dark).filter(([n]) => /shadow/.test(n) && !n.startsWith('--shadow-'))].slice(0, 8).map(([n]) => specimen(n, 'shadow')))),
                        section('Layers and targets', cluster('md', [...scale('--z-'), ...scale('--touch'), ...scale('--app-'), ...scale('--shell-')].map(([n, v]) => n.startsWith('--z-') || n.startsWith('--touch') ? specimen(n) : sized(n, v)))));
                case 'breakpoints':
                    return frag(heading('Breakpoints', 'Media queries cannot read a variable, so the three steps are literals. Use the Phone width switch to see 640px apply in every sample.'),
                        section('Steps', dataTable('Breakpoints', ['Name', 'max-width', 'What changes'], BREAKPOINTS.map(b => [b.name, code(`${b.px}px`), b.meaning]), [1])));
                case 'utilities': {
                    const all = [...ctx.css().utilities.matchAll(/\.(u-[\w-]+)\s*\{([^}]*)\}/g)].map(m => ({ name: m[1], decl: m[2].trim().replace(/\s*!important/g, '') })).concat([...ctx.css().spacing.matchAll(/^\.([a-z]+-[\w]+) \{ ([^}]*)\}/gm)].map(m => ({ name: m[1], decl: m[2].trim() })));
                    const q = query(); const f = (q.q ?? '').toLowerCase();
                    const list = all.filter(u => u.name.includes(f));
                    const pg = paged(list, Number(q.p) || 1, rows => dataTable('Utility classes', ['Class', 'Declaration', 'Effect'], rows.map(u => [code(u.name), code(u.decl), el('div', { 'data-gx': 'effect' }, el('span', { class: u.name }, 'Sample'))])), `${B()}/foundations/utilities${f ? `?q=${encodeURIComponent(f)}` : ''}`);
                    return frag(heading('Utilities', `${all.length} utility classes (u-*, and spacing p-* m-* gap-* mapped to tokens), ${list.length} shown.`),
                        section('Find a class', finder(`${B()}/foundations/utilities`, filterField(f, 'e.g. mt, text, gap')), pg.table, pg.nav));
                }
                case 'icons': {
                    const ids = [...ctx.css().icons.matchAll(/<symbol id="([^"]+)"/g)].map(m => m[1]);
                    return frag(heading('Icons', 'The sprite sdk/icons.svg. Icon-only controls must carry an aria-label.'),
                        section(`${ids.length} icons`, el('pk-grid', { min: '7rem', gap: 'sm' }, ids.map(i => el('pk-stack', { align: 'center', gap: 'xs' }, el('pk-icon', { name: i, size: 'lg' }), code(i))))));
                }
                default: {
                    const q = query(); const f = (q.q ?? '').toLowerCase(); const kind = q.kind ?? 'all';
                    const all = [...new Set([...Object.keys(tokens.dark), ...Object.keys(tokens.light), ...Object.keys(tokens.root)])].sort();
                    const shared = n => tokens.dark[n] ?? tokens.root[n] ?? '';
                    const list = all.filter(n => n.includes(f) && (kind === 'all' || tokenKind(n, shared(n)) === kind));
                    const params = new URLSearchParams({ ...(f ? { q: f } : {}), ...(kind !== 'all' ? { kind } : {}) }).toString();
                    const pg = paged(list, Number(q.p) || 1, rows => dataTable('Design tokens', ['Token', 'Kind', 'Dark / shared', 'Light'], rows.map(n => [code(n), tokenKind(n, shared(n)), code(shared(n)), code(tokens.light[n] ?? '')])), `${B()}/foundations/tokens${params ? `?${params}` : ''}`);
                    const kinds = ['all', 'colour', 'font', 'size', 'shadow', 'layer', 'other'];
                    return frag(heading('Every token', `${list.length} of ${all.length} custom properties declared in tokens.css. Edit them in the theme editor.`),
                        section('Find a token', finder(`${B()}/foundations/tokens`, el('pk-cluster', { align: 'end' }, filterField(f, 'e.g. accent, radius'), el('pk-field', { label: 'Kind' }, el('pk-select', { name: 'kind', value: kind }, kinds.map(k => el('option', {}, k)))))), pg.table, pg.nav));
                }
            }
        } finally { dark.remove(); light.remove(); }
    }


    // ---- views ---------------------------------------------------------------------------------------------------------------
    function overview() {
        const narrowed = isScoped(ctx.opts()) || Boolean(ctx.opts().filter);
        const site = ctx.prefix() ? '' : '../../app.html';
        const cards = [
            [`${B()}/foundations`, 'Foundations', 'Colours, type, spacing, radii, breakpoints, utilities, icons and every token.'],
            [`${B()}/elements`, 'Elements', `${ELEMENTS.length} custom elements generated from their API data, each with a live playground.`],
            [`${B()}/samples`, 'Samples', `${TEMPLATE_PAGES.length} page templates, ${PATTERNS.length} patterns and ${LAYOUTS.length + 2} layouts, all built only from the SDK.`],
            ...(HAS_SITE && !narrowed ? [
                [`${site}#/theme`, 'Theme editor', 'Edit every token live and export the override block.'],
                [`${site}#/scorecard`, 'Scorecard', 'Performance, look and accessibility scores, the size sweep and security findings.'],
                [`${site}#/files`, 'Files', 'Browse the SDK source in the code explorer.'],
            ] : []),
        ];
        return frag(heading('Plainkit', 'Plain HTML, CSS and JS: no framework, no build step to use it, no runtime dependencies.'),
            grid(cards.filter(([href]) => !href.startsWith(B() + '/') || !narrowed || scope(href.slice(B().length + 1))).map(([href, t, d]) => cardLink(href, t, d))),
            section('Quick start', codeBlock('<link rel="stylesheet" href="plainkit/dist/plainkit.min.css">\n<script type="module">import { initPlainkit } from \'./plainkit/dist/js/init.js\'; initPlainkit();</script>', 'HTML'), el('pk-text', { tone: 'muted' }, 'Set ', code('data-theme'), ' to dark or light and ', code('data-density="compact"'), ' on any element.')));
    }

    const pairCard = (facts, ...more) => el('pk-card', {}, el('pk-stack', { gap: 'sm' }, facts.map(([label, text]) => el('pk-text', { tone: 'muted' }, el('strong', {}, label), ' ', text)), el('pk-grid', { ratio: '2:1', 'data-pair': true }, el('pk-stack', {}, el('pk-heading', { level: '3' }, 'Desktop')), el('pk-stack', {}, el('pk-heading', { level: '3' }, 'Phone (375px frame)'))), more));

    function samplesView(out, put, a, b) {
        const groups = KIND_LABEL;
        const samples = ['Samples', `${B()}/samples`];
        if (!a) return put(frag(heading('Samples', 'Everything here is built only from the SDK: templates (page structures), patterns (composed behaviours) and layouts.'), grid(Object.entries(groups).filter(([id]) => scopeGroup('samples', id)).map(([id, t]) => cardLink(`${B()}/samples/${id}`, t, new Map([['templates', `${TEMPLATE_PAGES.length} full-page templates with a slot contract.`], ['patterns', `${PATTERNS.length} realistic composed examples.`], ['layouts', 'Page anatomies at desktop and phone width.']]).get(id))))));
        const groupCrumb = (id, name) => crumbs(samples, [groups[id], `${B()}/samples/${id}`], [name]);
        const back = id => el('a', { href: `${B()}/samples/${id}` }, `Back to ${id}`);
        const pair = (title, item, key, script) => { const [d, ph] = out.querySelectorAll('[data-pair] > pk-stack'); d.append(slot({ title: `${title} desktop`, html: item.html, ...script }, key, 'desktop')); ph.append(slot({ title: `${title} phone`, html: item.html, ...script }, key, 'phone')); return out; };
        if (a === 'templates') {
            if (!b) return put(frag(heading('Templates', 'Full-page templates, each a runnable example with a slot contract: preview one in the side-nav or top-nav variant, light or dark.', crumbs(samples, ['Templates'])), grid(TEMPLATE_PAGES.filter(([id]) => keeps('samples', 'templates', id)).map(([id, tt, , d]) => cardLink(`${B()}/samples/templates/${id}`, tt, d)))));
            const tp = TEMPLATE_PAGES.find(x => x[0] === b);
            if (!tp) return put(notFound('Not found', '', ['Back to templates', `${B()}/samples/templates`]));
            const q = query(); const nav = q.nav === 'top' ? 'top' : 'side'; const th = q.theme ?? state.theme;
            const link = (k, v, l) => { const p = new URLSearchParams({ nav, theme: th, [k]: v }); return el('pk-button', { variant: 'ghost', size: 'mini', toggle: true, pressed: (k === 'nav' ? nav : th) === v, 'data-goto': `${B()}/samples/templates/${b}?${p}` }, l); };
            const page = `${TEMPLATES_DIR}${tp[2]}?nav=${nav}&theme=${th}`;
            put(frag(heading(tp[1], tp[3], groupCrumb('templates', tp[1])),
                cluster('sm', back('templates'), el('pk-button-group', { label: 'Navigation variant', mode: 'single' }, link('nav', 'side', 'Side nav'), link('nav', 'top', 'Top nav')), el('pk-button-group', { label: 'Theme', mode: 'single' }, link('theme', 'dark', 'Dark'), link('theme', 'light', 'Light')), el('a', { href: page, target: '_blank', rel: 'noopener' }, 'Open full page')),
                el('pk-text', { tone: 'muted' }, el('strong', {}, 'Slots:'), ' ', tp[4]),
                el('iframe', { 'data-gx': 'frame stage', title: `${tp[1]} template`, src: page, 'data-dyn': `width:${state.width === 'phone' ? PHONE_WIDTH + 'px' : '100%'}` })));
            return out;
        }
        if (a === 'patterns') {
            if (!b) return put(frag(heading('Patterns', 'Composed examples: several elements working together to do one job.', crumbs(samples, ['Patterns'])), grid(PATTERNS.filter(p => keeps('samples', 'patterns', p.id)).map(p => cardLink(`${B()}/samples/patterns/${p.id}`, p.title, p.summary)))));
            const p = PATTERNS.find(x => x.id === b);
            if (!p) return put(notFound('Not found', '', ['Back to patterns', `${B()}/samples/patterns`]));
            const used = p.used.map(u => { const m = ELEMENTS.find(x => x.tag === `pk-${u}`); return m ? el('a', { href: `${B()}/elements/${m.tag}` }, m.title) : u; });
            put(frag(heading(p.title, p.summary, groupCrumb('patterns', p.title)), pairCard([['Built from:', p.built], ['Mobile:', p.mobile], ['Elements used:', used.flatMap((u, i) => (i ? [', ', u] : [u]))]], el('p', {}, back('patterns')))));
            // A pattern that ships a script runs it in each frame, on that frame's own markup (frame-boot.js).
            return pair(p.title, p, `pattern-${p.id}`, { pattern: p.script });
        }
        if (a === 'layouts') {
            if (!b) return put(frag(heading('Layouts', 'How the elements compose into pages.', crumbs(samples, ['Layouts'])), grid(LAYOUT_ITEMS().filter(([id]) => keeps('samples', 'layouts', id)).map(([id, t]) => cardLink(`${B()}/samples/layouts/${id}`, t, '')))));
            if (b === 'responsive') return put(frag(heading('Responsive rules', '', groupCrumb('layouts', 'Responsive rules')), section('Width steps', dataTable('Responsive width steps', ['Width', 'What changes'], RESPONSIVE_RULES.map(r => [r.width, r.change])), el('pk-text', { tone: 'muted' }, 'Design mobile-first: write the phone layout, then add the multi-column layout above it.'))));
            if (b === 'shell') { const box = el('pk-grid', { min: '20rem' }); put(frag(heading('App shell', 'A sidebar, a main column with the top bar, the page body and a footer strip. The header and footer strips share one height token each.', groupCrumb('layouts', 'App shell')), el('pk-card', {}, box))); loadElement('pk-app-shell').then(m => { if (box.isConnected) box.append(slot({ title: 'App shell', html: m.examples[0].html }, 'app-shell')); }); return out; }
            const l = LAYOUTS.find(x => x.id === b);
            if (!l) return put(notFound('Not found', '', ['Back to layouts', `${B()}/samples/layouts`]));
            put(frag(heading(l.title, l.summary, groupCrumb('layouts', l.title)), pairCard([['Built from:', l.built], ['Mobile:', l.mobile]])));
            return pair(l.title, l, `layout-${l.id}`);
        }
        return put(notFound('Not found', '', ['Back to samples', `${B()}/samples`]));
    }
    return { viewFoundation, overview, samplesView };
}
