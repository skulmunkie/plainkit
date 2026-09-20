// The SDK theme editor. Lists every token declared in tokens.css with a matching input (colour picker, number + unit, text),
// applies edits live to this page and to a preview frame through one <style> of override CSS, warns on low-contrast text
// pairs, and exports/imports the override block in the format the server-side PkThemeOverrides helper takes (same names, same rules).
// Themes are token sets and JS variables are config: nothing here knows about a specific control.

import { mountShell, readSetting, writeSetting } from '../shell.js';
import { sanitizeOverrides, parseTokenBlocks, tokenKind, currentTheme, setTheme, buildOverrides, parseOverrides, nameProblem, valueProblem, splitLength, colourToHex } from '../../js/theme.js';
import { contrast, grade } from '../../js/colour.js';
import { sampleDoc } from '../gallery/frame.js';
import { TEXT_PAIRS } from '../scorecard/scoring.data.js';

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const $ = (s, r = document) => r.querySelector(s);
const STORE = 'pk-theme-overrides';
const KINDS = ['all', 'colour', 'font', 'size', 'shadow', 'layer', 'other'];

const PREVIEW = `
<div class="toolbar"><div class="toolbar-lead"><strong class="toolbar-title">Preview</strong><span class="toolbar-note">every control reads tokens only</span></div><div class="toolbar-actions"><button class="btn-mini btn-ghost">Ghost</button><button class="btn-mini btn-primary">Primary</button></div></div>
<section class="card"><div class="card-header"><h2>Card title</h2><span class="muted">muted text</span></div><p>Body text with <a href="#">a link</a> and <code>code</code>.</p>
<label class="ff"><span>Field</span><input type="text" value="Input value"></label>
<div class="cluster cluster--horizontal cluster--gap-sm cluster--align-center cluster--justify-start u-mt-3"><span class="chip">Default</span><span class="chip chip-success">Registered</span><span class="chip chip-warn">Warn</span><span class="chip chip-danger">Danger</span></div></section>
<div class="notice notice--warning">A warning notice.</div><div class="notice notice--success">A success notice.</div>
<table class="data"><thead><tr><th>SKU</th><th class="num">Price</th></tr></thead><tbody><tr><td><code>AC-001</code></td><td class="num">$4.99</td></tr></tbody></table>
<div class="tabs" role="tablist" data-pk-tabs="toggle"><button class="tab active" role="tab" aria-selected="true" tabindex="0">One</button><button class="tab" role="tab" aria-selected="false" tabindex="-1">Two</button></div>`;

const read = () => { try { const raw = readSetting(STORE) ?? '{}'; return raw.length > 100000 ? sanitizeOverrides({}) : sanitizeOverrides(JSON.parse(raw)); } catch { return sanitizeOverrides({}); } };

const state = { overrides: read(), scope: 'theme', kind: 'all', filter: '', tokens: null };
let previewFrame = null;

const theme = () => currentTheme(document.documentElement);
const targetDict = name => (state.scope === 'both' ? state.overrides.shared : state.overrides[theme()]);
const baseValue = name => state.tokens[theme()][name] ?? state.tokens.root[name] ?? state.tokens.dark[name] ?? '';
const isChanged = name => (name in state.overrides[theme()]) || (name in state.overrides.shared);
const effective = name => state.overrides[theme()][name] ?? state.overrides.shared[name] ?? baseValue(name);

// Override CSS goes in through a constructable stylesheet (CSSOM), which a strict style-src allows; a <style> element would not be.
const sheets = new WeakMap();
function adopt(doc, css) {
    let sheet = sheets.get(doc);
    if (!sheet) { sheet = new doc.defaultView.CSSStyleSheet(); sheets.set(doc, sheet); doc.adoptedStyleSheets = [...doc.adoptedStyleSheets, sheet]; }
    sheet.replaceSync(css);
}

function apply() {
    const { css, rejected } = buildOverrides(state.overrides);
    adopt(document, css);
    const doc = previewFrame?.contentDocument;
    if (doc?.head) { adopt(doc, css); doc.documentElement.setAttribute('data-theme', theme()); }
    writeSetting(STORE, JSON.stringify(state.overrides));
    paintPairs();
    paintExport(css, rejected);
}

function setValue(name, value) {
    const dict = targetDict(name);
    if (value === '' || value === baseValue(name)) delete dict[name]; else dict[name] = value;
    if (state.scope === 'both') delete state.overrides[theme()][name];
    apply();
}

