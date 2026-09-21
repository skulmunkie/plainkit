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
// of the stylesheet whose token blocks are edited; default the SDK's own), pairs ([foreground, background] token names to audit;
// default AA_PAIRS), storageKey (localStorage key that keeps the overrides; default none), height (a CSS length: the token list
// scrolls inside it), preview (show a Preview tab with sample controls in a frame; default true).
// Palette tab: a brand colour (and optionally a neutral tint and a warn colour) generates the accent, fill, hover, link and the surface and text ramps of
// both themes with every pair in AA_PAIRS at 4.5:1 or better (js/brand-palette-logic.js); the swatches show each pair with its ratio, and Apply writes them
// as ordinary edits. Presets tab: the built-in presets (default, high contrast, compact and roomy density; js/theme-presets-logic.js) replace the edits, and the
// user's saved themes (by name; apply, rename, delete) live in localStorage under the savedKey option ('pk-theme-editor-saved'; false keeps none), best effort:
// a blocked storage is logged and the themes last until the page closes.
// Undo and redo (buttons, Ctrl/Cmd+Z, Shift+Z or Y outside a text field; typing in one field is one step) walk every change; the Changes tab lists each edit against the
// stylesheet value (js/theme-history-logic.js), '3 changes', with a reset for each edit and for each group of tokens.
// Contrast tab (the live audit): every pair in `pairs` in both themes under the current edits, as sample text with its ratio, worst first, and a jump to the token that sets each
// side (js/theme-editor-logic.js auditPairs); the tab title counts the pairs below 4.5:1.
// Options for an app: initial (the theme to start from, as JSON { shared, dark, light }, an override CSS block or an object; used when nothing was kept for the
// viewer) and presets ([{ name, description?, theme }], theme being the same kinds of value; listed after the built-in presets and applied by name).
// Export / import tab: the CSS block, a copy-paste snippet (theme.css), the JSON, and a link to the theme (js/theme-share-logic.js): the edits in the fragment as
// '#pk-theme=z.<compressed>' (plain when the browser has no CompressionStream), at most 4096 characters, validated on the way in like pasted JSON, text only.
// Option readHash: true applies the theme in the page's own #pk-theme= fragment at mount, as edits (Undo takes it back).
// Returns { export(), overrides(), setTheme(name), reset(), undo(), redo(), share(), importShare(text), applyBrand(colour, { neutral, warn }), presets(), saved(), applyPreset(idOrSavedName), destroy() }.
// The pure logic is js/theme-editor-logic.js and js/theme.js.
// Built only from SDK components (pk-tabs, pk-input, pk-select, pk-colour-input, pk-unit-input, pk-textarea, pk-button, pk-cluster, pk-alert, pk-badge, pk-stat, pk-table).

import { sanitizeOverrides, parseTokenBlocks, currentTheme, setTheme as setThemeAttr, buildOverrides, nameProblem, valueProblem, colourToHex, tokenKind } from '../../js/theme.js';
import { KINDS, DEFAULT_PAIRS, emptyOverrides, allTokenNames, baseValue, isChanged, effectiveValue, visibleTokens, isLengthToken, LENGTH_UNITS, withEdit, withoutToken, overrideCount, evaluatePairs, inlineEntries, readImport, guardLeaks, AA_PAIRS, auditPairs, auditSummary } from '../../js/theme-editor-logic.js';
import { generatePalette, applyPalette, paletteRows, normalizeColour } from '../../js/brand-palette-logic.js';
import { PRESETS, readCustomPresets, readOverridesInput, readSaved, serializeSaved, saveTheme, renameTheme, deleteTheme } from '../../js/theme-presets-logic.js';
import { createHistory, record, undo, redo, canUndo, canRedo, diffOverrides, changeSummary, changedTokens, withoutGroup, withoutEntry } from '../../js/theme-history-logic.js';
import { buildSnippet, encodeShare, decodeShare, SHARE_KEY } from '../../js/theme-share-logic.js';
import { ensureStyles, styleUrls } from '../../js/mount-support.js';
import { loadElements } from '../../js/loader.js';
import { createLogger } from '../../js/log.js';
const log = createLogger('theme-editor');

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
    } catch (error) { log.warn(`the saved theme edits under "${key}" could not be read: starting with none`, error); return emptyOverrides(); }
}

