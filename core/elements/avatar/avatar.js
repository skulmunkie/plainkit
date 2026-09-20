// <pk-avatar> behaviour and its pure logic: initials from a name and a stable colour slot per person.

// "Ada Lovelace" -> "AL"; one word -> its first letter(s); empty -> "?". Uses the first letter of the first and last words.
export function initials(name, max = 2) {
    const words = String(name ?? '').trim().split(/\s+/).filter(Boolean);
    if (!words.length) return '?';
    const chars = words.length === 1 ? Array.from(words[0]).slice(0, max) : [words[0], words[words.length - 1]].map(w => Array.from(w)[0]);
    return chars.slice(0, max).join('').toUpperCase();
}

// A stable slot 1..count for a name, so the same person always gets the same colour.
export function colourSlot(name, count = 5) {
    const h = Array.from(String(name ?? '')).reduce((acc, ch) => (acc * 31 + ch.codePointAt(0)) >>> 0, 0);
    return (h % count) + 1;
}

// The "+N" overflow for a group: the visible people and how many are left over.
export const groupOverflow = (people, max = 4) => ({ shown: people.slice(0, max), more: Math.max(0, people.length - max) });

export default Base => class extends Base {
    connected() {
        const img = this.part('image');
        if (!this.$e) { this.$e = () => { this.$bad = this.src; img.removeAttribute('src'); img.hidden = true; }; img.addEventListener('error', this.$e); }
    }
    updated() {
        const img = this.part('image');
        if (this.src && this.src !== this.$bad) { if (img.getAttribute('src') !== this.src) img.setAttribute('src', this.src); img.hidden = false; } else { img.removeAttribute('src'); img.hidden = true; }
        this.part('initials').textContent = initials(this.name);
        this.dataset.slot = this.colour || String(colourSlot(this.name));
        this.aria({ role: 'img', ariaLabel: [this.name, this.status === 'none' ? '' : this.status].filter(Boolean).join(', ') });
    }
};
