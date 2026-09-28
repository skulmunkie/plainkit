// Plainkit calendar logic: the month grid, ISO date helpers and keyboard movement. Pure functions on ISO dates ("2026-09-19"),
// computed in UTC so a time zone never shifts a day. Framework-free; the date helpers live in js/iso-date.js.

import { isoDate, parseIso, utc, fromDate, addDays, addMonths } from '../../js/iso-date.js';
import { clickRange, dayRole, shownRange, roleLabel, announce } from '../../js/range-logic.js';
export { isoDate, parseIso, addDays, addMonths };

// Weeks of a month: array of weeks, each 7 cells { date, day, inMonth }. weekStart 0 = Sunday, 1 = Monday. Trims to 5 weeks when it can.
export function monthGrid(year, month0, weekStart = 0) {
    const first = utc(year, month0, 1);
    const lead = (first.getUTCDay() - weekStart + 7) % 7;
    const days = utc(year, month0 + 1, 0).getUTCDate();
    const weeks = Math.ceil((lead + days) / 7);
    return Array.from({ length: weeks }, (_, w) => Array.from({ length: 7 }, (_, i) => {
        const dt = utc(year, month0, 1 - lead + w * 7 + i);
        return { date: fromDate(dt), day: dt.getUTCDate(), inMonth: dt.getUTCMonth() === month0 };
    }));
}

// Weekday names starting at weekStart, in a locale ('narrow' | 'short' | 'long').
export function weekdayNames(locale = 'en', weekStart = 0, width = 'short') {
    const fmt = new Intl.DateTimeFormat(locale, { weekday: width, timeZone: 'UTC' });
    return Array.from({ length: 7 }, (_, i) => fmt.format(utc(2023, 0, 1 + ((weekStart + i) % 7))));
}

export const monthTitle = (year, month0, locale = 'en') => new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(utc(year, month0, 1));

// The date a key moves to from `iso` (grid pattern), or null for other keys.
export function dateForKey(iso, key, shift = false) {
    switch (key) {
        case 'ArrowLeft': return addDays(iso, -1);
        case 'ArrowRight': return addDays(iso, 1);
        case 'ArrowUp': return addDays(iso, -7);
        case 'ArrowDown': return addDays(iso, 7);
        case 'PageUp': return addMonths(iso, shift ? -12 : -1);
        case 'PageDown': return addMonths(iso, shift ? 12 : 1);
        case 'Home': { const { y, m0 } = parseIso(iso); return isoDate(y, m0, 1); }
        case 'End': { const { y, m0 } = parseIso(iso); return isoDate(y, m0, utc(y, m0 + 1, 0).getUTCDate()); }
        default: return null;
    }
}

export const isBetween = (iso, min, max) => (!min || iso >= min) && (!max || iso <= max);

const todayIso = () => { const d = new Date(); return isoDate(d.getFullYear(), d.getMonth(), d.getDate()); };

