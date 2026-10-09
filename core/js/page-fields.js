// The field builder tool-page and settings-page share (#423): one config field ({ key, type, label, options, ... }) becomes the pk-* control
// that edits it. Only existing components (STANDARDS.md): pk-input carries every scalar type through its `type`; pk-switch (checked) and
// pk-range (wrapped in a pk-field, it has no label of its own) differ, so read/write hide that.
import { controlTag } from './field-kinds.js';

/** The control's current value. */
export const read = (el, type) => (type === 'switch' ? el.checked : el.value);
/** Sets the control's value; `undefined` leaves a non-switch control as it is. */
export const write = (el, type, v) => { if (type === 'switch') el.checked = Boolean(v); else if (v !== undefined) el.value = v; };

/** The info tip for a `hint` (or `help`): a pk-tooltip with its own info button, opening on hover, focus and tap. */
export function hintTip(doc, text) {
    const tip = doc.createElement('pk-tooltip');
    tip.help = true; tip.interactive = true; tip.text = text;
    return tip;
}

/** Builds one field: { el } is the control to read/write, { row } the element to append (the control itself, or its pk-field wrapper). A `hint` adds an info tip. */
export function buildField(doc, f) {
    const built = buildBase(doc, f);
    const hint = f.hint ?? f.help;
    if (!hint) return built;
    const tip = hintTip(doc, hint);
    if (built.row === built.el) {
        if (built.el.localName === 'pk-switch') { const row = doc.createElement('pk-cluster'); row.append(built.el, tip); return { el: built.el, row }; }
        // A labelled control moves into a pk-field, which draws the label with the tip beside it (slot label-action); the control keeps its label as its name.
        const field = doc.createElement('pk-field');
        field.label = f.label ?? f.key;
        built.el.showLabel = false;
        tip.slot = 'label-action';
        field.append(built.el, tip);
        return { el: built.el, row: field };
    }
    tip.slot = 'label-action';
    built.row.append(tip);
    return built;
}

function buildBase(doc, f) {
    const tag = controlTag(f.type);
    const el = doc.createElement(tag);
    if (tag === 'pk-switch') { el.textContent = f.label ?? f.key; return { el, row: el }; }
    if (tag === 'pk-range') {
        for (const k of ['min', 'max', 'step']) if (f[k] !== undefined) el[k] = f[k];
        el.output = true;
        const field = doc.createElement('pk-field');
        field.label = f.label ?? f.key;
        field.append(el);
        return { el, row: field };
    }
    el.label = f.label ?? f.key;
    el.showLabel = true;
    if (f.placeholder) el.placeholder = f.placeholder;
    if (f.required) el.required = true;
    if (tag === 'pk-input') el.type = f.type ?? 'text';
    if (tag === 'pk-select') for (const o of f.options ?? []) { const opt = doc.createElement('option'); opt.value = String(o.value ?? o); opt.textContent = o.label ?? String(o); el.append(opt); }
    return { el, row: el };
}
