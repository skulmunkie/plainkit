// In-browser test runner for the SDK's custom elements. Open /tests/browser/ in a visible tab. With node tools/serve.mjs --write-reports it
// also posts its report (tests/browser/report.json, local scratch output): the results plus a SHA-256 of every element source it covered, so a guard
// (nothing checks it against the sources any more; it is a local manual safety net).
// Targeted run: /tests/browser/?filter=a,b&elements=x,y keeps the cases whose name contains a filter substring or names an element (case-filter.js); the report is posted and says how many of the total were selected.
// Filter: /tests/browser/?only=<text>[&times=N] runs only the cases whose name contains <text> (N times over, default 1) and posts no report, to hammer one intermittent case.
import { loadElements } from '../../js/loader.js';
import { cases } from './cases.js';
import { parseList, selectCases } from './case-filter.js';

const stageEl = document.getElementById('stage');
const registryUrl = new URL('../../elements/registry.js', import.meta.url).href;

class Failure extends Error {}
const fmt = v => (typeof v === 'string' ? JSON.stringify(v) : String(v));

let lastStep = ''; const step = s => { lastStep = s; }; // the last helper a case called: named in the timeout message and the trace
const t = {
    ok(v, msg = 'expected a truthy value') { if (!v) throw new Failure(msg); },
    eq(a, b, msg = '') { if (a !== b) throw new Failure(`${msg ? msg + ': ' : ''}expected ${fmt(b)}, got ${fmt(a)}`); },
    stage(html) { stageEl.replaceChildren(); const d = document.createElement('div'); d.innerHTML = html; stageEl.append(d); return d; },
    async load(root) { step('t.load'); await loadElements(root, { registry: registryUrl }); const tags = [...root.querySelectorAll('*')].map(e => e.localName).filter(n => n.startsWith('pk-')); await Promise.all([...new Set(tags)].map(n => customElements.whenDefined(n))); await t.settle(); },
    async mount(html) { const host = t.stage(html); await t.load(host); return host.firstElementChild; },
    // Two message-channel hops: unlike requestAnimationFrame and timers, they are not throttled in a background tab.
    settle() { step('t.settle'); const hop = () => new Promise(r => { const c = new MessageChannel(); c.port1.onmessage = () => r(); c.port2.postMessage(0); }); return hop().then(hop); },
    key(el, key) { el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, composed: true, cancelable: true })); },
    tabsHtml(activation = 'auto') {
        return `<pk-tabs activation="${activation}"><pk-tab value="a">A</pk-tab><pk-tab value="b">B</pk-tab><pk-tab value="c" disabled>C</pk-tab><pk-tab-panel value="a">Panel A</pk-tab-panel><pk-tab-panel value="b">Panel B</pk-tab-panel></pk-tabs>`;
    },
};

