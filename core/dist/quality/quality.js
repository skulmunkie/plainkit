// The quality checks as a module: mountQuality(container, options) runs the SDK's own page checks (js/quality.js: accessibility, layout,
// spacing, touch targets on a phone, nested scrollers, literal colours, focus indicators) on a live page and shows a score and every
// finding. It is standalone (put it anywhere) and it is the Quality tab of the dev tools. Built only from SDK components (pk-stat,
// pk-table, pk-button); it draws nothing itself.
//
//   const q = await mountQuality(el, { autorun: true });          // checks the page the container is in
//   const r = await q.run();                                      // { score, findings, width }
//
// Options: root (the element or document to check; default the container's document body), around (a function that receives a callback
// and runs it with anything that must not be measured hidden; default hides the module itself, and the dev tools pass their own so the
// dock is left out too), phone (force the phone checks on or off; default on when the window is 640px wide or less), autorun, theme,
// height (any CSS length), onresult (called with each result). Returns { run(), results(), destroy() }. Scoring and rows are in
// js/inspect-logic.js. This is a different thing from the Scorecard: the scorecard scores many targets and the framework; this checks the
// page you are on, right now.

import { collect, evaluate, focusProblems } from '../js/quality.js';
import { pageScore, scoreTone, findingRows } from '../js/inspect-logic.js';
import { ensureStyles, styleUrls } from '../js/mount-support.js';
import { loadElements } from '../js/loader.js';

const STYLES = ['../plainkit.css', '../plainkit-compat.css'];
export const PHONE_MAX = 640;

const CLUSTER = 'cluster cluster--horizontal cluster--gap-sm cluster--align-center cluster--justify-start';

function h(doc, tag, props = {}, ...children) {
    const el = doc.createElement(tag);
    for (const [k, v] of Object.entries(props)) if (v !== undefined && v !== null && v !== false) el.setAttribute(k, v === true ? '' : v);
    el.append(...children.filter(c => c !== null && c !== undefined));
    return el;
}

// Runs the checks now on `root` and returns { score, findings, width }. Synchronous, so a hidden tool never flickers.
export function checkPage(root, { phone } = {}) {
    const doc = root.ownerDocument ?? root;
    const win = doc.defaultView;
    const target = root.querySelectorAll ? root : doc.body;
    const isPhone = phone ?? win.innerWidth <= PHONE_MAX;
    const findings = [...evaluate(collect(target), { phone: isPhone }), ...focusProblems(target)];
    return { score: pageScore(findings), findings, width: win.innerWidth };
}

export async function mountQuality(container, options = {}) {
    const { theme, height, autorun, onresult } = options;
    const doc = container.ownerDocument;
    const win = doc.defaultView;
    await ensureStyles(styleUrls(STYLES, import.meta.url), doc);

    const run = h(doc, 'pk-button', { size: 'mini', variant: 'primary' }, 'Check this page');
    const status = h(doc, 'span', { class: 'muted', role: 'status' }, 'Not run yet');
    const score = h(doc, 'pk-stat', { label: 'Page score', value: '-', tile: true, subtext: 'Accessibility, layout, spacing, touch targets and focus' });
    const table = h(doc, 'pk-table', {
        label: 'Findings', density: 'compact', stickyHeader: true, maxHeight: '16rem',
        columns: JSON.stringify([{ key: 'severity', label: 'Severity' }, { key: 'check', label: 'Check' }, { key: 'selector', label: 'Where' }, { key: 'message', label: 'What is wrong' }, { key: 'count', label: 'Times', align: 'end' }]),
    });
    const root = h(doc, 'section', { class: 'ql-module', 'aria-label': 'Quality checks' },
        h(doc, 'div', { class: CLUSTER }, run, status), h(doc, 'div', { class: 'u-mt-3' }, score), h(doc, 'div', { class: 'u-mt-3' }, table));
    if (theme) root.setAttribute('data-theme', theme);
    if (height) { root.style.setProperty('height', height); root.style.setProperty('overflow', 'auto'); }
    container.replaceChildren(root);
    loadElements(root).catch(() => {});

    // What must not be measured: the module itself unless the host says otherwise (the dev tools hide their whole dock).
    const around = options.around ?? (fn => { const before = root.hidden; root.hidden = true; try { return fn(); } finally { root.hidden = before; } });
    let last = null;

    function check() {
        const target = options.root ?? doc.body;
        last = around(() => checkPage(target, { phone: options.phone }));
        const rows = findingRows(last.findings);
        score.setAttribute('value', String(last.score));
        score.setAttribute('tone', scoreTone(last.score));
        table.setAttribute('rows', JSON.stringify(rows));
        status.textContent = rows.length ? `${rows.length} finding${rows.length === 1 ? '' : 's'} at ${last.width}px wide` : `No findings at ${last.width}px wide`;
        onresult?.(last);
        return last;
    }
    run.addEventListener('click', check);
    if (autorun) check();
    return { run: async () => check(), results: () => last, destroy() { run.removeEventListener('click', check); root.remove(); } };
}
