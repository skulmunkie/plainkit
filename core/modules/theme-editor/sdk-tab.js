// The theme editor's "Custom SDK" tab (modules/theme-editor): choose what to include, set the breakpoint widths, see what each change moves, and download the result.
//
//   Theme       the editor's token edits (the same override block as the Export / import tab)
//   Breakpoints phone, tablet and wide, as whole pixel widths, validated; a live table of the elements and properties that change at each (dist/breakpoints.report.json)
//   Export      ticked theme only: a small zip (plainkit-theme.css, the settings, a README), no SDK file fetched; breakpoints only or both: the release dist re-resolved,
//               with a recomputed manifest, as a zip. Everything runs in this page; the only requests are same-origin reads of the shipped dist files.
//   Import      a plainkit.custom.json from an earlier export puts the theme and the widths back.
// The logic is js/custom-sdk-logic.js, js/custom-sdk.js and js/zip-store.js; this file is the interface only. Built from SDK components.
import { validateBreakpoints, deltaRows, readSettings, RANGE } from '../../js/custom-sdk-logic.js';
import { fetchDist, exportSdk, exportTheme } from '../../js/custom-sdk.js';
import { PK_VERSION } from '../../js/version.js';
import { createLogger } from '../../js/log.js';
import { runtimeUrl } from '../../js/mount-support.js';
const log = createLogger('theme-editor.sdk');

/** The runtime dist folder (two levels above this module in the release layout, where the modules sit in dist/modules/); the source tree points at core/dist (the build rewrites this line). */
export const DIST = '../../dist/';

function h(doc, tag, props = {}, ...children) {
    const el = doc.createElement(tag);
    for (const [k, v] of Object.entries(props)) if (v !== undefined && v !== null && v !== false) el.setAttribute(k, v === true ? '' : v);
    el.append(...children.filter(c => c !== null && c !== undefined));
    return el;
}

/**
 * createSdkTab({ doc, win, theme, importTheme, dist }) -> { panel, refresh(), widths(), include(), setWidths(w), destroy() }.
 * theme() gives { overrides, css } (the editor's edits and the override block it writes); importTheme(overrides) replaces the edits; dist is the folder URL of the shipped files.
 */
