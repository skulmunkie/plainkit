// mountPage, loaded on first use (js/app/module.js keeps a thin wrapper, #494 offset: mountApp never needs it, so it stays out of the entry graph).
import { createLogger } from '../../log.js';
import { setTheme, currentTheme, toggleTheme } from '../../theme-core.js';
import { pageTypeFor } from '../module.js';

const isFn = v => typeof v === 'function';

export async function mountPage(container, page, options = {}) {
    const type = typeof page === 'string' ? page : page?.type;
    if (typeof type !== 'string') throw new TypeError('mountPage: page must be a type id, or { type, config }');
    const factory = pageTypeFor({}, type);
    if (!isFn(factory)) throw new TypeError(`mountPage: page type "${type}" is not available`);
    const config = typeof page === 'string' ? undefined : page?.config;
    const { id = 'page', auth = null, settings = null, store = null, root = container.ownerDocument?.documentElement } = options;
    const lg = createLogger(`app:${id}`);
    const ac = new AbortController();
    const offs = new Set();
    const run = (fn, what) => { try { fn?.(); } catch (e) { lg.error(`${what} threw`, e); } };
    const track = off => { if (ac.signal.aborted) { lg.warn('mountPage: used after destroy() ignored'); return off; } offs.add(off); return off; };
    const ctx = {
        id, auth, settings, store, log: lg, route: null, page: null, tasks: null, notify: null, dialogs: null, signal: ac.signal,
        navigate: () => (lg.warn('navigate: mountPage has no router'), false),
        href: () => null,
        on: (t, type, fn, o) => { t.addEventListener(type, fn, o); return track(() => t.removeEventListener(type, fn, o)); },
        observe: (o, t, opt) => { o.observe(t, opt); track(() => o.disconnect()); return o; },
        after(ms, fn) { const t = setTimeout(() => { offs.delete(off); run(fn, 'after() callback'); }, ms); const off = () => clearTimeout(t); return track(off); },
        theme: root ? {
            get name() { return currentTheme(root); },
            set: n => setTheme(root, n),
            toggle: () => toggleTheme(root),
            subscribe(fn) {
                const mo = new (container.ownerDocument?.defaultView?.MutationObserver ?? MutationObserver)(() => fn(currentTheme(root)));
                ctx.observe(mo, root, { attributes: true, attributeFilter: ['data-theme'] });
                return () => mo.disconnect();
            },
        } : null,
    };
    const out = await factory(container, config, ctx);
    const cleanup = typeof out === 'function' ? out : out?.destroy?.bind(out);
    return {
        destroy() {
            ac.abort();
            for (const off of [...offs].reverse()) run(off, 'cleanup');
            offs.clear();
            run(cleanup, 'page cleanup');
        },
    };
}
