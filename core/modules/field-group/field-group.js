// A field group builds the pk-field + pk-input/pk-select/pk-textarea/pk-checkbox block a form hand-writes per field, from a list of
// field specs plus a plain data object: { key, label, kind ('text'|'number'|'email'|'password'|'date'|'time'|'url'|'tel'|'textarea'|
// 'select'|'checkbox', default 'text'), hint, required, min, max, step, minlength, maxlength, pattern, placeholder, options
// ([{value,label}], select only), when(data) }. It only covers a plain field bound 1:1 to data[key] (issue 222's own scoping: "the
// large fraction that are pure boilerplate today") plus, per issue 226, whether that field renders at all; a computed/derived value
// still stays hand-written.
// It puts real pk-* elements in the container's own light DOM (not a shadow tree: a shadow-encapsulated control's commit event would
// retarget to this module's own host on the way out, and pk-form's live validation matches pk-input/pk-select/... by tag name), the
// same technique the layout builder already uses to mount elements it does not own into a container it is given. Each control commits
// through its own documented two-way event (pk-value-change for input/select/textarea, pk-change for checkbox), not raw input/change,
// so a host mirroring data sees exactly what the element itself calls a committed change (STANDARDS.md, "Ownership and reactivity").
// Put the container inside a <form> (a pk-form fits) and validation works with no wiring: every control here is a real
// form-associated element the form already knows how to walk.
//
// `when: (data) => boolean` (default: always visible) gates whether a field renders. A hidden field's pk-field + control are removed
// from the container entirely, not just visually hidden: a removed element is not part of any form's constraint validation, so a
// hidden `required` field never blocks submission (issue 226's own recommendation) without extra wiring. Every field's `when` is
// re-evaluated (not just the field that just committed, since one field's value can gate another's visibility) after every commit and
// on refresh(); this is O(fields) per commit, cheap enough that no batching/debouncing is needed for the sizes this module targets.
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

import { loadElements } from '../../js/loader.js';
import { createLogger } from '../../js/log.js';

const log = createLogger('field-group');
const INPUT_KINDS = new Set(['text', 'number', 'email', 'password', 'date', 'time', 'url', 'tel']);
const COMMIT = { select: 'pk-value-change', textarea: 'pk-value-change', checkbox: 'pk-change' };

function h(doc, tag, props = {}, ...children) {
    const el = doc.createElement(tag);
    for (const [k, v] of Object.entries(props)) if (v !== undefined && v !== null && v !== false) el.setAttribute(k, v === true ? '' : v);
    el.append(...children.filter(c => c !== null && c !== undefined));
    return el;
}

function controlFor(doc, spec) {
    const { key, kind = 'text', required, min, max, step, minlength, maxlength, pattern, placeholder } = spec;
    if (kind === 'select') return h(doc, 'pk-select', { name: key, required, label: spec.label }, ...(spec.options ?? []).map(o => h(doc, 'option', { value: o.value }, o.label)));
    if (kind === 'textarea') return h(doc, 'pk-textarea', { name: key, required, minlength, maxlength, placeholder });
    if (kind === 'checkbox') return h(doc, 'pk-checkbox', { name: key, required });
    if (!INPUT_KINDS.has(kind)) log.warn(`unknown field kind "${kind}" for "${key}", using text`, spec);
    return h(doc, 'pk-input', { type: INPUT_KINDS.has(kind) ? kind : 'text', name: key, required, min, max, step, minlength, maxlength, pattern, placeholder });
}

const set = (control, spec, value) => { if (spec.kind === 'checkbox') control.checked = !!value; else control.value = value ?? ''; };

// Options: fields ([spec]), data (plain object, mutated in place as the user commits changes), onChange(key, value, data).
// Returns { refresh(newData?), destroy() }.
export function mountFieldGroup(container, opts = {}) {
    const { fields = [], data = {}, onChange } = opts;
    const doc = container.ownerDocument;
    const rows = fields.map(spec => {
        const control = controlFor(doc, spec);
        const field = h(doc, 'pk-field', { label: spec.label, hint: spec.hint, required: spec.required }, control);
        set(control, spec, data[spec.key]);
        const handler = e => {
            const value = spec.kind === 'checkbox' ? e.detail.checked : e.detail.value;
            data[spec.key] = value;
            onChange?.(spec.key, value, data);
            applyVisibility(data);
        };
        control.addEventListener(COMMIT[spec.kind] ?? 'pk-value-change', handler);
        return { field, control, spec, handler, visible: true };
    });

    // Re-evaluate every row's `when` (not just the field that changed) and keep the container's children in sync: a hidden field's
    // pk-field is removed from the DOM entirely (so it plays no part in a surrounding form's constraint validation), a visible one is
    // (re)appended in field order -- `append` moves an already-attached node, so this also keeps still-visible fields correctly ordered.
    function applyVisibility(d) {
        for (const row of rows) row.visible = !row.spec.when || !!row.spec.when(d);
        container.append(...rows.filter(r => r.visible).map(r => r.field));
        for (const row of rows) if (!row.visible) row.field.remove();
    }

    applyVisibility(data);
    loadElements(container).catch(e => log.error('a field control did not load', e));
    return {
        refresh(newData) {
            const d = newData ?? data;
            for (const { control, spec } of rows) set(control, spec, d[spec.key]);
            applyVisibility(d);
        },
        destroy() { for (const { field, control, spec, handler } of rows) { control.removeEventListener(COMMIT[spec.kind] ?? 'pk-value-change', handler); field.remove(); } },
    };
}
