// The master-detail pattern, made live: choosing an item marks it and fills the detail card (heading, name, status badge, history) from the
// data-* attributes on its link, back on the Overview tab. When the two columns are stacked (a phone) the detail is scrolled into view.
// mount(root) works on this sample's own DOM and returns { destroy() }.
import { createLogger } from '../../../js/log.js';

const log = createLogger('pattern:master-detail');

export default function mount(root) {
    const ac = new AbortController();
    const list = root.querySelector('[data-list]');
    const detail = root.querySelector('[data-detail]');
    const parts = detail && { name: detail.querySelector('[data-name]'), status: detail.querySelector('[data-status]'), history: detail.querySelector('[data-history]'), tabs: detail.querySelector('[data-tabs]') };
    if (!list || !parts || Object.values(parts).some(p => !p)) { log.warn('the master-detail sample needs [data-list], [data-detail] and the [data-name|status|history|tabs] hooks', { root }); return { destroy() {} }; }

    const links = [...list.querySelectorAll('a[data-id]')];
    const label = new Map(links.map(a => [a, a.textContent]));
    const entry = (heading) => { const t = document.createElement('pk-timeline-item'); t.setAttribute('heading', heading); t.setAttribute('status', 'done'); return t; };

    const select = link => {
        for (const a of links) {
            const on = a === link;
            if (on) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
            if (on) { const s = document.createElement('strong'); s.textContent = label.get(a); a.replaceChildren(s); } else a.textContent = label.get(a);
        }
        const name = label.get(link);
        detail.setAttribute('heading', name);
        parts.name.textContent = name;
        parts.status.textContent = link.dataset.status ?? '';
        parts.status.setAttribute('variant', link.dataset.variant ?? 'muted');
        parts.history.replaceChildren(...(link.dataset.history ?? '').split('|').filter(Boolean).map(entry));
        parts.tabs.setAttribute('value', 'overview');
        // Stacked columns: the detail sits below the list, so bring it into view.
        if (detail.getBoundingClientRect().top >= list.getBoundingClientRect().bottom) detail.scrollIntoView({ block: 'start' });
    };

    list.addEventListener('click', e => {
        const a = e.target.closest?.('a[data-id]');
        if (!a) return;
        e.preventDefault();
        select(a);
    }, { signal: ac.signal });

    return { destroy() { ac.abort(); } };
}
