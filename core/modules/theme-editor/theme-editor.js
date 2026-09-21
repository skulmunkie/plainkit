// The theme editor as a module: mountThemeEditor(container, options) lists every token the SDK's token stylesheet declares with an input
// for each, applies edits live, grades the text pairs for contrast, and exports or imports the override block (the format the
// server-side PkThemeOverrides helper takes: same names, same rules).
//
//   const editor = await mountThemeEditor(el, { storageKey: 'my-theme', onchange: ({ css }) => save(css) });   // edits the whole page
//   const scoped = await mountThemeEditor(el, { target: previewElement });                                    // edits only that subtree
//   editor.export(); editor.overrides(); editor.setTheme('light'); editor.reset(); editor.destroy();
//
// Options: target (a Document, the default: one adopted stylesheet of override CSS; or an Element: the current theme's overrides as
// inline custom properties, so only that subtree changes), theme ('dark' | 'light', initial), onchange({ css, overrides }), tokens (URL
// of the stylesheet whose token blocks are edited; default the SDK's own), pairs ([foreground, background] token names to grade;
// default DEFAULT_PAIRS), storageKey (localStorage key that keeps the overrides; default none), height (a CSS length: the token list
// scrolls inside it), preview (show a Preview tab with sample controls in a frame; default true).
// Returns { export(), overrides(), setTheme(name), reset(), destroy() }. The pure logic is js/theme-editor-logic.js and js/theme.js.
// Built only from SDK components (pk-tabs, pk-input, pk-select, pk-colour-input, pk-textarea, pk-button, pk-cluster, pk-alert, pk-badge, pk-stat, pk-table).

import { sanitizeOverrides, parseTokenBlocks, currentTheme, setTheme as setThemeAttr, buildOverrides, parseOverrides, nameProblem, valueProblem, colourToHex, tokenKind } from '../../js/theme.js';
import { KINDS, DEFAULT_PAIRS, emptyOverrides, allTokenNames, baseValue, isChanged, effectiveValue, visibleTokens, withEdit, withoutToken, overrideCount, evaluatePairs, inlineEntries } from '../../js/theme-editor-logic.js';
import { ensureStyles, styleUrls } from '../../js/mount-support.js';
import { loadElements } from '../../js/loader.js';

const STYLES = ['../../plainkit.css'];
const OWN_STYLES = ['./theme-editor.css'];
const TOKENS = '../../tokens/tokens.css';
const MAX_STORED = 100000;

export { DEFAULT_PAIRS };

// What the Preview tab shows: SDK elements that read tokens only.
const PREVIEW = `
<pk-toolbar heading="Preview" note="every control reads tokens only"><pk-button slot="actions" size="mini" variant="ghost">Ghost</pk-button><pk-button slot="actions" size="mini">Primary</pk-button></pk-toolbar>
<pk-card heading="Card title"><span slot="actions" class="muted">muted text</span><p>Body text with <a href="#">a link</a> and <code>code</code>.</p>
<pk-input label="Field" value="Input value"></pk-input>
<pk-cluster class="u-mt-3"><pk-badge variant="muted">Default</pk-badge><pk-badge variant="ok">Registered</pk-badge><pk-badge variant="warn">Warn</pk-badge><pk-badge variant="danger">Danger</pk-badge></pk-cluster></pk-card>
<pk-alert kind="warning">A warning notice.</pk-alert><pk-alert kind="success">A success notice.</pk-alert>
<pk-table density="compact"><table><thead><tr><th>SKU</th><th class="num">Price</th></tr></thead><tbody><tr><td><code>AC-001</code></td><td class="num">$4.99</td></tr></tbody></table></pk-table>`;

function h(doc, tag, props = {}, ...children) {
    const el = doc.createElement(tag);
    for (const [k, v] of Object.entries(props)) if (v !== undefined && v !== null && v !== false) el.setAttribute(k, v === true ? '' : v);
    el.append(...children.filter(c => c !== null && c !== undefined));
    return el;
}