function paintPairs() {
    const root = getComputedStyle(document.documentElement);
    $('#te-pairs').innerHTML = TEXT_PAIRS.map(([fg, bg]) => {
        const r = contrast(root.getPropertyValue(fg).trim(), root.getPropertyValue(bg).trim());
        const bad = r !== null && r < 4.5;
        return `<tr><td><code>${fg}</code> on <code>${bg}</code></td><td class="num">${r === null ? 'n/a' : r.toFixed(2) + ':1'}</td><td><span class="chip ${bad ? 'chip-danger' : 'chip-success'}">${bad ? 'below AA' : grade(r)}</span></td></tr>`;
    }).join('');
    const warn = TEXT_PAIRS.filter(([fg, bg]) => { const r = contrast(root.getPropertyValue(fg).trim(), root.getPropertyValue(bg).trim()); return r !== null && r < 4.5; }).length;
    $('#te-warn').hidden = warn === 0;
    $('#te-warn').textContent = `${warn} text pair${warn === 1 ? '' : 's'} below 4.5:1 in the ${theme()} theme.`;
    document.querySelectorAll('[data-pair-of]').forEach(el => {
        const r = contrast(root.getPropertyValue(el.dataset.pairOf).trim(), root.getPropertyValue('--color-panel').trim());
        el.textContent = r === null ? '' : `${r.toFixed(1)}:1`;
        el.className = `chip ${r !== null && r < 4.5 ? 'chip-danger' : 'chip-success'}`;
    });
}

function paintExport(css, rejected) {
    $('#te-css').value = css;
    $('#te-json').value = JSON.stringify(state.overrides, null, 2);
    const n = Object.keys(state.overrides.shared).length + Object.keys(state.overrides.dark).length + Object.keys(state.overrides.light).length;
    $('#te-count').textContent = `${n} override${n === 1 ? '' : 's'}`;
    $('#te-rejected').innerHTML = rejected.length ? `<div class="notice notice--warning" role="alert">${rejected.map(esc).join('<br>')}</div>` : '';
}

function inputFor(name, value) {
    const kind = tokenKind(name, value);
    const hex = kind === 'colour' ? colourToHex(value) : null;
    const len = kind === 'size' || kind === 'layer' ? splitLength(value) : null;
    const text = `<input type="text" data-token="${name}" value="${esc(value)}" aria-label="${name} value">`;
    if (hex) return `<input type="color" data-token-color="${name}" value="${hex}" aria-label="${name} colour picker">${text}`;
    if (len) return `<input type="number" step="any" data-token-num="${name}" data-unit="${len.unit}" value="${len.number}" aria-label="${name} number"><span class="muted">${len.unit || 'unitless'}</span>${text}`;
    return text;
}

function paintTokens() {
    const all = [...new Set([...Object.keys(state.tokens.dark), ...Object.keys(state.tokens.light), ...Object.keys(state.tokens.root)])].sort();
    const f = state.filter.toLowerCase();
    const rows = all.filter(n => (state.kind === 'all' || tokenKind(n, baseValue(n)) === state.kind) && n.includes(f));
    $('#te-rows').innerHTML = rows.map(n => `<tr class="te-row${isChanged(n) ? ' te-changed' : ''}"><td><code>${n}</code> ${/^--color-(text|muted|link|accent)$/.test(n) ? `<span data-pair-of="${n}"></span>` : ''}</td><td><div class="te-inputs">${inputFor(n, effective(n))}<button type="button" class="btn-mini btn-ghost" data-reset="${n}" aria-label="Reset ${n}"${isChanged(n) ? '' : ' disabled'}>Reset</button></div></td></tr>`).join('') || '<tr><td colspan="2" class="muted">No tokens match.</td></tr>';
    $('#te-shown').textContent = `${rows.length} of ${all.length} tokens`;
    paintPairs();
}

function importText(text) {
    const parsed = parseOverrides(text);
    if (!parsed) { $('#te-import-msg').innerHTML = '<div class="notice notice--error" role="alert">Not JSON and not an override CSS block.</div>'; return; }
    state.overrides = { shared: parsed.shared, dark: parsed.dark, light: parsed.light };
    $('#te-import-msg').innerHTML = '<div class="notice notice--success" role="status">Imported.</div>';
    apply(); paintTokens();
}

