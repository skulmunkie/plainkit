// Plainkit "on this page" logic: which heading is current while scrolling. Pure, so it can be tested without a DOM.
// The element (<pk-toc for="#article">) lists the headings inside the target, listens to the scroll container and marks the link of the
// heading that is current with aria-current="location".

// Index of the current heading given each heading's top edge relative to the scroller and an `offset` from its top (a sticky header,
// plus a little breathing room): the last heading that has reached the offset, or the first when none has. -1 for no headings.
export function spyIndex(tops, offset = 0) {
    if (tops.length === 0) return -1;
    return tops.reduce((cur, top, i) => (top <= offset ? i : cur), 0);
}

// At the very bottom the last section may be too short to ever reach the offset; treat "scrolled to the end" as the last heading.
export function spyIndexAtEnd(tops, offset, scrollTop, scrollHeight, clientHeight, slack = 2) {
    if (tops.length && scrollTop + clientHeight >= scrollHeight - slack && scrollTop > 0) return tops.length - 1;
    return spyIndex(tops, offset);
}

// The fragment id a link points at ("#usage" -> "usage"), or null for anything that is not a same-page fragment.
export const fragmentOf = href => (typeof href === 'string' && /^#[^\s#]+$/.test(href) ? decodeURIComponent(href.slice(1)) : null);

// A stable id for a heading that has none: its text as a slug, made unique among the ids already taken.
export function slug(text, taken = new Set()) {
    const base = text.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_-]+/g, '-') || 'section';
    const pick = n => { const id = n === 1 ? base : `${base}-${n}`; return taken.has(id) ? pick(n + 1) : id; };
    return pick(1);
}

// pk-toc: lists the headings inside `for` and marks the one in view as you scroll (the window, or the `scroller` element).
export default Base => class extends Base {
    connected() {
        if (!this.$w) { this.$w = true; this.$f = () => { if (!this.$q) { this.$q = requestAnimationFrame(() => { this.$q = 0; this.spy(); }); } }; }
        this.refresh();
        if (!this.$h?.length) this.$r = setTimeout(() => this.refresh(), 300);
        this.bind();
    }
    disconnected() { clearTimeout(this.$r); cancelAnimationFrame(this.$q); this.$q = 0; this.unbind(); }
    bind() { (this.$sc = this.scrollerEl ?? window).addEventListener('scroll', this.$f, { passive: true }); window.addEventListener('resize', this.$f); }
    unbind() { this.$sc?.removeEventListener('scroll', this.$f); this.$sc = null; window.removeEventListener('resize', this.$f); }
    changed(name) { if (name === 'for' || name === 'levels') this.refresh(); else if (name === 'scroller' && this.$sc) { this.unbind(); this.bind(); } }
    get scrollerEl() { return this.scroller ? document.querySelector(this.scroller) : null; }
    refresh() {
        const target = this.for ? document.querySelector(this.for) : null;
        const list = this.part('list');
        this.$h = target ? [...target.querySelectorAll(this.levels)] : [];
        const taken = new Set(this.$h.map(h => h.id).filter(Boolean));
        this.$l = this.$h.map(h => {
            if (!h.id) { h.id = slug(h.textContent, taken); taken.add(h.id); }
            const li = document.createElement('li'); const a = document.createElement('a');
            a.setAttribute('part', 'link'); a.href = `#${h.id}`; a.textContent = h.textContent.trim(); a.dataset.level = h.localName.slice(1);
            li.append(a); return { li, a };
        });
        list.replaceChildren(...this.$l.map(x => x.li));
        this.spy();
    }
    spy() {
        if (!this.$h?.length) return;
        const sc = this.scrollerEl; const top = sc ? sc.getBoundingClientRect().top : 0;
        const tops = this.$h.map(h => h.getBoundingClientRect().top - top);
        const at = sc ?? document.scrollingElement;
        const i = spyIndexAtEnd(tops, this.offset, at.scrollTop, at.scrollHeight, sc ? sc.clientHeight : innerHeight);
        this.$l.forEach((x, k) => (k === i ? x.a.setAttribute('aria-current', 'location') : x.a.removeAttribute('aria-current')));
        if (i !== this.$i) { this.$i = i; this.emit('pk-section-change', { id: this.$h[i].id }); }
    }
};
