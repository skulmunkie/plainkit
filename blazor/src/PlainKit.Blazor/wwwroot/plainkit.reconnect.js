// The reconnect banner for Blazor Server (#1714, phase 2): builds the banner inside #components-reconnect-modal, paints the view that plainkit/js/reconnect.js computes into it and acts on its buttons.
// Loaded by the module script <PkReconnect /> writes (so it runs under a strict CSP and on a prerendered page) and, idempotently, by the bridge (startReconnect, which also creates the element when the
// page has none: PkApp with PkOptions.Reconnect). Blazor-only: not part of the npm package. The framework drives #components-reconnect-modal: on .NET 10 it raises a non-bubbling
// `components-reconnect-state-changed` on that element, so the listener is a capture listener on document. No timer or retry loop here: the policy is core's.
import { createReconnect, DEFAULTS } from './plainkit/js/reconnect.js';
import { createLogger } from './plainkit/js/log.js';

const log = createLogger('reconnect');
const ACTS = ['tryNow', 'reload', 'cancel', 'resume'];
let running = null;

/** What to show for a view: pure, so node tests it. `s` is the merged strings. */
export function describe(view, s) {
    const fill = (t, n) => t.replace('{0}', n);
    const kind = view?.kind ?? null;
    return {
        kind, text: view?.text ?? '',
        detail: !view ? '' : view.countdown != null ? fill(s.reloadIn, view.countdown) : view.gaveUp ? s.stillTrying : kind === 'busy' && view.attempt > 1 ? fill(s.attemptLabel, view.attempt) : '',
        tone: kind === 'busy' || kind === 'paused' ? 'info' : 'warning',
        show: { spinner: kind === 'busy', tryNow: kind === 'failed', reload: kind === 'failed' || kind === 'ended', cancel: view?.countdown != null, resume: kind === 'paused' },
    };
}

const el = (tag, attrs = {}, ...kids) => { const e = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); e.append(...kids); return e; };

/** The banner: a pk-alert (its role announces it: status while busy, alert once something is wrong) with a spinner, the text, a detail the screen reader skips and the action buttons. */
function build(root) {
    root.append(
        el('link', { rel: 'stylesheet', href: new URL('plainkit.reconnect.css', import.meta.url).href }),
        el('div', { 'data-part': 'bar', hidden: '' },
            el('pk-alert', { banner: '', kind: 'info', 'data-part': 'alert' },
                el('pk-spinner', { size: 'sm', label: '', 'data-part': 'spinner', hidden: '' }),
                el('span', { 'data-part': 'text' }), ' ', el('span', { 'data-part': 'detail', 'aria-hidden': 'true' }),
                el('span', { slot: 'action' }, ...ACTS.map(a => el('pk-button', { size: 'mini', 'data-act': a, hidden: '', ...(a === 'reload' || a === 'resume' ? { variant: 'primary' } : {}) }))))));
}

/** Starts the banner (idempotent). `json` is PkReconnectOptions as the C# side serialises it; the element on the page wins when it has its own. */
export function startReconnect(json) {
    let root = document.getElementById('components-reconnect-modal');
    if (running) { if (running.root === root && root?.isConnected) return running; running.stop(); } // a prerendered element Blazor replaced: start again on the live one
    if (!root && !json) return null;
    if (!root) { root = el('div', { id: 'components-reconnect-modal', 'data-pk-reconnect': json }); document.body.append(root); }
    if (!root.dataset.pkReconnect || (root.hasAttribute('data-pk-started') && running?.root !== root)) return null; // no options, or another copy of this module (the fingerprinted and the plain URL are two modules) runs it
    root.setAttribute('data-pk-started', '');
    const cfg = JSON.parse(root.dataset.pkReconnect), strings = { ...DEFAULTS.strings, ...cfg.strings };
    if (!root.querySelector('[data-part="bar"]')) build(root);
    const part = n => root.querySelector(`[data-part="${n}"]`), act = n => root.querySelector(`[data-act="${n}"]`);
    for (const n of ACTS) act(n).textContent = strings[n];
    let inert = [], before = null;

    const paint = view => {
        const d = describe(view, strings);
        part('bar').hidden = !view; if (view) root.dataset.kind = d.kind; else delete root.dataset.kind;
        part('alert').setAttribute('kind', d.tone); part('text').textContent = d.text; part('detail').textContent = d.detail;
        part('spinner').hidden = !d.show.spinner;
        for (const n of ACTS) act(n).hidden = !d.show[n];
        if (!cfg.modal) return;
        if (!view) { for (const c of inert) c.inert = false; inert = []; before?.focus?.(); before = null; return; }
        if (!inert.length) { before = document.activeElement; inert = [...document.body.children].filter(c => !c.contains(root) && !c.inert); for (const c of inert) c.inert = true; }
        if (d.kind === 'failed' || d.kind === 'ended') act('reload').focus();
    };

    const api = createReconnect({
        now: Date.now, rand: Math.random, visible: () => document.visibilityState === 'visible',
        setTimeout: (f, ms) => setTimeout(f, ms), clearTimeout: id => clearTimeout(id),
        storage: (() => { try { return window.sessionStorage; } catch (e) { log.debug('sessionStorage is not available; the reload loop guard is off', e); return null; } })(),
        probe: async () => {
            const ac = new AbortController(), t = setTimeout(() => ac.abort(), 3000);
            try { return (await fetch(cfg.probeUrl ?? '/', { method: 'HEAD', cache: 'no-store', signal: ac.signal })).ok; }
            catch (e) { log.debug('the probe did not get through', e); return false; }
            finally { clearTimeout(t); }
        },
        reload: () => location.reload(),
        resume: () => window.Blazor?.resumeCircuit?.(),
        onView: paint,
    }, { autoReload: cfg.autoReload, countdown: cfg.countdown, strings });

    const onState = e => api.onState(e.detail);
    const onClick = e => {
        const a = e.target.closest?.('[data-act]')?.dataset.act;
        if (a === 'reload') api.reloadNow(); else if (a === 'cancel') api.cancel(); else if (a === 'resume') api.resume();
        else if (a === 'tryNow') Promise.resolve(window.Blazor?.reconnect?.()).catch(err => log.warn('Blazor.reconnect() failed', err));
    };
    document.addEventListener('components-reconnect-state-changed', onState, true);
    root.addEventListener('click', onClick);
    return running = { root, stop() { document.removeEventListener('components-reconnect-state-changed', onState, true); root.removeEventListener('click', onClick); api.dispose(); paint(null); root.removeAttribute('data-pk-started'); running = null; } };
}

export const stopReconnect = () => running?.stop();

if (typeof document !== 'undefined') startReconnect();
