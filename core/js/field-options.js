// js/field-options.js: optionsBy of a field spec (#2011), loaded by pk-field-group only when a spec declares it. A select or combobox whose options follow another field:
// { field, map: { <value of that field>: [{ value, label }] }, default? }. The options are swapped when that value changes; an answer no longer listed becomes the first
// option (the empty one with a placeholder) and is announced as pk-field-change.
import { selectOptions, writeValue } from './field-kinds.js';

const same = (a, b) => String(a ?? '') === String(b ?? '');
const list = v => (Array.isArray(v) ? v : []);

export function apply(group, row) {
    const { spec, kind, control } = row, by = spec.optionsBy, key = spec.key;
    if (!by || !control || (kind !== 'select' && kind !== 'combobox')) return;
    const options = list(by.map?.[group.$vals[by.field]] ?? by.default), sig = JSON.stringify(options);
    if (row.sig === sig) return;
    const first = row.sig === undefined;
    row.sig = sig;
    if (kind === 'select') control.options = selectOptions({ ...spec, options });
    else control.replaceChildren(...options.map(o => Object.assign(group.ownerDocument.createElement('option'), { value: o.value, textContent: o.label ?? o.value })));
    let v = group.$vals[key];
    if (!options.some(o => same(o.value, v))) {
        v = spec.placeholder ? '' : String(options[0]?.value ?? '');
        group.own(group.$vals = { ...group.$vals, [key]: v });
        if (!first) queueMicrotask(() => group.emit('pk-field-change', { key, value: v, values: { ...group.$vals } }));
    }
    writeValue(control, kind, v);
}
