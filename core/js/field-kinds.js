// The one table of what a field spec becomes: its kind picks the control, the control's own commit event and the way to read and write its value.
// pk-field-group renders from it, js/page-fields.js (tool-page and settings-page) reads the tag from it, and the rules for a conditional field live here too.
// Only existing elements (STANDARDS.md): pk-input carries every scalar type through its `type`.
export const INPUT_KINDS = ['text', 'number', 'email', 'password', 'date', 'time', 'url', 'tel'];
const TAGS = { textarea: 'pk-textarea', select: 'pk-select', checkbox: 'pk-checkbox', switch: 'pk-switch', range: 'pk-range', combobox: 'pk-combobox' };

/** The element tag a field kind renders (pk-input for every scalar type and for a kind it does not know). */
export const controlTag = kind => TAGS[kind] ?? 'pk-input';

/** Whether the control holds a boolean (`checked`) rather than a string (`value`). */
export const isChecked = kind => kind === 'checkbox' || kind === 'switch';

/** The event the control raises when the user commits a value, and how to read the new value from it. */
export function commitOf(kind) {
    if (isChecked(kind)) return { event: 'pk-change', read: e => Boolean(e.detail.checked) };
    if (kind === 'range') return { event: 'pk-range', read: e => e.detail.value };
    if (kind === 'combobox') return { event: 'change', read: e => e.target.value };
    return { event: 'pk-value-change', read: e => e.detail.value };
}

/** The control's current value. */
export const readValue = (el, kind) => (isChecked(kind) ? el.checked : el.value);
/** Sets the control's value; a missing value empties it (a checkbox or switch unchecks). */
export function writeValue(el, kind, value) {
    if (isChecked(kind)) el.checked = Boolean(value) && value !== 'false';
    else el.value = kind === 'range' ? (value ?? el.min ?? 0) : (value ?? '');
}

/** The attributes a spec puts on its control (only the ones that are set): constraints, placeholder, rows, the kind's `type`. */
export function controlAttrs(spec) {
    const kind = spec.kind ?? 'text', a = {};
    const set = (k, v) => { if (v !== undefined && v !== null && v !== false && v !== '') a[k] = v === true ? '' : v; };
    if (kind === 'range') for (const k of ['min', 'max', 'step']) set(k, spec[k]);
    else if (kind === 'select' || isChecked(kind)) set('required', spec.required);
    else if (kind === 'combobox') { set('required', spec.required); set('placeholder', spec.placeholder); set('free', spec.free); }
    else if (kind === 'textarea') { for (const k of ['required', 'minlength', 'maxlength', 'placeholder', 'rows']) set(k, spec[k]); }
    else { a.type = INPUT_KINDS.includes(kind) ? kind : 'text'; for (const k of ['required', 'min', 'max', 'step', 'minlength', 'maxlength', 'pattern', 'placeholder']) set(k, spec[k]); }
    return a;
}

/** The data-msg-<constraint> attributes of a spec's `msg` map ({ required: '...' } becomes data-msg-required), read by pk-form. */
export const messageAttrs = spec => Object.fromEntries(Object.entries(spec.msg ?? {}).map(([k, v]) => [`data-msg-${k}`, v]));

/**
 * Whether a field shows, given every value. `when` is data: { field, equals } | { field, in: [...] } | { field, not }. `visible` (optional) is a callback
 * property of the element, asked last, for what data cannot say. A field that does not show is not rendered at all, so it is not in any validation.
 */
export function isVisible(spec, values, visible) {
    const w = spec.when;
    if (w && typeof w === 'object') {
        const v = values?.[w.field], text = x => (x === undefined || x === null ? '' : String(x));
        if ('equals' in w && text(v) !== text(w.equals)) return false;
        if (Array.isArray(w.in) && !w.in.map(text).includes(text(v))) return false;
        if ('not' in w && text(v) === text(w.not)) return false;
    }
    return typeof visible === 'function' ? Boolean(visible(spec, values)) : true;
}
