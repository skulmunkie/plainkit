// pk-date-range-picker behaviour: a start and an end date as two native date fields (keyboard, touch and the platform picker come with them) plus quick ranges.
// Dates are ISO strings ("2026-09-19"), computed in UTC so a time zone never shifts a day; the pure rules are exported for the Node tests.
import { addDays, addMonths, isoDate, parseIso } from '../../js/iso-date.js';

const ISO = /^\d{4}-\d{2}-\d{2}$/;
export const cleanIso = s => (ISO.test(String(s ?? '')) ? String(s) : '');

export const PRESETS = {
    today: 'Today', '7d': 'Last 7 days', '30d': 'Last 30 days', '90d': 'Last 90 days',
    month: 'This month', lastmonth: 'Last month', year: 'This year',
};
export const DEFAULT_PRESETS = 'today,7d,30d,month';

// The preset keys a list names: comma or space separated, known ones only, in order, without duplicates.
export const presetList = text => [...new Set(String(text ?? '').split(/[\s,]+/).filter(k => Object.hasOwn(PRESETS, k)))];

// The range a preset stands for on a day: { start, end } (ISO). Null for an unknown key.
export function presetRange(key, today) {
    const { y, m0 } = parseIso(today);
    switch (key) {
        case 'today': return { start: today, end: today };
        case '7d': return { start: addDays(today, -6), end: today };
        case '30d': return { start: addDays(today, -29), end: today };
        case '90d': return { start: addDays(today, -89), end: today };
        case 'month': return { start: isoDate(y, m0, 1), end: today };
        case 'lastmonth': return { start: addMonths(isoDate(y, m0, 1), -1), end: addDays(isoDate(y, m0, 1), -1) };
        case 'year': return { start: isoDate(y, 0, 1), end: today };
        default: return null;
    }
}

// A range cut to min and max (either may be empty); null when nothing of it is left inside them.
export function clampRange(range, min, max) {
    if (!range) return null;
    const start = min && range.start < min ? min : range.start, end = max && range.end > max ? max : range.end;
    return start > end ? null : { start, end };
}

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
        for (const key of ['start', 'end']) {
            const field = this.part(key);
            field.addEventListener('input', () => { this[key] = cleanIso(field.value); this.$typing = true; this.commit(false); });
            field.addEventListener('change', () => { this[key] = cleanIso(field.value); this.commit(true); });
        }
        this.part('presets').addEventListener('click', ev => {
            const b = ev.target.closest?.('button[data-preset]');
            if (!b || b.disabled) return;
            const r = clampRange(presetRange(b.dataset.preset, todayIso()), cleanIso(this.min), cleanIso(this.max));
            if (!r) return;
            this.start = r.start; this.end = r.end; this.commit(true);
        });
    }
    // Raise the change events; `done` is true for a committed change (a preset, a picked date) and false while typing in a field.
    commit(done) {
        const { start, end } = this, valid = !rangeProblems(start, end, { min: this.min, max: this.max }).invalid;
        this.dispatchEvent(new Event(done ? 'change' : 'input', { bubbles: true, composed: true }));
        this.emit('pk-range-change', { start, end, valid });
    }
    updated() {
        const doc = this.ownerDocument;
        const s = this.part('start');
        const e = this.part('end');
        const min = cleanIso(this.min), max = cleanIso(this.max), start = cleanIso(this.start), end = cleanIso(this.end);
        if (!this.$typing) { if (s.value !== start) s.value = start; if (e.value !== end) e.value = end; }
        this.$typing = false;
        s.disabled = e.disabled = this.disabled; s.readOnly = e.readOnly = this.readonly; s.required = e.required = this.required;
        s.setAttribute('aria-label', this.startLabel || 'Start date'); e.setAttribute('aria-label', this.endLabel || 'End date');
        const problem = rangeProblems(start, end, { min, max, required: this.required });
        const shown = problem.invalid && !problem.flags.valueMissing ? problem.message : '';
        const err = this.part('error');
        const wired = shown ? 'e' : null;
        err.textContent = shown; err.hidden = !shown;
        for (const key of ['start', 'end']) {
            const f = this.part(key);
            f.setAttribute('aria-invalid', String(Boolean(this.invalid) || Boolean(shown)));
            if (wired) f.setAttribute('aria-describedby', wired); else f.removeAttribute('aria-describedby');
        }
        const bar = this.part('presets'), keys = presetList(this.presets), today = todayIso();
        if (this.$keys !== keys.join('|')) {
            this.$keys = keys.join('|');
            bar.replaceChildren(...keys.map(k => { const b = doc.createElement('button'); b.type = 'button'; b.className = 'preset'; b.dataset.preset = k; b.textContent = PRESETS[k]; return b; }));
        }
        bar.hidden = keys.length === 0;
        for (const b of bar.children) {
            const r = clampRange(presetRange(b.dataset.preset, today), min, max);
            b.disabled = this.disabled || this.readonly || !r;
            b.setAttribute('aria-pressed', String(Boolean(r && r.start === start && r.end === end)));
        }
        this.setValidity(problem.flags, problem.message, problem.flags.customError || (problem.flags.valueMissing && !start) ? s : e);
        this.setFormValue(start || end ? `${start}/${end}` : '');
    }
    onReset() { const [a = '', b = ''] = String(this.$initial ?? '/').split('/'); this.start = a; this.end = b; }
    onRestore(state) { const [a = '', b = ''] = String(state ?? '').split('/'); this.start = cleanIso(a); this.end = cleanIso(b); }
    focus(o) { this.part('start').focus(o); }
    clear() { this.start = ''; this.end = ''; this.commit(true); }
};