async function main() {
    mountShell({ page: 'theme', title: 'Theme editor' });
    $('#boot-notice')?.remove();
    state.tokens = parseTokenBlocks(await (await fetch(new URL('../../tokens/tokens.css', import.meta.url))).text());

    $('#te-workspace').innerHTML = `
        <aside class="workspace-nav u-p-p75r-1r" aria-label="Editor settings">
            <label class="ff"><span>Find token</span><input type="search" id="te-find" placeholder="e.g. accent, radius"></label>
            <label class="ff"><span>Kind</span><select id="te-kind">${KINDS.map(k => `<option>${k}</option>`).join('')}</select></label>
            <fieldset class="ff te-fieldset"><legend class="u-text-sm muted">Edits apply to</legend>
                <label class="chk"><input type="radio" name="te-scope" value="theme" checked><span>The current theme only</span></label>
                <label class="chk"><input type="radio" name="te-scope" value="both"><span>Both themes (shared)</span></label></fieldset>
            <div class="cluster cluster--horizontal cluster--gap-sm cluster--align-center cluster--justify-start"><button type="button" class="btn-mini btn-ghost" data-set-theme="dark">Dark</button><button type="button" class="btn-mini btn-ghost" data-set-theme="light">Light</button></div>
            <p class="muted u-m0" id="te-shown"></p><p class="muted u-m0" id="te-count"></p>
            <button type="button" class="btn-mini btn-warn" id="te-reset">Reset all</button>
            <h3 class="u-m0">Contrast</h3><div class="notice notice--warning" id="te-warn" hidden role="status"></div>
            <table class="data te-pairs"><tbody id="te-pairs"></tbody></table>
        </aside>
        <main class="workspace-main">
            <div class="tabs tabs--scroll" role="tablist" data-pk-tabs="toggle">
                <button type="button" class="tab tab--phone-only" role="tab" aria-selected="false" tabindex="-1" data-pk-workspace-nav>Settings</button>
                <button type="button" class="tab active" role="tab" aria-selected="true" tabindex="0" data-pk-panel="tokens">Tokens</button>
                <button type="button" class="tab" role="tab" aria-selected="false" tabindex="-1" data-pk-panel="preview">Preview</button>
                <button type="button" class="tab" role="tab" aria-selected="false" tabindex="-1" data-pk-panel="export">Export / import</button>
            </div>
            <div class="workspace-pane te-pane">
                <div data-pk-panel-id="tokens"><table class="data"><thead><tr><th>Token</th><th>Value</th></tr></thead><tbody id="te-rows"></tbody></table></div>
                <div data-pk-panel-id="preview" hidden><div id="te-preview-host"></div></div>
                <div data-pk-panel-id="export" hidden>
                    <p class="muted">The override block is what <code>PkThemeOverrides.Build(shared, dark, light)</code> emits: names are lowercase custom properties, values use only letters, digits and <code># % . , ( ) - + /</code>, at most 200 characters. Emit it in a <code>&lt;style&gt;</code> after the SDK stylesheets.</p>
                    <div id="te-rejected"></div>
                    <label class="ff ff--wide"><span>CSS block (paste into a style element)</span><textarea class="te-export" id="te-css" rows="10" readonly></textarea></label>
                    <label class="ff ff--wide"><span>JSON: { shared, dark, light } of token to value (the C# helper's input; editable, then Import)</span><textarea class="te-export" id="te-json" rows="10"></textarea></label>
                    <div class="cluster cluster--horizontal cluster--gap-sm cluster--align-center cluster--justify-start"><button type="button" class="btn-primary" id="te-import">Import JSON or CSS</button><button type="button" class="btn-ghost" id="te-copy">Copy CSS</button><button type="button" class="btn-ghost" id="te-download">Download JSON</button></div>
                    <div id="te-import-msg"></div>
                </div>
            </div>
        </main>`;

    previewFrame = document.createElement('iframe');
    previewFrame.className = 'te-preview gx-frame';
    previewFrame.title = 'Theme preview';
    previewFrame.style.height = '34rem';
    previewFrame.srcdoc = sampleDoc(PREVIEW, { theme: theme() });
    previewFrame.addEventListener('load', apply);
    $('#te-preview-host').append(previewFrame);

    $('#te-find').addEventListener('input', e => { state.filter = e.target.value; paintTokens(); });
    $('#te-kind').addEventListener('change', e => { state.kind = e.target.value; paintTokens(); });
    document.querySelectorAll('[name="te-scope"]').forEach(r => r.addEventListener('change', e => { state.scope = e.target.value; }));
    $('#te-reset').addEventListener('click', () => { state.overrides = { shared: {}, dark: {}, light: {} }; apply(); paintTokens(); });
    $('#te-workspace').addEventListener('click', e => {
        const t = e.target.closest('[data-set-theme]');
        if (t) { setTheme(document.documentElement, t.dataset.setTheme); writeSetting('pk-site-theme', t.dataset.setTheme); apply(); paintTokens(); }
        const r = e.target.closest('[data-reset]');
        if (r) { const n = r.dataset.reset; delete state.overrides.shared[n]; delete state.overrides.dark[n]; delete state.overrides.light[n]; apply(); paintTokens(); }
    });
    $('#te-rows').addEventListener('input', e => {
        const el = e.target;
        if (el.dataset.token) { const v = el.value.trim(); const p = v === '' ? null : nameProblem(el.dataset.token) ?? valueProblem(v); el.setAttribute('aria-invalid', String(!!p)); el.title = p ?? ''; if (!p) setValue(el.dataset.token, v); }
        if (el.dataset.tokenColor) setValue(el.dataset.tokenColor, el.value);
        if (el.dataset.tokenNum) setValue(el.dataset.tokenNum, `${el.value}${el.dataset.unit}`);
    });
    $('#te-rows').addEventListener('change', () => paintTokens());
    $('#te-import').addEventListener('click', () => importText($('#te-json').value));
    $('#te-copy').addEventListener('click', () => navigator.clipboard?.writeText($('#te-css').value));
    $('#te-download').addEventListener('click', () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([$('#te-json').value], { type: 'application/json' })); a.download = 'pk-theme-overrides.json'; a.click(); URL.revokeObjectURL(a.href); });
    document.addEventListener('site-theme', () => { apply(); paintTokens(); });
    apply(); paintTokens();
}

main().catch(err => {
    const n = document.createElement('div');
    n.className = 'notice notice--error gx-notice-file';
    n.setAttribute('role', 'alert');
    n.textContent = `The theme editor could not start: ${err.message}. Serve the Plainkit folder with a static server.`;
    document.body.append(n);
});
