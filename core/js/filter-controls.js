// The one filter vocabulary shared by the page types that draw a filter bar (pk-list-page, pk-dashboard-page): a filter def
// { key, type, label, options?, anyLabel? } becomes a real pk-input or pk-select that reports through pk-value-change and carries its key in data-key.
// pk-input carries every scalar type through its own `type` attribute (STANDARDS.md: only existing components).
const CONTROL = { text: 'pk-input', email: 'pk-input', number: 'pk-input', date: 'pk-input', select: 'pk-select' };

/** Builds the control element for one filter def in `doc`. */
export function filterControl(doc, f) {
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
