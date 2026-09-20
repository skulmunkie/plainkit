// Plainkit breadcrumb logic: which crumbs collapse behind the "..." button. Pure, so it can be tested without a DOM.
// The element (<pk-breadcrumb>) keeps the first crumb and the last `tail`, and folds the middle ones when there are more than `max`;
// on a phone the limit is lower. The "..." button reveals them in place.

export const DEFAULT_MAX = 4;
export const PHONE_MAX = 3;
export const PHONE_WIDTH = 640;

// The crumb limit for a viewport width.
export const maxCrumbs = (width, max = DEFAULT_MAX, phoneMax = PHONE_MAX) => (width <= PHONE_WIDTH ? Math.min(max, phoneMax) : max);

// Indexes of the crumbs to hide for `count` crumbs: none when they fit; otherwise everything between the first (`head`) and the last
// (`tail`), so the trail always starts at the root and ends at the current page.
export function hiddenCrumbs(count, max = DEFAULT_MAX, { head = 1, tail = 2 } = {}) {
    if (count <= max || count <= head + tail) return [];
    const out = [];
    for (let i = head; i < count - tail; i++) out.push(i);
    return out;
}

// pk-breadcrumb: folds the middle crumbs behind a "..." button when the trail is long (sooner on a phone).
export default Base => class extends Base {
    connected() {
        if (!this.$w) {
            this.$w = true;
            this.watchSlot('', () => this.fold());
            this.part('more').addEventListener('click', () => { this.$open = true; this.part('more').setAttribute('aria-expanded', 'true'); this.fold(); this.emit('pk-expand', null); });
            this.$mq = globalThis.matchMedia('(max-width: 640px)'); this.$mq.addEventListener('change', () => this.fold());
        }
        this.fold();
    }
    changed(name) { if (name === 'max') this.fold(); }
    fold() {
        const crumbs = this.slotted();
        const hide = this.$open ? [] : hiddenCrumbs(crumbs.length, maxCrumbs(globalThis.innerWidth, this.max));
        crumbs.forEach((c, i) => c.toggleAttribute('data-folded', hide.includes(i)));
        this.toggleAttribute('data-has-fold', hide.length > 0);
        const last = crumbs[crumbs.length - 1];
        if (last && !crumbs.some(c => c.hasAttribute('aria-current'))) last.setAttribute('aria-current', 'page');
        this.part('more').setAttribute('aria-label', `Show ${hide.length} hidden pages`);
    }
};
