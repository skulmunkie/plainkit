// Range selection logic for pk-calendar's range mode: pure functions on ISO dates ("2026-09-19"), no DOM, no imports. ISO dates order as strings.

// A pair of days as { start, end }, earliest first.
export const orderRange = (a, b) => (a <= b ? { start: a, end: b } : { start: b, end: a });

// One click while choosing. `pending` means the start is set and the end is awaited. The first click sets the start; the second sets the end
// (swapped when earlier than the start) and is `done`, the moment to commit.
export function clickRange({ pending, start }, iso) {
    return pending ? { ...orderRange(start, iso), pending: false, done: true } : { start: iso, end: '', pending: true, done: false };
}

// What a day is within a range: 'start', 'end', 'only' (a one-day range, or a start still awaiting its end), 'mid' or ''.
export function dayRole(iso, { start, end }) {
    if (!start) return '';
    if (!end || start === end) return iso === start ? 'only' : '';
    return iso === start ? 'start' : iso === end ? 'end' : iso > start && iso < end ? 'mid' : '';
}

// The range to draw: the committed one, or while pending the start up to the day under the pointer or focus.
export const shownRange = ({ start, end, pending }, over) => (pending && over ? orderRange(start, over) : { start, end });

// The words a day adds to its accessible name, and what the live region says.
export const roleLabel = (role, pending) => ({ start: 'range start', end: 'range end', mid: 'in range', only: pending ? 'range start' : 'range start and end' })[role] || '';
export const announce = ({ start, end, pending }, name) => (pending ? `Range start set to ${name(start)}` : `Range: ${name(start)} to ${name(end)}`);
