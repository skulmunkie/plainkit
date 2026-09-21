// The filter-table pattern, made live: the toolbar's search and status controls filter the table, the applied filters show as removable tags
// (removing one, or "Clear all", resets its control), and a filter typed into the table's own header row shows up in the toolbar too.
// mount(root) works on this sample's own DOM and returns { destroy() }.
import { createLogger } from '../../../js/log.js';

const log = createLogger('pattern:filter-table');

// A filter and how its tag reads; the status control's "Any" means no filter.
const LABELS = { name: 'Search', status: 'Status' };
const NONE = { status: 'Any' };

export default function mount(root) {
    const ac = new AbortController();
    const table = root.querySelector('[data-table]');
    const applied = root.querySelector('[data-applied]');
    const clear = root.querySelector('[data-clear]');
    const controls = new Map([...root.querySelectorAll('[data-field]')].map(c => [c.dataset.field, c]));
    if (!table || !applied || !clear || !controls.size) { log.warn('the filter-table sample needs [data-table], [data-applied], [data-clear] and [data-field] controls', { root }); return { destroy() {} }; }

    // Show a set of filters: the controls, the tags and the (hidden when empty) "Applied" row.
    const show = filters => {
        for (const [key, c] of controls) {
            const v = String(filters[key] ?? '');
            const shown = v === '' ? (NONE[key] ?? '') : v;
            if (c.value !== shown) c.value = shown;
        }
        for (const t of applied.querySelectorAll('pk-tag')) t.remove();
        const active = Object.entries(filters).filter(([key, v]) => String(v ?? '').trim() !== '' && v !== NONE[key]);
        for (const [key, v] of active) {
            const tag = document.createElement('pk-tag');
            tag.setAttribute('removable', ''); tag.dataset.key = key;
            tag.textContent = `${LABELS[key] ?? key}: ${v}`;
            clear.before(tag);
        }
        applied.hidden = active.length === 0;
    };
    const apply = filters => { table.filters = filters; show(filters); };
    // Before the table is defined its prop is not there yet: read the attribute the sample was written with.
    const current = () => {
        if (table.filters && typeof table.filters === 'object') return { ...table.filters };
        try { return JSON.parse(table.getAttribute('filters') || '{}'); } catch (error) { log.warn('the table filters attribute is not JSON: starting with none', error); return {}; }
    };

    const fromControl = e => {
        const c = e.target.closest?.('[data-field]'), key = c?.dataset.field;
        if (!key) return;
        const v = c.value;
        apply({ ...current(), [key]: v === NONE[key] ? '' : v });
    };
    root.addEventListener('input', fromControl, { signal: ac.signal });
    // The table raises pk-filter before it applies the change; its detail is the new set.
    table.addEventListener('pk-filter', e => { if (e.target === table) show(e.detail.filters); }, { signal: ac.signal });
    applied.addEventListener('pk-remove', e => { const key = e.target.dataset.key; if (key) apply({ ...current(), [key]: '' }); }, { signal: ac.signal });
    clear.addEventListener('click', () => apply({}), { signal: ac.signal });

    show(current());
    customElements.whenDefined('pk-table').then(() => { if (!ac.signal.aborted) show(current()); });
    return { destroy() { ac.abort(); } };
}
