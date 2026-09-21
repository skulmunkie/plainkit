// <pk-local-time> behaviour and its pure logic: a UTC instant written in the reader's locale and time zone.

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const STEPS = [['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60], ['second', 1]];

// A Date from an ISO string or a timestamp; null when it is empty or not a date.
export function parseInstant(value) {
    if (value === '' || value === null || value === undefined) return null;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
}

// "3 hours ago", "in 2 days", "now": the largest whole unit between the instant and now.
export function relativeText(date, now = Date.now(), locale) {
    const seconds = Math.round((date.getTime() - now) / 1000);
    const [unit, size] = STEPS.find(([, s]) => Math.abs(seconds) >= s) ?? ['second', 1];
    return new Intl.RelativeTimeFormat(locale || undefined, { numeric: 'auto' }).format(Math.trunc(seconds / size), unit);
}

// The text for an instant. format: date | time | datetime | relative; length: short | medium | long. Returns '' for a value that is not a date.
// A date-only value ("2026-09-19") is a calendar day, not an instant, so it is written in UTC and never slips to the day before.
export function formatLocal(value, { format = 'datetime', length = 'medium', locale = '', timeZone = '', now = Date.now() } = {}) {
    const d = parseInstant(value);
    if (!d) return '';
    if (format === 'relative') return relativeText(d, now, locale);
    const zone = timeZone || (typeof value === 'string' && DATE_ONLY.test(value) ? 'UTC' : undefined);
    const opts = { ...(format !== 'time' ? { dateStyle: length } : {}), ...(format !== 'date' ? { timeStyle: length === 'long' ? 'long' : 'short' } : {}), ...(zone ? { timeZone: zone } : {}) };
    try { return new Intl.DateTimeFormat(locale || undefined, opts).format(d); } catch { return ''; }
}

export default Base => class extends Base {
    disconnected() { clearInterval(this.$t); this.$t = 0; }
    updated() {
        const opts = { format: this.format, length: this.length, locale: this.locale, timeZone: this.timeZone };
        const text = formatLocal(this.datetime, opts);
        this.part('text').textContent = text;
        // The slot shows the author's own text only while there is nothing to format (an invalid or empty datetime).
        this.shadowRoot.querySelector('slot').hidden = text !== '';
        // Relative text is only true for a moment: keep it fresh while connected; other formats need no timer.
        const timer = this.format === 'relative' && text !== '';
        if (timer && !this.$t && this.isConnected) this.$t = setInterval(() => this.requestUpdate(), 30000);
        else if (!timer && this.$t) { clearInterval(this.$t); this.$t = 0; }
        // The inner time carries the full date as a title for a relative reading; the datetime attribute stays the machine value.
        const full = text && this.format === 'relative' ? formatLocal(this.datetime, { format: 'datetime', length: 'long', locale: this.locale, timeZone: this.timeZone }) : '';
        if (full) this.part('time').title = full; else this.part('time').removeAttribute('title');
    }
};
