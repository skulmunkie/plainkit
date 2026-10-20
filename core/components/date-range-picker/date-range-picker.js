// pk-date-range-picker behaviour: a start and an end date as two native date fields (keyboard, touch and the platform picker come with them) plus quick ranges.
// Dates are ISO strings ("2026-09-19"), computed in UTC so a time zone never shifts a day; the pure rules are exported for the Node tests.
import { loadElements } from '../../js/loader.js';
import { addDays, addMonths, isoDate, parseIso } from '../../js/iso-date.js';

const ISO = /^\d{4}-\d{2}-\d{2}$/;
export const cleanIso = s => (ISO.test(String(s ?? '')) ? String(s) : '');

export const PRESETS = {
    today: 'Today', '7d': 'Last 7 days', '30d': 'Last 30 days', '90d': 'Last 90 days',
    month: 'This month', lastmonth: 'Last month', quarter: 'This quarter', lastquarter: 'Last quarter', year: 'This year', lastyear: 'Last year',
};
export const DEFAULT_PRESETS = 'today,7d,30d,month';

// The caller's own presets (the presetItems property): [{ key, label, start, end }], the entries with a key and a label.
export const customOf = v => (Array.isArray(v) ? v.filter(c => c && typeof c.key === 'string' && c.key && typeof c.label === 'string') : []);
export const presetLabel = (key, custom = []) => custom.find(c => c.key === key)?.label ?? PRESETS[key];

// The preset keys a list names: comma or space separated, known ones (built in or custom) only, in order, without duplicates; the custom ones not named follow.
export const presetList = (text, custom = []) => [...new Set([...String(text ?? '').split(/[\s,]+/).filter(k => Object.hasOwn(PRESETS, k) || custom.some(c => c.key === k)), ...custom.map(c => c.key)])];

// The range a preset stands for on a day: { start, end } (ISO). Null for an unknown key, or a custom one without two ordered ISO dates.
export function presetRange(key, today, custom = []) {
    const { y, m0 } = parseIso(today), own = custom.find(c => c.key === key), q0 = m0 - (m0 % 3);
    if (own) { const start = cleanIso(own.start), end = cleanIso(own.end); return start && end && start <= end ? { start, end } : null; }
    switch (key) {
        case 'today': return { start: today, end: today };
        case '7d': return { start: addDays(today, -6), end: today };
        case '30d': return { start: addDays(today, -29), end: today };
        case '90d': return { start: addDays(today, -89), end: today };
        case 'month': return { start: isoDate(y, m0, 1), end: today };
        case 'lastmonth': return { start: addMonths(isoDate(y, m0, 1), -1), end: addDays(isoDate(y, m0, 1), -1) };
        case 'quarter': return { start: isoDate(y, q0, 1), end: today };
        case 'lastquarter': return { start: addMonths(isoDate(y, q0, 1), -3), end: addDays(isoDate(y, q0, 1), -1) };
        case 'year': return { start: isoDate(y, 0, 1), end: today };
        case 'lastyear': return { start: isoDate(y - 1, 0, 1), end: addDays(isoDate(y, 0, 1), -1) };
        default: return null;
    }
}

// A range cut to min and max (either may be empty); null when nothing of it is left inside them.
export function clampRange(range, min, max) {
    if (!range) return null;
    const start = min && range.start < min ? min : range.start, end = max && range.end > max ? max : range.end;
    return start > end ? null : { start, end };
}

// The key of the preset whose range is exactly start to end today, or ''.
export const activePreset = (keys, start, end, today, min, max, custom = []) => keys.find(k => { const r = clampRange(presetRange(k, today, custom), min, max); return r && r.start === start && r.end === end; }) ?? '';

// What is wrong with a range, as native-style flags plus a message: the end before the start, a date outside min and max, a missing date when required.
export function rangeProblems(start, end, { min = '', max = '', required = false } = {}) {
    const flags = {};
    let message = '';
    if (start && end && end < start) { flags.customError = true; message = 'The end date is before the start date.'; }
    const dates = [start, end].filter(Boolean);
    if (dates.some(d => (min && d < min) || (max && d > max))) {
        flags[dates.some(d => min && d < min) ? 'rangeUnderflow' : 'rangeOverflow'] = true;
        message = message || (min && max ? `Choose dates from ${min} to ${max}.` : min ? `Choose dates on or after ${min}.` : `Choose dates on or before ${max}.`);
    }
    if (required && (!start || !end)) { flags.valueMissing = true; message = message || 'Choose a start and an end date.'; }
    return { flags, message, invalid: Object.keys(flags).length > 0 };
}

const todayIso = () => { const d = new Date(); return isoDate(d.getFullYear(), d.getMonth(), d.getDate()); };