// Every source the tests cover, hashed (LF-normalised SHA-256, hex) so a report says which sources it covered.
async function sha(text) {
    const bytes = new TextEncoder().encode(text.replace(/\r\n/g, '\n'));
    return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function sources() {
    const registry = (await import(registryUrl)).default;
    // each element's folder as the registry names it: ./<name>/<name>.element.js, or ../<tier folder>/<name>/<name>.element.js (#767)
    const stems = Object.values(registry).map(mod => new URL(mod, 'http://x/elements/registry.js').pathname.slice(1).replace(/\.element\.js$/, ''));
    const files = ['js/element.js', 'js/element-core.js', 'js/loader.js', 'tests/browser/cases.js', 'tests/browser/cases-overlays.js', 'tests/browser/cases-data-display.js', 'tests/browser/cases-forms.js', 'tests/browser/cases-lookup-picker.js', 'tests/browser/cases-markdown-editor.js', 'tests/browser/cases-field-group.js', 'tests/browser/cases-record-form.js', 'tests/browser/cases-modules-mount.js', 'tests/browser/cases-tools.js', 'tests/browser/cases-devtools-workspace.js', 'tests/browser/cases-headers.js', 'tests/browser/cases-layout.js', 'tests/browser/cases-icon-time.js', 'tests/browser/cases-workspace.js', 'tests/browser/cases-dock.js', 'tests/browser/cases-tray.js', 'tests/browser/cases-design-surface.js', 'tests/browser/cases-canvas.js', 'tests/browser/cases-extras.js', 'tests/browser/extras-frame.html', 'tests/browser/extras-frame.js', 'tests/browser/extras-core-only/elements/registry.js', 'tests/browser/cases-guides.js', 'tests/browser/cases-landing.js', 'tests/browser/cases-app.js', 'tests/browser/cases-navbar.js', 'tests/browser/cases-gallery.js', 'tests/browser/navbar-frame.html', 'tests/browser/navbar-frame.js', 'tests/browser/table-frame.html', 'tests/browser/table-frame.js', 'tests/browser/cases-app-shell.js', 'js/app.js', 'js/app/module.js', 'js/app/host.js', 'js/app/boundary.js', 'js/tasks.js', 'js/app/app.js', 'js/app/config.js', 'js/app/nav.js', 'js/app/shell.js', 'js/router.js', 'base/a11y.css', 'samples/app/index.html', 'tests/browser/case-filter.js', 'tests/browser/runner.js'];
    for (const stem of stems) for (const ext of ['html', 'css', 'meta.json', 'js']) files.push(`${stem}.${ext}`);
    const out = {};
    for (const f of files.sort()) { const res = await fetch(new URL(`../../${f}`, import.meta.url)); if (res.ok) out[f] = await sha(await res.text()); }
    return out;
}

const list = document.getElementById('results');
const results = [];
// Hard per-case limit. The slowest legitimate case takes about 20 s (the one exception, a phone-width mountApp case, took 59 s in a full run and is its own defect); it is not to be widened to hide a hang. A case that is
// only waiting fails by name here and the run moves on; a case that freezes the page (a synchronous or microtask loop) cannot be timed out from inside it, so the page also
// beats every few seconds and scripts/attest-browser.mjs restarts the page past a case whose beat stops (resume: ?from=<n>).
const CASE_TIMEOUT_MS = 60000;
const BEAT_MS = 3000;
const params = new URLSearchParams(location.search); const only = params.get('only'); const times = only ? Math.max(1, Number(params.get('times')) || 1) : 1;
const filterList = parseList(params.get('filter')); const elementList = parseList(params.get('elements'));
const all = only ? Array.from({ length: times }, () => cases.filter(([n]) => n.includes(only))).flat() : selectCases(cases, { filter: filterList, elements: elementList });
const from = Math.max(1, Number(params.get('from')) || 1); // resume after a restart: the cases before this number (1-based, of the selected ones) were already run
const chosen = all.slice(from - 1);
// Case isolation (#1127): every case starts from, and leaves, empty storage. The demo apps and theme cases write to the harness origin's
// localStorage (pk.app, saved themes), so a case outcome used to depend on which cases ran before it.
const resetStorage = () => { localStorage.clear(); sessionStorage.clear(); };
// Progress for the local server (node core/tools/serve.mjs --write-reports prints it; scripts/attest-browser.mjs traces it). Best effort: a plain static server ignores it.
let caseIndex = from - 1;
const progress = (state, fields = {}) => fetch('/__progress', { method: 'POST', body: JSON.stringify({ state, i: caseIndex, n: all.length, ...fields }), keepalive: true }).catch(() => undefined);
const beat = setInterval(() => progress('beat', { step: lastStep }), BEAT_MS);
for (const [name, fn] of chosen) {
    resetStorage();
    caseIndex++; lastStep = ''; progress('start', { name });
    const started = performance.now();
    const li = document.createElement('li');
    let timer;
    const stalled = new Promise((_, reject) => { timer = setTimeout(() => reject(new Failure(`did not finish in ${CASE_TIMEOUT_MS / 1000} s (last helper called: ${lastStep || 'none'})`)), CASE_TIMEOUT_MS); });
    try { await Promise.race([fn(t), stalled]); li.className = 'tb-pass'; li.textContent = name; results.push({ name, ok: true, ms: Math.round(performance.now() - started) }); }
    catch (e) { li.className = 'tb-fail'; li.textContent = `${name}: ${e.message}`; results.push({ name, ok: false, ms: Math.round(performance.now() - started), error: String(e.message ?? e) }); }
    clearTimeout(timer);
    list.append(li);
    const r = results.at(-1); progress('end', { name, ok: r.ok, ms: r.ms, error: r.error });
    resetStorage();
}
clearInterval(beat);
stageEl.replaceChildren();

const passed = results.filter(r => r.ok).length; const failed = results.length - passed;
const summary = document.getElementById('summary');
summary.textContent = failed ? `${failed} of ${results.length} failed` : `All ${results.length} passed`;
document.title = `${failed ? 'FAIL' : 'PASS'} - SDK element tests`;
document.documentElement.dataset.done = failed ? 'fail' : 'pass';

const targeted = Boolean(filterList.length || elementList.length);
const report = { ran: new Date().toISOString(), browser: navigator.userAgent, passed, failed, selected: results.length, totalCases: cases.length, filter: targeted ? { filter: filterList, elements: elementList } : null, results, sources: await sources() };
window.__report = report;
try {
    const res = await fetch('/__report?kind=browser', { method: 'POST', body: JSON.stringify(report) });
    if (res.status === 204) summary.textContent += ' (report saved)';
} catch { /* not served with --write-reports: the page still shows the results */ }