export default Base => class extends Base {
    connected() {
        if (this.$c) return;
        this.$c = e => {
            const day = e.target.closest?.('.day');
            if (day) { this.pick(day.dataset.date); return; }
            if (e.target.closest?.('[part="prev"]')) this.moveMonth(-1);
            else if (e.target.closest?.('[part="next"]')) this.moveMonth(1);
        };
        this.$k = e => {
            const day = e.target.closest?.('.day');
            if (!day) return;
            if (e.key === 'Escape' && this.$pend) { e.preventDefault(); e.stopPropagation(); this.cancelRange(); return; }
            const next = dateForKey(day.dataset.date, e.key, e.shiftKey);
            if (!next) return;
            e.preventDefault();
            this.$focus = next; this.$refocus = true;
            if (this.$pend) { this.$over = next; this.paint(); }
            const { y, m0 } = parseIso(next);
            this.showMonth(isoDate(y, m0, 1));
            this.requestUpdate();
        };
        this.shadowRoot.addEventListener('click', this.$c);
        this.shadowRoot.addEventListener('keydown', this.$k);
        // Range mode: the pending range follows the pointer and the focused day. Only data-range changes, so no button is replaced under the pointer.
        const over = e => { const d = e.target.closest?.('.day'); if (this.$pend && d && !d.disabled) { this.$over = d.dataset.date; this.paint(); } };
        this.shadowRoot.addEventListener('mouseover', over);
        this.shadowRoot.addEventListener('focusin', over);
        this.shadowRoot.addEventListener('mouseout', e => { if (!e.relatedTarget?.closest?.('.day')) { this.$over = this.shadowRoot.activeElement?.dataset?.date || ''; this.paint(); } });
    }
    get sel() { return this.range ? this.start : this.value; }
    get viewIso() { return this.month || this.sel || todayIso(); }
    showMonth(iso) { if (iso.slice(0, 7) !== this.viewIso.slice(0, 7)) { this.month = iso; this.emit('pk-month', { month: iso.slice(0, 7) }); } }
    moveMonth(n) { const next = addMonths(this.viewIso, n); this.$focus = next; this.showMonth(next); }
    pick(iso) {
        if (this.range) return this.pickRange(iso);
        if (this.readonly || this.disabled || !isBetween(iso, this.min, this.max)) return; if (this.emit('pk-select', { value: iso })) { this.value = iso; this.$focus = iso; }
    }
    // Range mode: the first click sets the start, the second the end (pk-range-change, like pk-date-range-picker); Escape gives a pending start up.
    pickRange(iso) {
        if (this.readonly || this.disabled || !isBetween(iso, this.min, this.max)) return;
        const r = clickRange({ pending: this.$pend, start: this.start }, iso);
        if (!this.$pend) this.$prev = { start: this.start, end: this.end };
        this.$pend = r.pending; this.$over = ''; this.$focus = iso; this.$refocus = true;
        this.start = r.start; this.end = r.end;
        this.say(announce(r, x => this.dayName(x)));
        if (r.done) this.emit('pk-range-change', { start: r.start, end: r.end, valid: true });
    }
    cancelRange() { Object.assign(this, this.$prev); this.$pend = false; this.$over = ''; this.$refocus = true; this.say('Range selection cancelled'); }
    say(text) { this.part('status').textContent = text; }
    dayName(iso) { return new Intl.DateTimeFormat(this.locale || this.ownerDocument.documentElement.lang || 'en', { dateStyle: 'full', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`)); }
    paint() {
        if (!this.range) return;
        const r = shownRange({ start: this.start, end: this.end, pending: this.$pend }, this.$over);
        for (const b of this.shadowRoot.querySelectorAll('.day')) b.dataset.range = dayRole(b.dataset.date, r);
        this.toggleAttribute('data-pending', Boolean(this.$pend));
    }
    updated() {
        const doc = this.ownerDocument, view = parseIso(this.viewIso), locale = this.locale || doc.documentElement.lang || 'en';
        const start = this.weekStart === 1 ? 1 : 0, today = todayIso();
        const focus = this.$focus && this.$focus.slice(0, 7) === this.viewIso.slice(0, 7) ? this.$focus : (this.sel && this.sel.slice(0, 7) === this.viewIso.slice(0, 7) ? this.sel : isoDate(view.y, view.m0, 1));
        this.part('title').textContent = monthTitle(view.y, view.m0, locale);
        const tr = doc.createElement('tr');
        weekdayNames(locale, start, 'short').forEach((n, i) => { const th = doc.createElement('th'); th.scope = 'col'; th.textContent = n; th.setAttribute('abbr', weekdayNames(locale, start, 'long')[i]); tr.append(th); });
        this.part('weekdays').replaceChildren(tr);
        const marks = new Set(this.marks);
        this.part('days').replaceChildren(...monthGrid(view.y, view.m0, start).map(week => {
            const row = doc.createElement('tr');
            for (const c of week) {
                const td = doc.createElement('td'), b = doc.createElement('button');
                b.type = 'button'; b.className = 'day'; b.textContent = String(c.day); b.dataset.date = c.date;
                const role = this.range ? dayRole(c.date, this) : '';
                b.setAttribute('aria-label', this.dayName(c.date) + (role ? `, ${roleLabel(role, this.$pend)}` : ''));
                b.tabIndex = c.date === focus ? 0 : -1;
                if (!c.inMonth) b.dataset.outside = '';
                if (marks.has(c.date)) b.dataset.mark = '';
                if (c.date === today) b.setAttribute('aria-current', 'date');
                if (c.date === this.value && !this.range || role && role !== 'mid') b.setAttribute('aria-selected', 'true');
                b.disabled = this.disabled || !isBetween(c.date, this.min, this.max);
                td.setAttribute('role', 'gridcell'); td.append(b); row.append(td);
            }
            return row;
        }));
        this.paint();
        if (this.$refocus) { this.$refocus = false; this.shadowRoot.querySelector('.day[tabindex="0"]')?.focus(); }
    }
};
