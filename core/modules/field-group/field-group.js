// A field group draws the pk-field + control block a form hand-writes per field, from a list of field specs plus a plain data object. It is now a thin
// wrapper over the pk-field-group element (components/field-group), which owns everything that used to live here: the kind table, the commit events, the
// conditional fields, the form value and the validity (so a pk-form around it lists and shows every problem). This module keeps the call shape it always had:
//
//   import { mountFieldGroup } from './plainkit/modules/field-group/field-group.js';
//   const group = mountFieldGroup(document.getElementById('fields'), {
//       fields: [
//           { key: 'name', label: 'Name', required: true },
//           { key: 'qty', label: 'Quantity', kind: 'number', min: '1', required: true },
//           { key: 'status', label: 'Status', kind: 'select', options: [{ value: 'open', label: 'Open' }, { value: 'closed', label: 'Closed' }] },
//           { key: 'note', label: 'Business note', required: true, when: data => data.status === 'closed' },
//       ],
//       data: order,
//       onChange: (key, value, data) => console.log(key, value, data),
//   });
//   group.refresh(nextOrder); // load a different record into the same controls
//   group.destroy();
//
// A spec is { key, label, kind ('text'|'number'|'email'|'password'|'date'|'time'|'url'|'tel'|'textarea'|'select'|'checkbox'|'switch'|'range'|'combobox'),
// hint, required, min, max, step, minlength, maxlength, pattern, placeholder, options ([{value,label}]), when }. `when` is a function of the data (the
// element's own `when` is data, { field, equals | in | not }, and is passed through as it is). `data` is mutated in place as the user commits changes, as
// before. Put the container inside a <form> (a pk-form fits): the element is form-associated, so validation, the form value and a reset work with no wiring.
import { loadElements } from '../../js/loader.js';
import { createLogger } from '../../js/log.js';
import { on } from '../../js/mount-support.js';

const log = createLogger('field-group');

// Options: fields ([spec]), data (plain object, mutated in place as the user commits changes), onChange(key, value, data).
// Returns { refresh(newData?), destroy() }.
export function mountFieldGroup(container, opts = {}) {
    const { fields = [], onChange } = opts;
    let data = opts.data ?? {};
    const el = container.ownerDocument.createElement('pk-field-group');
    // A `when` function cannot be data: it stays here and gates the field through the element's visible() callback; a `when` object goes through.
    const gates = new Map(fields.filter(f => typeof f.when === 'function').map(f => [f.key, f.when]));
    el.fields = fields.map(({ when, ...spec }) => (typeof when === 'function' || when === undefined ? spec : { ...spec, when }));
    el.visible = (spec, values) => { const gate = gates.get(spec.key); return !gate || Boolean(gate(values)); };
    el.values = { ...data };
    const stop = on(el, 'pk-field-change', e => {
        data[e.detail.key] = e.detail.value;
        onChange?.(e.detail.key, e.detail.value, data);
    });
    container.append(el);
    loadElements(container).catch(e => log.error('a field control did not load', e));
    return {
        refresh(newData) {
            data = newData ?? data;
            el.values = { ...data };
        },
        destroy() { stop(); el.remove(); },
    };
}