const cap = s => s[0].toUpperCase() + s.slice(1);

function readStored(key, win) {
    if (!key) return emptyOverrides();
    try {
        const raw = win.localStorage.getItem(key) ?? '{}';
        return raw.length > MAX_STORED ? emptyOverrides() : sanitizeOverrides(JSON.parse(raw));
    } catch { return emptyOverrides(); }
}

export async function mountThemeEditor(container, options = {}) {
    const doc = container.ownerDocument;
    const win = doc.defaultView;
    const target = options.target ?? doc;
    const isDoc = target.nodeType === 9;
    const targetDoc = isDoc ? target : target.ownerDocument;
    const pairs = options.pairs ?? DEFAULT_PAIRS;
    const { onchange, storageKey, height } = options;
    const showPreview = options.preview !== false;
    await ensureStyles([...styleUrls(STYLES, import.meta.url), ...styleUrls(OWN_STYLES, import.meta.url)], doc);

    const tokensUrl = new URL(options.tokens ?? TOKENS, import.meta.url).href;
    const res = await fetch(tokensUrl);
    if (!res.ok) throw new Error(`${tokensUrl}: ${res.status}`);
    const tokens = parseTokenBlocks(await res.text());

    const state = { overrides: readStored(storageKey, win), scope: 'theme', kind: 'all', filter: '' };
    const themeHost = isDoc ? target.documentElement : target;
    const styleRoot = isDoc ? target.documentElement : target;
    if (options.theme) setThemeAttr(themeHost, options.theme);
    const theme = () => currentTheme(isDoc ? target.documentElement : (themeHost.closest('[data-theme]') ?? targetDoc.documentElement));

    // ---- output: one adopted stylesheet on a Document target; inline custom properties on an Element target
    const sheet = isDoc ? new targetDoc.defaultView.CSSStyleSheet() : null;
    if (sheet) targetDoc.adoptedStyleSheets = [...targetDoc.adoptedStyleSheets, sheet];
    let setInline = new Set();
    let previewFrame = null;
    let previewSheet = null;

    function applyToTarget(css) {
        if (sheet) { sheet.replaceSync(css); return; }
        const next = inlineEntries(state.overrides, theme());
        for (const n of setInline) if (!(n in next)) themeHost.style.removeProperty(n);
        for (const [n, v] of Object.entries(next)) themeHost.style.setProperty(n, v);
        setInline = new Set(Object.keys(next));
    }

    function applyToPreview(css) {
        const fdoc = previewFrame?.contentDocument;
        if (!fdoc?.head) return;
        if (!previewSheet || previewSheet.doc !== fdoc) { previewSheet = new fdoc.defaultView.CSSStyleSheet(); previewSheet.doc = fdoc; fdoc.adoptedStyleSheets = [...fdoc.adoptedStyleSheets, previewSheet]; }
        previewSheet.replaceSync(css);
        fdoc.documentElement.setAttribute('data-theme', theme());
    }

    // ---- interface
    const ui = {};
    const kindSelect = h(doc, 'pk-select', { label: 'Kind', value: 'all' }, ...KINDS.map(k => h(doc, 'option', { value: k }, cap(k))));
    const themeSelect = h(doc, 'pk-select', { label: 'Theme', value: theme() }, h(doc, 'option', { value: 'dark' }, 'Dark'), h(doc, 'option', { value: 'light' }, 'Light'));
    const scopeSelect = h(doc, 'pk-select', { label: 'Edits apply to', value: 'theme' }, h(doc, 'option', { value: 'theme' }, 'The current theme'), h(doc, 'option', { value: 'both' }, 'Both themes'));
    const find = h(doc, 'pk-input', { type: 'search', label: 'Find token', placeholder: 'e.g. accent, radius', clearable: true });
    const resetAll = h(doc, 'pk-button', { variant: 'warn', size: 'mini' }, 'Reset all');
    const shown = h(doc, 'span', { class: 'muted', role: 'status' });
    const count = h(doc, 'pk-stat', { label: 'Overrides', value: '0', tile: true });
    const warn = h(doc, 'pk-alert', { kind: 'warning' });
    warn.hidden = true;
    const list = h(doc, 'div', { class: 'te-list' });
    const pairTable = h(doc, 'pk-table', {
        label: 'Contrast', density: 'compact',
        columns: JSON.stringify([{ key: 'pair', label: 'Text on background' }, { key: 'ratio', label: 'Ratio', align: 'end' }, { key: 'grade', label: 'WCAG' }]),
    });
    const cssBox = h(doc, 'pk-textarea', { label: 'CSS block', rows: 10, readonly: true });
    const jsonBox = h(doc, 'pk-textarea', { label: 'JSON overrides', rows: 10 });
    const importBtn = h(doc, 'pk-button', { variant: 'primary' }, 'Import JSON or CSS');
    const copyBtn = h(doc, 'pk-button', { variant: 'ghost' }, 'Copy CSS');
    const downloadBtn = h(doc, 'pk-button', { variant: 'ghost' }, 'Download JSON');
    const rejectedBox = h(doc, 'div');
    const message = h(doc, 'div');

    const tabs = h(doc, 'pk-tabs', { value: 'tokens', label: 'Theme editor' },
        h(doc, 'pk-tab', { value: 'tokens' }, 'Tokens'), h(doc, 'pk-tab-panel', { value: 'tokens' }, list),
        h(doc, 'pk-tab', { value: 'contrast' }, 'Contrast'), h(doc, 'pk-tab-panel', { value: 'contrast' }, warn, pairTable),
        ...(showPreview ? [h(doc, 'pk-tab', { value: 'preview' }, 'Preview'), h(doc, 'pk-tab-panel', { value: 'preview' }, (ui.previewHost = h(doc, 'div', { class: 'te-preview-host' })))] : []),
        h(doc, 'pk-tab', { value: 'export' }, 'Export / import'),
        h(doc, 'pk-tab-panel', { value: 'export' },
            h(doc, 'p', { class: 'muted' }, 'Names are lowercase custom properties; values use only letters, digits and # % . , ( ) - + / and spaces, at most 200 characters.'),
            rejectedBox, h(doc, 'p', { class: 'te-caption' }, 'CSS block (paste into a style element after the SDK stylesheets)'), cssBox, h(doc, 'p', { class: 'te-caption' }, 'JSON { shared, dark, light } of token to value: the C# helper input (editable, then Import)'), jsonBox, h(doc, 'pk-cluster', { class: 'u-mt-3' }, importBtn, copyBtn, downloadBtn), message));

    const root = h(doc, 'section', { class: 'te', 'aria-label': 'Theme editor' },
        h(doc, 'div', { class: 'te-toolbar' }, find, kindSelect, themeSelect, scopeSelect),
        h(doc, 'pk-cluster', { justify: 'between' }, count, shown, resetAll),
        tabs);
    if (height) { root.classList.add('te--fixed'); root.style.height = height; }
    container.replaceChildren(root);
    loadElements(root).catch(() => {});

    if (showPreview) {
        previewFrame = h(doc, 'iframe', { class: 'te-preview', title: 'Theme preview' });
        const links = [...styleUrls(STYLES, import.meta.url), ...styleUrls(OWN_STYLES, import.meta.url)].map(u => `<link rel="stylesheet" href="${encodeURI(u)}">`).join('');
        previewFrame.srcdoc = `<!doctype html><html lang="en" data-theme="${theme()}" data-te-preview><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${links}</head><body class="te-preview-body">${PREVIEW}<script type="module" src="${encodeURI(import.meta.url)}"></script></body></html>`;
        previewFrame.addEventListener('load', () => applyToPreview(buildOverrides(state.overrides).css));
        ui.previewHost.append(previewFrame);
    }

    // ---- painting
    const rowsByName = new Map();
    const chipFor = (fg, bg) => {
        const [r] = evaluatePairs([[fg, bg]], readComputed);
        return r;
    };
    function readComputed(name) { return win.getComputedStyle(styleRoot).getPropertyValue(name).trim(); }

    function paintRow(name) {
        const row = rowsByName.get(name);
        if (!row) return;
        const changed = isChanged(state.overrides, theme(), name);
        row.classList.toggle('te-changed', changed);
        const reset = row.querySelector('pk-button');
        if (changed) reset.removeAttribute('disabled'); else reset.setAttribute('disabled', '');
        const chip = row.querySelector('[data-pair]');
        if (chip) {
            const r = chipFor(name, '--color-panel');
            chip.textContent = r.ratio === null ? '' : `${r.ratio.toFixed(1)}:1`;
            chip.setAttribute('variant', r.bad ? 'danger' : 'ok');
        }
    }

    function makeRow(name) {
        const value = effectiveValue(state.overrides, tokens, theme(), name);
        const hex = tokenKind(name, value) === 'colour' ? colourToHex(value) : null;
        const control = hex
            ? h(doc, 'pk-colour-input', { label: name, value: hex })
            : h(doc, 'pk-input', { label: name, value });
        const reset = h(doc, 'pk-button', { variant: 'ghost', size: 'mini', label: `Reset ${name}` }, 'Reset');
        const chip = /^--color-(text|muted|link|accent)$/.test(name) ? h(doc, 'pk-badge', { 'data-pair': name }) : null;
        const row = h(doc, 'div', { class: 'te-row', 'data-token': name }, h(doc, 'code', { class: 'te-name' }, name), control, ...(chip ? [chip] : []), reset);
        rowsByName.set(name, row);
        return row;
    }

    function paintList() {
        rowsByName.clear();
        const names = visibleTokens(tokens, theme(), state);
        list.replaceChildren(...names.map(makeRow));
        if (!names.length) list.append(h(doc, 'p', { class: 'muted' }, 'No tokens match.'));
        for (const n of names) paintRow(n);
        shown.textContent = `${names.length} of ${allTokenNames(tokens).length} tokens`;
        if (themeSelect.value !== theme()) themeSelect.value = theme();
    }

    function paintPairs() {
        const results = evaluatePairs(pairs, readComputed);
        pairTable.setAttribute('rows', JSON.stringify(results.map((r, id) => ({ id, pair: `${r.fg} on ${r.bg}`, ratio: r.ratio === null ? 'n/a' : `${r.ratio.toFixed(2)}:1`, grade: r.grade }))));
        const bad = results.filter(r => r.bad).length;
        warn.hidden = bad === 0;
        warn.textContent = `${bad} text pair${bad === 1 ? '' : 's'} below 4.5:1 in the ${theme()} theme.`;
        for (const n of rowsByName.keys()) paintRow(n);
    }

    function paintExport(css, rejected) {
        cssBox.value = css;
        jsonBox.value = JSON.stringify(state.overrides, null, 2);
        const n = overrideCount(state.overrides);
        count.setAttribute('value', String(n));
        rejectedBox.replaceChildren(...(rejected.length ? [h(doc, 'pk-alert', { kind: 'warning' }, ...rejected.flatMap((r, i) => (i ? [h(doc, 'br'), r] : [r])))] : []));
    }

    function apply() {
        const { css, rejected } = buildOverrides(state.overrides);
        applyToTarget(css);
        applyToPreview(css);
        if (storageKey) try { win.localStorage.setItem(storageKey, JSON.stringify(state.overrides)); } catch { /* storage blocked: the edit still applies */ }
        paintPairs();
        paintExport(css, rejected);
        onchange?.({ css, overrides: api.overrides() });
    }

    function edit(name, value) {
        state.overrides = withEdit(state.overrides, { theme: theme(), scope: state.scope, name, value, base: baseValue(tokens, theme(), name) });
        apply();
    }

    function note(kind, text) {
        message.replaceChildren(h(doc, 'pk-alert', { kind: kind === 'error' ? 'danger' : kind }, text));
    }

    function importText(text) {
        const parsed = parseOverrides(text);
        if (!parsed) { note('error', 'Not JSON and not an override CSS block.'); return; }
        state.overrides = { shared: parsed.shared, dark: parsed.dark, light: parsed.light };
        note('success', 'Imported.');
        apply(); paintList(); paintPairs();
    }

    // ---- events
    const listeners = [];
    const on = (el, type, fn) => { el.addEventListener(type, fn); listeners.push(() => el.removeEventListener(type, fn)); };
    const tokenOf = e => e.target.closest?.('[data-token]')?.dataset.token;

    on(find, 'input', e => { state.filter = e.target.value ?? ''; paintList(); });
    on(kindSelect, 'change', e => { state.kind = e.target.value; paintList(); });
    on(scopeSelect, 'change', e => { state.scope = e.target.value; });
    on(themeSelect, 'change', e => { if (e.target.value !== theme()) api.setTheme(e.target.value); });
    on(resetAll, 'click', () => api.reset());
    on(list, 'pk-colour', e => { const n = tokenOf(e); if (n) edit(n, e.detail.value); });
    on(list, 'input', e => {
        if (e.target.localName !== 'pk-input') return;
        const n = tokenOf(e);
        if (!n) return;
        const v = String(e.target.value ?? '').trim();
        const problem = v === '' ? null : nameProblem(n) ?? valueProblem(v);
        if (problem) { e.target.setAttribute('invalid', ''); e.target.setAttribute('title', problem); return; }
        e.target.removeAttribute('invalid'); e.target.removeAttribute('title');
        edit(n, v);
    });
    on(list, 'click', e => {
        const b = e.target.closest?.('pk-button');
        const n = tokenOf(e);
        if (!b || !n || b.hasAttribute('disabled')) return;
        state.overrides = withoutToken(state.overrides, n);
        apply();
        const fresh = makeRow(n);
        const old = list.querySelector(`[data-token="${CSS.escape(n)}"]`);
        old.replaceWith(fresh);
        paintRow(n);
    });
    on(importBtn, 'click', () => importText(jsonBox.value));
    on(copyBtn, 'click', () => win.navigator.clipboard?.writeText(cssBox.value));
    on(downloadBtn, 'click', () => {
        const a = doc.createElement('a');
        a.href = win.URL.createObjectURL(new win.Blob([jsonBox.value], { type: 'application/json' }));
        a.download = 'pk-theme-overrides.json';
        a.click();
        win.URL.revokeObjectURL(a.href);
    });

    // The theme can change from outside (the page's own toggle): follow it.
    const observer = new win.MutationObserver(() => { apply(); paintList(); });
    observer.observe(targetDoc.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    if (!isDoc) observer.observe(themeHost, { attributes: true, attributeFilter: ['data-theme'] });

    const api = {
        export: () => buildOverrides(state.overrides).css,
        overrides: () => ({ shared: { ...state.overrides.shared }, dark: { ...state.overrides.dark }, light: { ...state.overrides.light } }),
        setTheme(name) { setThemeAttr(isDoc ? target.documentElement : themeHost, name); apply(); paintList(); },
        reset() { state.overrides = emptyOverrides(); apply(); paintList(); },
        destroy() {
            observer.disconnect();
            for (const off of listeners) off();
            if (sheet) targetDoc.adoptedStyleSheets = targetDoc.adoptedStyleSheets.filter(s => s !== sheet);
            else for (const n of setInline) themeHost.style.removeProperty(n);
            root.remove();
        },
    };
    apply(); paintList();
    return api;
}

// The Preview frame loads this same module as its script: inside it, the only job is to define the pk-* elements the frame shows.
if (globalThis.document?.documentElement?.hasAttribute('data-te-preview')) loadElements(document).catch(() => {});