export default Base => class extends Base {
    connected() {
        if (this.$init) return;
        this.$init = true; this.$initial = `${this.start}/${this.end}`;
        loadElements(this.shadowRoot); // the layout, the two date fields and the quick ranges are pk-* elements in this shadow tree
        for (const key of ['start', 'end']) {
            const field = this.part(key);
            field.addEventListener('input', () => { this[key] = cleanIso(field.value); this.$typing = true; this.commit(false); });
            // the pk-input's own composed change would double the one commit() raises
            field.addEventListener('change', ev => { ev.stopPropagation(); this[key] = cleanIso(field.value); this.commit(true); });
        }
        this.part('presets').addEventListener('click', ev => {
            const b = ev.target.closest?.('pk-button[data-preset]');
            if (!b || b.disabled) return;
            const r = clampRange(presetRange(b.dataset.preset, todayIso(), customOf(this.presetItems)), cleanIso(this.min), cleanIso(this.max));
            if (!r) return;
            this.start = r.start; this.end = r.end; this.commit(true);
            this.requestUpdate(); // the toggle flipped itself on the click: put its pressed state back to what the range says
        });
    }
    // The calendar popover (the calendar attribute): the field's opener opens a range pk-calendar that shares this picker's range. It commits like the fields do and closes on the second click.
    wireCalendar() {
        const pop = this.part('popover'), cal = this.part('calendar'), opener = this.part('opener');
        cal.addEventListener('pk-range-change', ev => {
            ev.stopPropagation();
            this.start = ev.detail.start; this.end = ev.detail.end; this.commit(true);
            pop.open = false; opener.focus();
        });
        pop.addEventListener('pk-open', ev => {
            ev.stopPropagation();
            cal.month = cleanIso(this.start);
            queueMicrotask(() => cal.focus({ focusVisible: true }));
        });
        pop.addEventListener('pk-close', ev => { ev.stopPropagation(); if (ev.detail.reason === 'escape') opener.focus(); });
    }
    // The calendar, popover and button load on demand (only a picker with the calendar attribute pays for them); props are written once they are upgraded.
    syncCalendar(start, end, min, max) {
        if (!this.calendar) return;
        const tags = ['pk-popover', 'pk-button', 'pk-calendar'];
        if (!this.$loaded) { this.$loaded = true; this.wireCalendar(); loadElements(this.shadowRoot); Promise.all(tags.map(n => customElements.whenDefined(n))).then(() => this.requestUpdate()); }
        if (!tags.every(n => customElements.get(n))) return;
        const cal = this.part('calendar'), ordered = start && end && end >= start;
        cal.start = ordered ? start : ''; cal.end = ordered ? end : ''; cal.min = min; cal.max = max;
        this.part('opener').disabled = this.disabled || this.readonly;
    }
    // Raise the change events; `done` is true for a committed change (a preset, a picked date) and false while typing in a field.
    commit(done) {
        const { start, end } = this, valid = !rangeProblems(start, end, { min: this.min, max: this.max }).invalid;
        this.dispatchEvent(new Event(done ? 'change' : 'input', { bubbles: true, composed: true }));
        const custom = customOf(this.presetItems), preset = activePreset(presetList(this.presets, custom), cleanIso(start), cleanIso(end), todayIso(), cleanIso(this.min), cleanIso(this.max), custom);
        this.emit('pk-range-change', { start, end, valid, preset });
    }
    updated() {
        const doc = this.ownerDocument;
        const s = this.part('start');
        const e = this.part('end');
        const min = cleanIso(this.min), max = cleanIso(this.max), start = cleanIso(this.start), end = cleanIso(this.end);
        if (!this.$typing) { if (s.value !== start) s.value = start; if (e.value !== end) e.value = end; }
        this.$typing = false;
        this.syncCalendar(start, end, min, max);
        s.disabled = e.disabled = this.disabled; s.readonly = e.readonly = this.readonly; s.required = e.required = this.required;
        s.label = this.startLabel || 'Start date'; e.label = this.endLabel || 'End date';
        const problem = rangeProblems(start, end, { min, max, required: this.required });
        const shown = problem.invalid && !problem.flags.valueMissing ? problem.message : '';
        const err = this.part('error');
        err.textContent = shown; err.hidden = !shown;
        for (const key of ['start', 'end']) { const f = this.part(key); f.invalid = Boolean(this.invalid) || Boolean(shown); f.description = shown; }
        const bar = this.part('presets'), custom = customOf(this.presetItems), keys = presetList(this.presets, custom), today = todayIso(), sig = keys.map(k => `${k}:${presetLabel(k, custom)}`).join('|');
        if (this.$keys !== sig) {
            this.$keys = sig;
            bar.replaceChildren(...keys.map(k => { const b = doc.createElement('pk-button'); b.variant = 'ghost'; b.toggle = true; b.dataset.preset = k; b.textContent = presetLabel(k, custom); return b; }));
            loadElements(bar);
        }
        bar.hidden = keys.length === 0;
        for (const b of bar.children) {
            const r = clampRange(presetRange(b.dataset.preset, today, custom), min, max);
            b.disabled = this.disabled || this.readonly || !r;
            b.pressed = Boolean(r && r.start === start && r.end === end);
        }
        this.setValidity(problem.flags, problem.message, problem.flags.customError || (problem.flags.valueMissing && !start) ? s : e);
        this.setFormValue(start || end ? `${start}/${end}` : '');
    }
    onReset() { const [a = '', b = ''] = String(this.$initial ?? '/').split('/'); this.start = a; this.end = b; }
    onRestore(state) { const [a = '', b = ''] = String(state ?? '').split('/'); this.start = cleanIso(a); this.end = cleanIso(b); }
    // a pk-input does not delegate focus: the field is the control part inside it
    focus(o) { const f = this.part('start'); (f.shadowRoot?.querySelector('[part="control"]') ?? f).focus(o); }
    clear() { this.start = ''; this.end = ''; this.commit(true); }
};
