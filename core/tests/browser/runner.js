// In-browser test runner for the SDK's custom elements. Open /tests/browser/ in a visible tab. With node tools/serve.mjs --write-reports it
// also posts an attested report (tests/browser/report.json): the results plus a SHA-256 of every element source it covered, so a guard
// test can fail when a component changed after its last run without needing a browser in CI.
import { loadElements } from '../../js/loader.js';
import { cases } from './cases.js';

const stageEl = document.getElementById('stage');
const registryUrl = new URL('../../elements/registry.js', import.meta.url).href;

class Failure extends Error {}
const fmt = v => (typeof v === 'string' ? JSON.stringify(v) : String(v));

const t = {
    ok(v, msg = 'expected a truthy value') { if (!v) throw new Failure(msg); },
    eq(a, b, msg = '') { if (a !== b) throw new Failure(`${msg ? msg + ': ' : ''}expected ${fmt(b)}, got ${fmt(a)}`); },
    stage(html) { stageEl.replaceChildren(); const d = document.createElement('div'); d.innerHTML = html; stageEl.append(d); return d; },
    async load(root) { await loadElements(root, { registry: registryUrl }); const tags = [...root.querySelectorAll('*')].map(e => e.localName).filter(n => n.startsWith('pk-')); await Promise.all([...new Set(tags)].map(n => customElements.whenDefined(n))); await t.settle(); },
    async mount(html) { const host = t.stage(html); await t.load(host); return host.firstElementChild; },
    // Two message-channel hops: unlike requestAnimationFrame and timers, they are not throttled in a background tab.
    settle() { const hop = () => new Promise(r => { const c = new MessageChannel(); c.port1.onmessage = () => r(); c.port2.postMessage(0); }); return hop().then(hop); },
    key(el, key) { el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, composed: true, cancelable: true })); },
    tabsHtml(activation = 'auto') {
        return `<pk-tabs activation="${activation}"><pk-tab value="a">A</pk-tab><pk-tab value="b">B</pk-tab><pk-tab value="c" disabled>C</pk-tab><pk-tab-panel value="a">Panel A</pk-tab-panel><pk-tab-panel value="b">Panel B</pk-tab-panel></pk-tabs>`;
    },
};

// Every source the tests cover, hashed the way tests/elements-attest.test.mjs hashes them on disk (LF-normalised SHA-256, hex).
async function sha(text) {
    const bytes = new TextEncoder().encode(text.replace(/\r\n/g, '\n'));
    return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function sources() {
    const registry = (await import(registryUrl)).default;
    const names = Object.keys(registry).map(tag => tag.slice(3));
    const files = ['js/element.js', 'js/element-core.js', 'js/loader.js', 'tests/browser/cases.js', 'tests/browser/cases-overlays.js', 'tests/browser/cases-data-display.js', 'tests/browser/cases-forms.js', 'tests/browser/cases-tools.js', 'tests/browser/cases-headers.js', 'tests/browser/cases-layout.js', 'tests/browser/cases-icon-time.js', 'tests/browser/cases-workspace.js', 'tests/browser/cases-guides.js', 'tests/browser/cases-app.js', 'js/app.js', 'js/app/module.js', 'js/app/host.js', 'js/app/boundary.js', 'tests/browser/runner.js'];
    for (const n of names) for (const ext of ['html', 'css', 'meta.json', 'js']) files.push(`elements/${n}/${n}.${ext}`);
    const out = {};
    for (const f of files.sort()) { const res = await fetch(new URL(`../../${f}`, import.meta.url)); if (res.ok) out[f] = await sha(await res.text()); }
    return out;
}

const list = document.getElementById('results');
const results = [];
const CASE_TIMEOUT_MS = 60000;
for (const [name, fn] of cases) {
    const started = performance.now();
    const li = document.createElement('li');
    // A case that never settles must fail by name, not stall the whole run (and the report) forever.
    let timer;
    const stalled = new Promise((_, reject) => { timer = setTimeout(() => reject(new Failure(`did not finish in ${CASE_TIMEOUT_MS / 1000} s`)), CASE_TIMEOUT_MS); });
    try { await Promise.race([fn(t), stalled]); clearTimeout(timer); li.className = 'tb-pass'; li.textContent = name; results.push({ name, ok: true, ms: Math.round(performance.now() - started) }); }
    catch (e) { li.className = 'tb-fail'; li.textContent = `${name}: ${e.message}`; results.push({ name, ok: false, ms: Math.round(performance.now() - started), error: String(e.message ?? e) }); }
    list.append(li);
}
stageEl.replaceChildren();

const passed = results.filter(r => r.ok).length; const failed = results.length - passed;
const summary = document.getElementById('summary');
summary.textContent = failed ? `${failed} of ${results.length} failed` : `All ${results.length} passed`;
document.title = `${failed ? 'FAIL' : 'PASS'} - SDK element tests`;
document.documentElement.dataset.done = failed ? 'fail' : 'pass';

const report = { ran: new Date().toISOString(), browser: navigator.userAgent, passed, failed, results, sources: await sources() };
window.__report = report;
try {
    const res = await fetch('/__report?kind=browser', { method: 'POST', body: JSON.stringify(report) });
    if (res.status === 204) summary.textContent += ' (report saved)';
} catch { /* not served with --write-reports: the page still shows the results */ }