export function createSdkTab({ doc, win, theme, importTheme, dist = runtimeUrl(DIST, import.meta.url) }) {
    const state = { report: null, names: [], shipped: {}, busy: false, distPromise: null };
    const listeners = [];
    const on = (el, type, fn) => { el.addEventListener(type, fn); listeners.push(() => el.removeEventListener(type, fn)); };
    const chkTheme = h(doc, 'pk-checkbox', { label: 'Theme (the token edits)', checked: true, 'data-sdk': 'include-theme' });
    const chkBp = h(doc, 'pk-checkbox', { label: 'Breakpoints', checked: true, 'data-sdk': 'include-breakpoints' });
    const inputsBox = h(doc, 'div', { class: 'te-palette-inputs' });
    const problems = h(doc, 'div');
    const deltaBox = h(doc, 'div', { class: 'te-delta' });
    const summary = h(doc, 'p', { class: 'muted', role: 'status', 'data-sdk': 'summary' });
    const exportBtn = h(doc, 'pk-button', { variant: 'primary', 'data-sdk': 'export' }, 'Export');
    const cssBtn = h(doc, 'pk-button', { variant: 'ghost', 'data-sdk': 'download-css' }, 'Download plainkit-theme.css');
    const status = h(doc, 'div', { role: 'status', 'data-sdk': 'status' });
    const importBox = h(doc, 'pk-textarea', { label: 'plainkit.custom.json', rows: 5, placeholder: 'Paste the settings file of an earlier export' });
    const importBtn = h(doc, 'pk-button', { variant: 'primary', 'data-sdk': 'import' }, 'Import settings');
    const importMsg = h(doc, 'div');
    const fields = new Map();

    const panel = h(doc, 'div', { class: 'te-sdk' },
        h(doc, 'p', { class: 'muted' }, 'Tick what to include. A theme alone is a small stylesheet that loads after plainkit.css. Breakpoints change the widths inside the elements, so the whole dist is rewritten and a zip of it is made here, in this page; nothing is sent anywhere.'),
        h(doc, 'div', { class: 'te-palette-inputs' }, chkTheme, chkBp),
        h(doc, 'h4', { class: 'te-caption' }, `Breakpoint widths (whole pixels, ${RANGE.min} to ${RANGE.max}, ascending, at least ${RANGE.gap} apart)`),
        inputsBox, problems, deltaBox,
        h(doc, 'h4', { class: 'te-caption' }, 'Export'), summary, h(doc, 'pk-cluster', {}, exportBtn, cssBtn), status,
        h(doc, 'h4', { class: 'te-caption' }, 'Import settings'), importBox, h(doc, 'pk-cluster', { class: 'u-mt-3' }, importBtn), importMsg);

    const msg = (box, kind, text) => box.replaceChildren(h(doc, 'pk-alert', { kind: kind === 'error' ? 'danger' : kind }, text));
    const flag = el => (typeof el.checked === 'boolean' ? el.checked : el.hasAttribute('checked'));
    const include = () => ({ theme: flag(chkTheme), breakpoints: flag(chkBp) });
    const raw = () => Object.fromEntries(state.names.map(n => [n, fields.get(n)?.value ?? fields.get(n)?.getAttribute('value') ?? '']));
    const widths = () => { const v = validateBreakpoints(raw(), state.names); return { ...state.shipped, ...Object.fromEntries(Object.entries(v.widths).filter(([n]) => !v.problems.some(p => p.name === n))) }; };
    const themeCount = () => { const o = theme().overrides; return Object.keys(o.shared).length + Object.keys(o.dark).length + Object.keys(o.light).length; };

    function paintDelta() {
        if (!state.report) { deltaBox.replaceChildren(); return; }
        const rows = deltaRows(state.report, widths());
        const props = list => list.length ? list.join(', ') : '';
        deltaBox.replaceChildren(h(doc, 'h4', { class: 'te-caption' }, 'What changes at each breakpoint'), h(doc, 'pk-accordion', {}, ...rows.map(r => {
            const head = `${r.name}: ${r.from}px${r.changed ? ` to ${r.to}px` : ''} (${r.elements.length} elements, ${r.rules} rules)`;
            const body = h(doc, 'div', {},
                h(doc, 'p', { class: 'muted' }, r.changed ? `Viewports ${r.flips[0]} to ${r.flips[1]}px wide switch state: below the breakpoint a rule applies at or below its width, above it the complement applies.` : 'Unchanged: the release width.'),
                h(doc, 'pk-table', { density: 'compact' }, (() => {
                    const table = h(doc, 'table', {}, h(doc, 'thead', {}, h(doc, 'tr', {}, ...['Element', 'At or below', 'Above'].map(t => h(doc, 'th', {}, t)))),
                        h(doc, 'tbody', {}, ...r.elements.map(e => h(doc, 'tr', {}, h(doc, 'td', {}, e.element === 'page-layer' ? 'Page layer (base and utilities)' : h(doc, 'code', {}, `pk-${e.element}`)), h(doc, 'td', {}, props(e.below)), h(doc, 'td', {}, props(e.above))))));
                    return table;
                })()));
            return h(doc, 'pk-accordion-item', { heading: head, ...(r.changed ? { open: true } : {}), 'data-breakpoint': r.name }, body);
        })));
    }

    function paint() {
        const inc = include(); const v = validateBreakpoints(raw(), state.names);
        for (const [n, el] of fields) { if (v.problems.some(p => p.name === n)) el.setAttribute('invalid', ''); else el.removeAttribute('invalid'); }
        if (v.ok || !inc.breakpoints) problems.replaceChildren(); else msg(problems, 'error', v.problems.map(p => p.message).join('. ') + '.');
        for (const el of fields.values()) el.toggleAttribute('disabled', !inc.breakpoints);
        const n = themeCount();
        const parts = [inc.theme ? `${n} token override${n === 1 ? '' : 's'}` : null, inc.breakpoints ? Object.entries(widths()).map(([k, w]) => `${k} ${w}px`).join(', ') : null].filter(Boolean);
        const kind = inc.theme && inc.breakpoints ? 'Export custom SDK' : inc.theme ? 'Export theme only' : inc.breakpoints ? 'Export breakpoints only' : 'Export';
        exportBtn.textContent = kind;
        const blocked = state.busy || (!inc.theme && !inc.breakpoints) || (inc.breakpoints && !v.ok) || (inc.breakpoints && !state.report) || (inc.theme && !inc.breakpoints && n === 0);
        exportBtn.toggleAttribute('disabled', blocked);
        cssBtn.toggleAttribute('disabled', n === 0);
        summary.textContent = !inc.theme && !inc.breakpoints ? 'Nothing is ticked.' : inc.theme && !inc.breakpoints && n === 0 ? 'No token edits yet: edit a token, apply a palette or a preset first.'
            : `${inc.breakpoints ? 'A zip of the rewritten dist (dist/, manifest with new hashes)' : 'A small zip: plainkit-theme.css'} plus plainkit.custom.json and a README. Includes ${parts.join(' and ')}.`;
        paintDelta();
    }

    function download(bytes, name, type) {
        const a = doc.createElement('a');
        a.href = win.URL.createObjectURL(new win.Blob([bytes], { type }));
        a.download = name;
        a.click();
        win.URL.revokeObjectURL(a.href);
    }

    async function run() {
        const inc = include(); const t = theme();
        state.busy = true; paint();
        try {
            let result;
            if (inc.theme && !inc.breakpoints) result = exportTheme({ version: PK_VERSION, theme: t, shipped: state.shipped });
            else {
                state.distPromise ??= fetchDist(dist, { onprogress: (done, total) => { status.textContent = `Reading the release files: ${done} of ${total}`; } });
                const d = await state.distPromise;
                result = await exportSdk({ dist: d, include: inc, breakpoints: widths(), theme: t });
            }
            download(result.zip, result.name, 'application/zip');
            msg(status, 'success', `Downloaded ${result.name} (${Math.round(result.zip.length / 1024)} KB).`);
        } catch (error) {
            state.distPromise = null;
            log.warn('the export failed', error);
            msg(status, 'error', `The export failed: ${error.message}`);
        } finally { state.busy = false; paint(); }
    }

    function setWidths(w) { for (const [n, el] of fields) if (n in w) { el.value = String(w[n]); el.setAttribute('value', String(w[n])); } paint(); }

    on(chkTheme, 'change', paint); on(chkBp, 'change', paint);
    on(inputsBox, 'input', paint); on(inputsBox, 'change', paint);
    on(exportBtn, 'click', () => { if (!exportBtn.hasAttribute('disabled')) run(); });
    on(cssBtn, 'click', () => { const t = theme(); if (themeCount()) { const r = exportTheme({ version: PK_VERSION, theme: t, shipped: state.shipped }); download(r.css, 'plainkit-theme.css', 'text/css'); msg(status, 'success', 'Downloaded plainkit-theme.css: load it after plainkit.css.'); } });
    on(importBtn, 'click', () => {
        const r = readSettings(String(importBox.value ?? ''), state.names);
        if (r.error) { log.warn(`settings import refused: ${r.error}`); msg(importMsg, 'error', r.error); return; }
        const s = r.settings;
        chkTheme.checked = s.include.theme; chkBp.checked = s.include.breakpoints;
        for (const [el, on2] of [[chkTheme, s.include.theme], [chkBp, s.include.breakpoints]]) { if (on2) el.setAttribute('checked', ''); else el.removeAttribute('checked'); }
        if (s.breakpoints) setWidths(s.breakpoints);
        if (s.include.theme) importTheme(s.theme);
        paint();
        msg(importMsg, 'success', `Imported settings made with Plainkit ${s.baseVersion || 'an unknown release'}.`);
    });

    // The report gives the breakpoint names and the shipped widths, and the delta table its data.
    (async () => {
        try {
            const res = await win.fetch(new URL('breakpoints.report.json', dist).href);
            if (!res.ok) throw new Error(`breakpoints.report.json: ${res.status}`);
            state.report = await res.json();
            state.names = state.report.breakpoints.map(b => b.name);
            state.shipped = Object.fromEntries(state.report.breakpoints.map(b => [b.name, b.width]));
            for (const n of state.names) {
                const el = h(doc, 'pk-input', { type: 'number', label: `${n} (px)`, 'show-label': true, value: state.shipped[n], min: RANGE.min, max: RANGE.max, step: 1, 'data-breakpoint-input': n });
                fields.set(n, el); inputsBox.append(el);
            }
            paint();
        } catch (error) {
            log.warn('the breakpoint report could not be read: the breakpoints part of the tab is off', error);
            chkBp.removeAttribute('checked'); chkBp.checked = false; chkBp.setAttribute('disabled', '');
            msg(problems, 'warning', `Breakpoints need the shipped dist files (${error.message}). The theme can still be exported.`);
            paint();
        }
    })();
    paint();

    return {
        panel, refresh: paint, widths, include, setWidths,
        destroy() { for (const off of listeners) off(); },
    };
}
