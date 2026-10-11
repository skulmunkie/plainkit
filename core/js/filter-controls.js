// The one filter vocabulary shared by the page types that draw a filter bar (pk-list-page, pk-dashboard-page): a filter def
// { key, type, label, options?, anyLabel? } becomes a real pk-input or pk-select that reports through pk-value-change and carries its key in data-key.
// pk-input carries every scalar type through its own `type` attribute (STANDARDS.md: only existing components).
const CONTROL = { text: 'pk-input', email: 'pk-input', number: 'pk-input', date: 'pk-input', select: 'pk-select' };

// type 'multiselect': a fieldset of pk-checkbox, one per option. Its `value` is the array of ticked option values (set it to [] or '' to untick all);
// it reports pk-value-change { value: [...] } like every other control, so a host reads one array per filter key.
function multiControl(doc, f) {
    const el = doc.createElement('fieldset'), legend = doc.createElement('legend');
    legend.textContent = f.label ?? f.key;
    el.append(legend);
    el.dataset.key = f.key;
    el.setAttribute('part', 'multiselect');
    const boxes = (f.options ?? []).map(o => {
        const box = doc.createElement('pk-checkbox');
        box.value = String(o.value ?? o); box.label = box.textContent = o.label ?? String(o);
        return box;
    });
    el.append(...boxes);
    Object.defineProperty(el, 'value', {
        get: () => boxes.filter(b => b.checked).map(b => b.value),
        set: v => { const on = Array.isArray(v) ? v.map(String) : []; for (const b of boxes) b.checked = on.includes(b.value); },
    });
    el.addEventListener('pk-change', e => {
        e.stopPropagation();
        el.dispatchEvent(new CustomEvent('pk-value-change', { bubbles: true, composed: true, detail: { value: el.value } }));
    });
    return el;
}

/** Builds the control element for one filter def in `doc`. */
export function filterControl(doc, f) {
    if (f.type === 'multiselect') return multiControl(doc, f);
    const tag = CONTROL[f.type] ?? 'pk-input';
    const el = doc.createElement(tag);
    el.label = f.label ?? f.key;
    el.showLabel = true;
    el.dataset.key = f.key;
    if (tag === 'pk-input') el.type = f.type ?? 'text';
    if (tag === 'pk-select') {
        const any = doc.createElement('option');
        any.value = ''; any.textContent = f.anyLabel ?? 'Any';
        el.append(any);
        for (const o of f.options ?? []) { const opt = doc.createElement('option'); opt.value = String(o.value ?? o); opt.textContent = o.label ?? String(o); el.append(opt); }
    }
    return el;
}