export async function mountThemeEditor(container, options = {}) {
    log.debug('mounted', { module: 'theme-editor', options: Object.keys(options) });
    const doc = container.ownerDocument;
    const win = doc.defaultView;
    const target = options.target ?? doc;
    const isDoc = target.nodeType === 9;
    const targetDoc = isDoc ? target : target.ownerDocument;
    const pairs = options.pairs ?? AA_PAIRS;
    const { onchange, storageKey, height } = options;
    const savedKey = options.savedKey === false ? null : options.savedKey ?? 'pk-theme-editor-saved';
    const showPreview = options.preview !== false;
    await ensureStyles([...styleUrls(STYLES, import.meta.url), ...styleUrls(OWN_STYLES, import.meta.url)], doc);

    const tokensUrl = new URL(options.tokens ?? TOKENS, import.meta.url).href;
    const res = await fetch(tokensUrl);
    if (!res.ok) throw new Error(`${tokensUrl}: ${res.status}`);
    const tokens = parseTokenBlocks(await res.text());

    // Saved themes are a per-viewer convenience: read and written best effort. When storage is blocked they still work until the page closes.
    let savedBlocked = false;
    function readSavedThemes() {
        if (!savedKey) return [];
        try {
            const raw = win.localStorage.getItem(savedKey);
            return raw && raw.length <= MAX_STORED ? readSaved(raw) : [];
        } catch (error) { savedBlocked = true; log.warn(`saved themes could not be read from "${savedKey}" (storage is blocked): starting with none`, error); return []; }
    }
    function writeSavedThemes(list) {
        if (!savedKey) return;
        try { win.localStorage.setItem(savedKey, serializeSaved(list)); savedBlocked = false; } catch (error) { savedBlocked = true; log.warn(`saved themes could not be stored under "${savedKey}" (storage is blocked): they last until this page closes`, error); }
    }

    // Presets the app supplies, after the built-in ones; a bad one is left out and logged.
    const custom = readCustomPresets(options.presets);
    for (const problem of custom.problems) log.warn(`preset: ${problem}`);
    const presetList = [...PRESETS, ...custom.presets];
    const presetById = id => presetList.find(p => p.id === id) ?? null;
    const presetOverrides = id => { const p = presetById(id); return p ? { shared: { ...p.overrides.shared }, dark: { ...p.overrides.dark }, light: { ...p.overrides.light } } : null; };

    // The edits to start from: what was kept for this viewer, else the app's initial theme (JSON, override CSS or an object).
    let start = readStored(storageKey, win);
    if (options.initial !== undefined && options.initial !== null && !overrideCount(start)) {
        const read = readOverridesInput(options.initial);
        if (read.error) log.warn(`initial theme not used: ${read.error}`); else start = read.overrides;
    }

    const state = { overrides: start, scope: 'theme', kind: 'all', filter: '', palette: null, saved: readSavedThemes() };
    // Every change of the overrides goes through commit(), so undo and redo see it; typing in one field is one step.
    let hist = createHistory(state.overrides);
    const recordStep = (next, key = null) => { hist = record(hist, next, { key, at: Date.now() }); return hist.present; };
    const commit = (next, key = null) => { state.overrides = recordStep(next, key); };
    const outputCss = () => buildOverrides(guardLeaks(state.overrides, tokens));
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
    const undoBtn = h(doc, 'pk-button', { variant: 'ghost', size: 'mini', label: 'Undo' }, 'Undo');
    const redoBtn = h(doc, 'pk-button', { variant: 'ghost', size: 'mini', label: 'Redo' }, 'Redo');
    const changesTab = h(doc, 'pk-tab', { value: 'changes' }, 'Changes');
    const changesBox = h(doc, 'div', { class: 'te-changes' });
    const shown = h(doc, 'span', { class: 'muted', role: 'status' });
    const count = h(doc, 'pk-stat', { label: 'Overrides', value: '0', tile: true });
    const warn = h(doc, 'pk-alert', { kind: 'warning' });
    warn.hidden = true;
    const list = h(doc, 'div', { class: 'te-list' });
    const auditBox = h(doc, 'div', { class: 'te-pairs te-audit' });
    const contrastTab = h(doc, 'pk-tab', { value: 'contrast' }, 'Contrast');
    const cssBox = h(doc, 'pk-textarea', { label: 'CSS block', rows: 10, readonly: true });
    const jsonBox = h(doc, 'pk-textarea', { label: 'JSON overrides', rows: 10 });
    const importBtn = h(doc, 'pk-button', { variant: 'primary' }, 'Import JSON or CSS');
    const copyBtn = h(doc, 'pk-button', { variant: 'ghost' }, 'Copy CSS');
    const downloadBtn = h(doc, 'pk-button', { variant: 'ghost' }, 'Download JSON');
    const rejectedBox = h(doc, 'div');
    const snippetBox = h(doc, 'pk-textarea', { label: 'Copy-paste snippet', rows: 8, readonly: true });
    const copySnippet = h(doc, 'pk-button', { variant: 'ghost' }, 'Copy snippet');
    const linkBtn = h(doc, 'pk-button', { variant: 'primary' }, 'Create link');
    const linkBox = h(doc, 'pk-input', { label: 'Theme link', 'show-label': true, readonly: true, placeholder: 'Create link to fill this' });
    const copyLink = h(doc, 'pk-button', { variant: 'ghost' }, 'Copy link');
    const linkIn = h(doc, 'pk-input', { label: 'Paste a theme link', 'show-label': true, placeholder: '...#pk-theme=z....' });
    const importLinkBtn = h(doc, 'pk-button', { variant: 'primary' }, 'Import link');
    const shareMsg = h(doc, 'div');
    const topNote = h(doc, 'div');
    const message = h(doc, 'div');
    const brandInput = h(doc, 'pk-colour-input', { label: 'Brand colour', 'show-label': true, value: normalizeColour(baseValue(tokens, 'light', '--color-accent-fill')) ?? '#1d4ed8' });
    const neutralInput = h(doc, 'pk-input', { label: 'Neutral tint (optional)', 'show-label': true, placeholder: 'e.g. #334155', clearable: true });
    const warnInput = h(doc, 'pk-input', { label: 'Warn button (optional)', 'show-label': true, placeholder: 'e.g. #c2410c', clearable: true });
    const applyBrand = h(doc, 'pk-button', { variant: 'primary' }, 'Apply as edits');
    const paletteNote = h(doc, 'div');
    const paletteRowsBox = h(doc, 'div', { class: 'te-pairs' });
    const paletteMsg = h(doc, 'div');
    const presetSelect = h(doc, 'pk-select', { label: 'Built-in preset', value: presetList[0].id }, ...presetList.map(p => h(doc, 'option', { value: p.id }, p.name)));
    const presetHint = h(doc, 'p', { class: 'muted' }, presetList[0].description);
    const applyPreset = h(doc, 'pk-button', { variant: 'primary' }, 'Apply preset');
    const nameInput = h(doc, 'pk-input', { label: 'Theme name', 'show-label': true, placeholder: 'e.g. Brand dark', maxlength: 40 });
    const saveBtn = h(doc, 'pk-button', { variant: 'primary' }, 'Save current edits');
    const savedBox = h(doc, 'div', { class: 'te-saved' });
    const presetMsg = h(doc, 'div');

    const tabs = h(doc, 'pk-tabs', { value: 'tokens', label: 'Theme editor' },
        h(doc, 'pk-tab', { value: 'tokens' }, 'Tokens'), h(doc, 'pk-tab-panel', { value: 'tokens' }, list),
        changesTab, h(doc, 'pk-tab-panel', { value: 'changes' }, changesBox),
        h(doc, 'pk-tab', { value: 'palette' }, 'Palette'),
        h(doc, 'pk-tab-panel', { value: 'palette' },
            h(doc, 'p', { class: 'muted' }, 'Pick a brand colour: the accent, fill, hover and link colours and the text and surface ramps of both themes are generated so every text pair below is 4.5:1 or better. Apply writes them as ordinary edits you can still change.'),
            h(doc, 'div', { class: 'te-palette-inputs' }, brandInput, neutralInput, warnInput), h(doc, 'pk-cluster', { class: 'u-mt-3' }, applyBrand), paletteMsg, paletteNote, paletteRowsBox),
        h(doc, 'pk-tab', { value: 'presets' }, 'Presets'),
        h(doc, 'pk-tab-panel', { value: 'presets' },
            h(doc, 'p', { class: 'muted' }, 'A preset replaces the current edits (Reset all returns to the stylesheet). Saved themes are kept in this browser only.'),
            h(doc, 'div', { class: 'te-palette-inputs' }, presetSelect, h(doc, 'pk-cluster', {}, applyPreset)), presetHint,
            h(doc, 'h4', { class: 'te-caption' }, 'Saved themes'),
            h(doc, 'div', { class: 'te-palette-inputs' }, nameInput, h(doc, 'pk-cluster', {}, saveBtn)), presetMsg, savedBox),
        contrastTab, h(doc, 'pk-tab-panel', { value: 'contrast' }, warn, auditBox),
        ...(showPreview ? [h(doc, 'pk-tab', { value: 'preview' }, 'Preview'), h(doc, 'pk-tab-panel', { value: 'preview' }, (ui.previewHost = h(doc, 'div', { class: 'te-preview-host' })))] : []),
        h(doc, 'pk-tab', { value: 'export' }, 'Export / import'),
        h(doc, 'pk-tab-panel', { value: 'export' },
            h(doc, 'p', { class: 'muted' }, 'Names are lowercase custom properties; values use only letters, digits and # % . , ( ) - + / and spaces, at most 200 characters.'),
            rejectedBox, h(doc, 'p', { class: 'te-caption' }, 'CSS block (paste into a style element after the SDK stylesheets)'), cssBox,
            h(doc, 'p', { class: 'te-caption' }, 'The same as a file: save it as theme.css and load it after the SDK stylesheets (a strict style-src cannot use an inline style element)'), snippetBox, h(doc, 'pk-cluster', { class: 'u-mt-3' }, copySnippet),
            h(doc, 'p', { class: 'te-caption' }, 'A link to this theme: the edits travel in the link fragment (compressed when the browser can, at most 4096 characters, text only), and whoever opens it gets them as ordinary edits'),
            h(doc, 'div', { class: 'te-palette-inputs' }, linkBox, h(doc, 'pk-cluster', {}, linkBtn, copyLink)), h(doc, 'div', { class: 'te-palette-inputs u-mt-3' }, linkIn, h(doc, 'pk-cluster', {}, importLinkBtn)), shareMsg, h(doc, 'p', { class: 'te-caption' }, 'JSON { shared, dark, light } of token to value: the C# helper input (editable, then Import)'), jsonBox, h(doc, 'pk-cluster', { class: 'u-mt-3' }, importBtn, copyBtn, downloadBtn), message));

    const root = h(doc, 'section', { class: 'te', 'aria-label': 'Theme editor' },
        h(doc, 'div', { class: 'te-toolbar' }, find, kindSelect, themeSelect, scopeSelect),
        topNote,
        h(doc, 'pk-cluster', { justify: 'between' }, count, shown, h(doc, 'pk-cluster', {}, undoBtn, redoBtn, resetAll)),
        tabs);
    if (height) { root.classList.add('te--fixed'); root.style.height = height; }
    container.replaceChildren(root);
    loadElements(root);

    if (showPreview) {
        previewFrame = h(doc, 'iframe', { class: 'te-preview', title: 'Theme preview' });
        const links = [...styleUrls(STYLES, import.meta.url), ...styleUrls(OWN_STYLES, import.meta.url)].map(u => `<link rel="stylesheet" href="${encodeURI(u)}">`).join('');
        previewFrame.srcdoc = `<!doctype html><html lang="en" data-theme="${theme()}" data-te-preview><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${links}</head><body class="te-preview-body">${PREVIEW}<script type="module" src="${encodeURI(import.meta.url)}"></script></body></html>`;
        previewFrame.addEventListener('load', () => applyToPreview(outputCss().css));
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
            : isLengthToken(name, value)
                ? h(doc, 'pk-unit-input', { label: name, value, units: LENGTH_UNITS })
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

    // The live audit: every pair in both themes under the current edits, worst first within a theme, each with a jump to the token that sets it.
    function paintPairs() {
        const rows = auditPairs(state.overrides, tokens, pairs);
        const sum = auditSummary(rows);
        warn.hidden = false;
        warn.setAttribute('kind', sum.bad ? 'warning' : 'success');
        warn.textContent = sum.text;
        contrastTab.textContent = sum.bad ? `Contrast (${sum.bad} below AA)` : 'Contrast';
        const jump = (name, theme) => h(doc, 'pk-button', { size: 'mini', variant: 'ghost', 'data-jump': name, 'data-jump-theme': theme, label: `Go to ${name} in the ${theme} theme` }, name.replace(/^--/, ''));
        const group = theme => [h(doc, 'h4', { class: 'te-caption' }, `${cap(theme)} theme`), ...rows.filter(r => r.theme === theme).sort((x, y) => Number(y.bad) - Number(x.bad)).map(r => {
            const sample = h(doc, 'span', { class: 'te-sample', title: `${r.fgValue} on ${r.bgValue}` }, 'Aa');
            sample.style.setProperty('--te-fg', r.fgValue); sample.style.setProperty('--te-bg', r.bgValue);
            return h(doc, 'div', { class: 'te-pair', 'data-pair-row': `${r.theme} ${r.fg} ${r.bg}` }, sample, h(doc, 'code', { class: 'te-pair-name' }, `${r.fg} on ${r.bg}`),
                h(doc, 'pk-badge', { variant: r.bad ? 'danger' : r.ratio === null ? 'muted' : 'ok' }, r.ratio === null ? 'n/a' : `${r.ratio.toFixed(2)}:1 ${r.grade}`),
                h(doc, 'pk-cluster', { class: 'te-pair-jump' }, jump(r.fg, r.theme), jump(r.bg, r.theme)));
        })];
        auditBox.replaceChildren(...group('dark'), ...group('light'));
        for (const n of rowsByName.keys()) paintRow(n);
    }

    // Shows a token in the Tokens tab: in the theme the audit row is about, filtered to its name, scrolled to and focused.
    function jumpTo(name, forTheme) {
        if (forTheme !== theme()) api.setTheme(forTheme);
        state.filter = name; state.kind = 'all';
        find.value = name; find.setAttribute('value', name); kindSelect.value = 'all';
        paintList();
        tabs.value = 'tokens'; tabs.setAttribute('value', 'tokens');
        const row = list.querySelector(`[data-token="${CSS.escape(name)}"]`);
        row?.scrollIntoView?.({ block: 'center' });
        row?.querySelector('pk-colour-input, pk-input, pk-unit-input')?.focus?.();
    }

    // The generated palette for the inputs as they stand: { palette, error } and its swatches (each pair as sample text on its surface, with the ratio).
    function generate() {
        const read = el => String(el.value ?? el.getAttribute('value') ?? '').trim();   // before the element upgrades, the attribute is the value
        return generatePalette(read(brandInput), { neutral: read(neutralInput) || undefined, warn: read(warnInput) || undefined });
    }

    function paintPalette() {
        const p = generate();
        state.palette = p.error ? null : p;
        applyBrand.toggleAttribute('disabled', Boolean(p.error));
        if (p.error) { paletteNote.replaceChildren(h(doc, 'pk-alert', { kind: 'danger' }, p.error)); paletteRowsBox.replaceChildren(); return; }
        paletteNote.replaceChildren(p.moved
            ? h(doc, 'pk-alert', { kind: 'warning' }, `The brand colour ${p.brand} had to move to meet 4.5:1: `, ...p.notes.flatMap((n, i) => (i ? [h(doc, 'br'), n] : [n])))
            : h(doc, 'pk-alert', { kind: 'success' }, `The brand colour ${p.brand} meets 4.5:1 as it is in both themes.`));
        const rows = paletteRows(p.overrides, tokens);
        const group = theme => [h(doc, 'h4', { class: 'te-caption' }, `${cap(theme)} theme`), ...rows.filter(r => r.theme === theme).map(r => {
            const sample = h(doc, 'span', { class: 'te-sample', title: `${r.fgValue} on ${r.bgValue}` }, 'Aa');
            sample.style.setProperty('--te-fg', r.fgValue); sample.style.setProperty('--te-bg', r.bgValue);
            return h(doc, 'div', { class: 'te-pair', 'data-pair-row': `${r.theme} ${r.fg} ${r.bg}` }, sample, h(doc, 'code', { class: 'te-pair-name' }, `${r.fg} on ${r.bg}`),
                h(doc, 'pk-badge', { variant: r.bad ? 'danger' : 'ok' }, r.ratio === null ? 'n/a' : `${r.ratio.toFixed(1)}:1 ${r.grade}`));
        })];
        paletteRowsBox.replaceChildren(...group('dark'), ...group('light'));
    }

    function presetNote(kind, text) {
        presetMsg.replaceChildren(h(doc, 'pk-alert', { kind: kind === 'error' ? 'danger' : kind }, text));
    }

    function paintSaved() {
        const rows = state.saved.map(t => h(doc, 'div', { class: 'te-saved-row', 'data-saved': t.name },
            h(doc, 'span', { class: 'te-saved-name' }, t.name), h(doc, 'span', { class: 'muted' }, `${overrideCount(t.overrides)} overrides`),
            h(doc, 'pk-cluster', {}, h(doc, 'pk-button', { size: 'mini', 'data-act': 'apply', label: `Apply ${t.name}` }, 'Apply'),
                h(doc, 'pk-button', { size: 'mini', variant: 'ghost', 'data-act': 'rename', label: `Rename ${t.name} to the name above` }, 'Rename'),
                h(doc, 'pk-button', { size: 'mini', variant: 'warn', 'data-act': 'delete', label: `Delete ${t.name}` }, 'Delete'))));
        savedBox.replaceChildren(...(rows.length ? rows : [h(doc, 'p', { class: 'muted' }, 'No saved themes yet: type a name and save the current edits.')]));
        if (savedBlocked) presetNote('warning', 'This browser blocks storage, so saved themes last only until this page closes.');
    }

    // Replaces the current edits (an ordinary edit set the user can still change) and repaints everything that shows them.
    function replaceOverrides(next, message) {
        commit({ shared: next.shared, dark: next.dark, light: next.light });
        apply(); paintList();
        if (message) presetNote('success', message);
    }

    // The change list: every edit against the stylesheet value (grouped, each with its scope and a reset), the count, and the undo and redo buttons.
    function paintChanges() {
        const diff = diffOverrides(state.overrides, tokens);
        changesTab.textContent = `Changes (${changedTokens(state.overrides)})`;
        undoBtn.toggleAttribute('disabled', !canUndo(hist));
        redoBtn.toggleAttribute('disabled', !canRedo(hist));
        const scopeName = { shared: 'Both themes', dark: 'Dark', light: 'Light' };
        const groups = [...new Set(diff.map(d => d.group))];
        changesBox.replaceChildren(h(doc, 'p', { class: 'te-summary', role: 'status' }, changeSummary(state.overrides)),
            ...(diff.length ? groups.flatMap(g => [
                h(doc, 'div', { class: 'te-change-head' }, h(doc, 'h4', { class: 'te-caption' }, g), h(doc, 'pk-button', { size: 'mini', variant: 'ghost', 'data-reset-group': g, label: `Reset every ${g} token` }, 'Reset group')),
                ...diff.filter(d => d.group === g).map(d => h(doc, 'div', { class: 'te-change', 'data-change': `${d.scope} ${d.name}` },
                    h(doc, 'code', { class: 'te-pair-name' }, d.name), h(doc, 'pk-badge', { variant: 'muted' }, scopeName[d.scope]),
                    h(doc, 'span', { class: 'te-diff' }, h(doc, 'code', {}, d.from || 'unset'), ' \u2192 ', h(doc, 'code', {}, d.to)),
                    h(doc, 'pk-button', { size: 'mini', variant: 'ghost', 'data-reset': d.name, 'data-scope': d.scope, label: `Reset ${d.name} (${scopeName[d.scope]})` }, 'Reset'))),
            ]) : [h(doc, 'p', { class: 'muted' }, 'Nothing differs from the stylesheet.')]));
    }

    // Applies a new history state (undo, redo) or any external change of the overrides: everything that shows them repaints.
    function step(fn) {
        const before = hist;
        hist = fn(hist);
        if (hist === before) return false;
        state.overrides = hist.present;
        apply(); paintList();
        return true;
    }

    function paintExport(css, rejected) {
        cssBox.value = css;
        snippetBox.value = buildSnippet(guardLeaks(state.overrides, tokens));
        jsonBox.value = JSON.stringify(state.overrides, null, 2);
        const n = overrideCount(state.overrides);
        count.setAttribute('value', String(n));
        rejectedBox.replaceChildren(...(rejected.length ? [h(doc, 'pk-alert', { kind: 'warning' }, ...rejected.flatMap((r, i) => (i ? [h(doc, 'br'), r] : [r])))] : []));
    }

    function apply() {
        const { css, rejected } = outputCss();
        applyToTarget(css);
        applyToPreview(css);
        if (storageKey) try { win.localStorage.setItem(storageKey, JSON.stringify(state.overrides)); } catch (error) { log.debug('storage blocked: the edit applies but is not saved', error); }
        paintPairs();
        paintChanges();
        paintExport(css, rejected);
        onchange?.({ css, overrides: api.overrides() });
    }

    function edit(name, value) {
        commit(withEdit(state.overrides, { theme: theme(), scope: state.scope, name, value, base: baseValue(tokens, theme(), name) }), name);
        apply();
    }

    function note(kind, text) {
        message.replaceChildren(h(doc, 'pk-alert', { kind: kind === 'error' ? 'danger' : kind }, text));
    }

    function importText(text) {
        const read = readImport(text);
        if (read.error) { log.warn(`import refused, the overrides are unchanged: ${read.error}`); note('error', read.error); return; }
        const parsed = read.overrides;
        state.overrides = recordStep({ shared: parsed.shared, dark: parsed.dark, light: parsed.light });
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
    on(auditBox, 'click', e => { const b = e.target.closest?.('[data-jump]'); if (b) jumpTo(b.dataset.jump, b.dataset.jumpTheme); });
    on(undoBtn, 'click', () => api.undo());
    on(redoBtn, 'click', () => api.redo());
    on(changesBox, 'click', e => {
        const b = e.target.closest?.('pk-button');
        if (!b || b.hasAttribute('disabled')) return;
        if (b.dataset.resetGroup) commit(withoutGroup(state.overrides, b.dataset.resetGroup));
        else if (b.dataset.reset) commit(withoutEntry(state.overrides, b.dataset.scope, b.dataset.reset));
        else return;
        apply(); paintList();
    });
    // Ctrl or Cmd+Z undoes, plus Shift+Z or Y redoes, except in a text field (which keeps its own undo).
    on(root, 'keydown', e => {
        if (!(e.ctrlKey || e.metaKey) || e.altKey || /^pk-(input|textarea|unit-input|colour-input)$/.test(e.target.localName)) return;
        const k = e.key.toLowerCase();
        if (k === 'z' && !e.shiftKey) { if (api.undo()) e.preventDefault(); } else if ((k === 'z' && e.shiftKey) || k === 'y') { if (api.redo()) e.preventDefault(); }
    });
    on(list, 'pk-colour', e => { const n = tokenOf(e); if (n) edit(n, e.detail.value); });
    const editField = e => {
        if (e.target.localName !== 'pk-input' && e.target.localName !== 'pk-unit-input') return;
        const n = tokenOf(e);
        if (!n) return;
        const v = String(e.target.value ?? '').trim();
        const problem = v === '' ? null : nameProblem(n) ?? valueProblem(v);
        if (problem) { e.target.setAttribute('invalid', ''); e.target.setAttribute('title', problem); return; }
        e.target.removeAttribute('invalid'); e.target.removeAttribute('title');
        edit(n, v);
    };
    on(list, 'input', editField);
    on(list, 'pk-value-change', editField);   // a unit pick in a pk-unit-input raises this and no input event
    on(list, 'click', e => {
        const b = e.target.closest?.('pk-button');
        const n = tokenOf(e);
        if (!b || !n || b.hasAttribute('disabled')) return;
        commit(withoutToken(state.overrides, n));
        apply();
        const fresh = makeRow(n);
        const old = list.querySelector(`[data-token="${CSS.escape(n)}"]`);
        old.replaceWith(fresh);
        paintRow(n);
    });
    for (const el of [brandInput, neutralInput, warnInput]) on(el, 'input', () => paintPalette());
    on(applyBrand, 'click', () => {
        if (!state.palette || applyBrand.hasAttribute('disabled')) return;
        commit(applyPalette(state.overrides, state.palette.overrides, tokens));
        apply(); paintList();
        paletteMsg.replaceChildren(h(doc, 'pk-alert', { kind: 'success' }, `Applied: ${overrideCount(state.overrides)} overrides in all. Edit any token in the Tokens tab.`));
    });
    on(presetSelect, 'change', e => { presetHint.textContent = presetById(e.target.value)?.description ?? ''; });
    on(applyPreset, 'click', () => api.applyPreset(presetSelect.value));
    on(saveBtn, 'click', () => {
        const r = saveTheme(state.saved, String(nameInput.value ?? ''), state.overrides);
        if (r.error) { log.warn(`save refused: ${r.error}`); presetNote('error', r.error); return; }
        state.saved = r.list; writeSavedThemes(state.saved); paintSaved();
        if (!savedBlocked) presetNote('success', r.replaced ? 'Saved over the theme of that name.' : 'Saved.');
    });
    on(savedBox, 'click', e => {
        const b = e.target.closest?.('pk-button');
        const name = e.target.closest?.('[data-saved]')?.dataset.saved;
        if (!b || !name) return;
        const act = b.dataset.act;
        if (act === 'apply') { const t = state.saved.find(s => s.name === name); if (t) replaceOverrides(t.overrides, `Applied ${name}.`); return; }
        if (act === 'delete') { state.saved = deleteTheme(state.saved, name); writeSavedThemes(state.saved); paintSaved(); return; }
        if (act === 'rename') {
            const r = renameTheme(state.saved, name, String(nameInput.value ?? ''));
            if (r.error) { log.warn(`rename refused: ${r.error}`); presetNote('error', r.error); return; }
            state.saved = r.list; writeSavedThemes(state.saved); paintSaved();
            if (!savedBlocked) presetNote('success', 'Renamed.');
        }
    });
    // A link to the current edits, or the edits of a link: text only, the same rules as pasting JSON.
    function shareNote(kind, text) { shareMsg.replaceChildren(h(doc, 'pk-alert', { kind: kind === 'error' ? 'danger' : kind }, text)); }
    async function makeLink() {
        const r = await encodeShare(state.overrides);
        if (r.error) { log.warn(`share refused: ${r.error}`); shareNote('error', r.error); return r; }
        const url = `${win.location.href.split('#')[0]}#${r.hash}`;
        linkBox.value = url; linkBox.setAttribute('value', url);
        shareNote('success', `Link ready (${r.hash.length} of 4096 characters${r.compressed ? ', compressed' : ''}).`);
        return { url, hash: r.hash };
    }
    async function importLink(text, fromPage = false) {
        const r = await decodeShare(text);
        if (r.error) { log.warn(`link refused, the edits are unchanged: ${r.error}`); shareNote('error', r.error); if (fromPage) topNote.replaceChildren(h(doc, 'pk-alert', { kind: 'danger' }, `The theme link in the address was not used: ${r.error}`)); return r; }
        commit(r.overrides);
        apply(); paintList();
        shareNote('success', 'Imported the theme from the link as edits. Undo takes it back.');
        if (fromPage) topNote.replaceChildren(h(doc, 'pk-alert', { kind: 'info' }, `Applied the theme from the link: ${changeSummary(state.overrides)}. Undo takes it back.`));
        return r;
    }
    const clip = (text, what) => win.navigator.clipboard?.writeText(text)?.catch(error => log.warn(`could not copy the ${what}`, error));
    on(linkBtn, 'click', () => { makeLink(); });
    on(copyLink, 'click', () => clip(linkBox.value, 'link'));
    on(copySnippet, 'click', () => clip(snippetBox.value, 'snippet'));
    on(importLinkBtn, 'click', () => { importLink(String(linkIn.value ?? '')); });
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
        export: () => outputCss().css,
        overrides: () => ({ shared: { ...state.overrides.shared }, dark: { ...state.overrides.dark }, light: { ...state.overrides.light } }),
        setTheme(name) { setThemeAttr(isDoc ? target.documentElement : themeHost, name); apply(); paintList(); },
        reset() { commit(emptyOverrides()); apply(); paintList(); },
        undo() { return step(undo); },
        redo() { return step(redo); },
        // A link to the current edits: { url, hash } or { error } (nothing differs, or too large for a link). Text only: the edits are in the fragment.
        share: () => makeLink(),
        // Applies the theme in a link (the fragment or the whole URL) as edits: { overrides } or { error }.
        importShare: text => importLink(text),
        // Built-in presets ({ id, name, description }) and the user's saved theme names.
        presets: () => presetList.map(({ id, name, description }) => ({ id, name, description })),
        saved: () => state.saved.map(t => t.name),
        // Replaces the edits with a built-in preset ('default', 'high-contrast', 'compact', 'roomy') or a saved theme (by name). Returns false for an unknown one.
        applyPreset(id) {
            const built = presetOverrides(id);
            const saved = built ? null : state.saved.find(t => t.name === id);
            const next = built ?? (saved ? sanitizeOverrides(saved.overrides) : null);
            if (!next) { log.warn(`applyPreset: no preset or saved theme called "${id}"`); return false; }
            replaceOverrides(next, `Applied ${presetById(id)?.name ?? id}.`);
            return true;
        },
        // Generates a palette for a brand colour and applies it as edits. Returns the generated result ({ brand, moved, notes, overrides } or { error }).
        applyBrand(colour, options = {}) {
            const p = generatePalette(colour, options);
            if (p.error) { log.warn(`applyBrand refused: ${p.error}`); return p; }
            commit(applyPalette(state.overrides, p.overrides, tokens));
            brandInput.setAttribute('value', p.brand); brandInput.value = p.brand;
            apply(); paintList(); paintPalette();
            return p;
        },
        destroy() {
            observer.disconnect();
            for (const off of listeners) off();
            if (sheet) targetDoc.adoptedStyleSheets = targetDoc.adoptedStyleSheets.filter(s => s !== sheet);
            else for (const n of setInline) themeHost.style.removeProperty(n);
            root.remove();
        },
    };
    apply(); paintList(); paintPalette(); paintSaved();
    if (options.readHash && win.location.hash.includes(`${SHARE_KEY}=`)) await importLink(win.location.hash, true);
    return api;
}

// The Preview frame loads this same module as its script: inside it, the only job is to define the pk-* elements the frame shows.
if (globalThis.document?.documentElement?.hasAttribute('data-te-preview')) loadElements(document);
