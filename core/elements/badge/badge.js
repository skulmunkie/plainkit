// <pk-badge> behaviour and its pure logic: how a count reads.

// 7 -> "7", 120 -> "99+" (max 99), 0 -> "0"; a non-number reads as its text. `max` 0 disables capping.
export function formatCount(value, max = 99) {
    const n = Number(value);
    if (value === '' || value === null || value === undefined || Number.isNaN(n)) return String(value ?? '');
    return max > 0 && n > max ? `${max}+` : String(Math.trunc(n));
}

// The spoken label for a badge: "4 unread" from a count and a noun; the noun is omitted when empty.
export const countLabel = (value, noun = '', max = 99) => [formatCount(value, max), noun].filter(Boolean).join(' ');

export default Base => class extends Base {
    updated() { this.part('count').textContent = formatCount(this.count, this.max); }
};
