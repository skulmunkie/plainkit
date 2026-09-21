// The notifications pattern, made live: each button raises a toast, the bell counts what was raised and clears when it is pressed.
// mount(root) works on this sample's own DOM (root) and returns { destroy() }; the toasts it raised are removed by destroy().
import { createLogger } from '../../../js/log.js';

const log = createLogger('pattern:notifications');

export default function mount(root) {
    const ac = new AbortController();
    const raised = new Set();
    const badge = root.querySelector('[data-unread]');
    let unread = Number(badge?.getAttribute('count')) || 0;
    if (!badge || !root.querySelector('[data-bell]')) log.warn('the notifications sample needs [data-bell] and [data-unread]', { root });

    const paint = () => { if (!badge) return; badge.hidden = unread === 0; badge.setAttribute('count', String(unread)); };
    // PkToast is defined by the toast stack in the sample: nothing can be shown before it has loaded.
    const toast = (message, options) => {
        const PkToast = globalThis.PkToast;
        if (!PkToast) { log.warn('PkToast is not defined yet: the toast stack has not loaded', { message }); return; }
        const t = PkToast.show(message, options);
        raised.add(t);
        t.addEventListener('pk-dismiss', () => raised.delete(t), { once: true, signal: ac.signal });
        unread += 1; paint();
    };
    const say = {
        saved: () => toast('Item saved.', { kind: 'success' }),
        archived: () => toast('Item archived.', { action: { label: 'Undo', onClick: () => toast('Archive undone.') } }),
        failed: () => toast('The export failed.', { kind: 'danger', action: { label: 'Retry', onClick: () => toast('Export ready.', { kind: 'success' }) } }),
    };

    root.addEventListener('click', e => {
        const b = e.target.closest?.('[data-toast]');
        if (b) { const run = say[b.dataset.toast]; if (run) run(); else log.warn(`data-toast="${b.dataset.toast}" is not one of ${Object.keys(say).join(', ')}`, { button: b }); return; }
        if (e.target.closest?.('[data-bell]')) { unread = 0; paint(); }
    }, { signal: ac.signal });

    return { destroy() { ac.abort(); for (const t of raised) t.remove(); raised.clear(); } };
}
