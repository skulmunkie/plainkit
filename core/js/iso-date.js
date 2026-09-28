// ISO date helpers ("2026-09-19") shared by pk-calendar and pk-date-range-picker. Computed in UTC so a time zone never shifts a day. No imports.

const pad = n => String(n).padStart(2, '0');
export const isoDate = (y, m0, d) => `${y}-${pad(m0 + 1)}-${pad(d)}`;
export const parseIso = s => { const [y, m, d] = s.split('-').map(Number); return { y, m0: m - 1, d }; };
export const utc = (y, m0, d) => new Date(Date.UTC(y, m0, d));
export const fromDate = dt => isoDate(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate());

export const addDays = (iso, n) => { const { y, m0, d } = parseIso(iso); return fromDate(utc(y, m0, d + n)); };

// Same day next/previous month, clamped to the last day of a shorter month (Jan 31 + 1 month = Feb 28/29).
export function addMonths(iso, n) {
    const { y, m0, d } = parseIso(iso);
    const target = utc(y, m0 + n, 1);
    const last = utc(target.getUTCFullYear(), target.getUTCMonth() + 1, 0).getUTCDate();
    return isoDate(target.getUTCFullYear(), target.getUTCMonth(), Math.min(d, last));
}
