// Plainkit pagination logic: the page window with ellipses, clamping, ranges and the keyboard move. Pure functions, no DOM,
// so the element, a Blazor component and a test all use the same decisions. Framework-free; no imports.

export const clampPage = (page, pages) => Math.min(Math.max(1, Math.trunc(Number(page)) || 1), Math.max(1, pages));

// Total pages for `total` items at `pageSize` per page (at least 1).
export const pageCount = (total, pageSize) => Math.max(1, Math.ceil(Math.max(0, total) / Math.max(1, pageSize)));

const range = (a, b) => Array.from({ length: Math.max(0, b - a + 1) }, (_, i) => a + i);

// The buttons to show: page numbers and the string 'gap' for an ellipsis. The count of slots stays constant while you move, so
// the control never jumps: [1,2,3,4,5,'gap',20] near the start, [1,'gap',8,9,10,'gap',20] in the middle.
// siblings: pages either side of the current one. boundary: pages always shown at each end.
export function pageWindow(current, total, { siblings = 1, boundary = 1 } = {}) {
    if (total < 1) return [];
    const c = clampPage(current, total);
    const start = range(1, Math.min(boundary, total));
    const end = range(Math.max(total - boundary + 1, boundary + 1), total);
    const sibStart = Math.max(Math.min(c - siblings, total - boundary - siblings * 2 - 1), boundary + 2);
    const sibEnd = Math.min(Math.max(c + siblings, boundary + siblings * 2 + 2), end.length ? end[0] - 2 : total - 1);
    return [
        ...start,
        ...(sibStart > boundary + 2 ? ['gap'] : boundary + 1 < total - boundary ? [boundary + 1] : []),
        ...range(sibStart, sibEnd),
        ...(sibEnd < total - boundary - 1 ? ['gap'] : total - boundary > boundary ? [total - boundary] : []),
        ...end,
    ];
}

// "21-30 of 95": the first and last item numbers on a page (0 and 0 for an empty list).
export function pageRange(page, pageSize, total) {
    if (total <= 0) return { from: 0, to: 0 };
    const from = (clampPage(page, pageCount(total, pageSize)) - 1) * pageSize + 1;
    return { from, to: Math.min(total, from + pageSize - 1) };
}

// The page a key moves to from `current`, or null when it is not a pagination key.
export function pageForKey(current, pages, key) {
    switch (key) {
        case 'ArrowLeft': return clampPage(current - 1, pages);
        case 'ArrowRight': return clampPage(current + 1, pages);
        case 'Home': return 1;
        case 'End': return pages;
        default: return null;
    }
}

const button = (doc, text, attrs = {}) => { const b = doc.createElement('button'); b.type = 'button'; b.textContent = text; for (const [k, v] of Object.entries(attrs)) b.setAttribute(k, v); return b; };

export default Base => class extends Base {
    connected() {
        if (this.$c) return;
        this.$c = e => {
            const t = e.target;
            if (t.closest('[part="more"]')) { this.emit('pk-load-more', null); return; }
            const go = t.closest('[part="first"]') ? 1 : t.closest('[part="last"]') ? this.pageTotal : t.closest('[part="prev"]') ? this.page - 1 : t.closest('[part="next"]') ? this.page + 1 : Number(t.closest('[data-page]')?.dataset.page);
            if (Number.isFinite(go) && go >= 1) this.goTo(go);
        };
        this.shadowRoot.addEventListener('click', this.$c);
        this.part('size-select').addEventListener('change', e => { const pageSize = Number(e.target.value); if (this.emit('pk-page-size', { pageSize })) { this.pageSize = pageSize; this.goTo(1); } });
    }
    get pageTotal() { return this.pages || pageCount(this.total, this.pageSize); }
    goTo(page) { const p = clampPage(page, this.pageTotal); if (p !== this.page && this.emit('pk-page', { page: p })) this.page = p; }
    updated() {
        const doc = this.ownerDocument, total = this.pageTotal, page = clampPage(this.page, total);
        const numbers = this.part('numbers'), size = this.part('size-select'), more = this.part('more');
        numbers.replaceChildren(...pageWindow(page, total, { siblings: this.siblings, boundary: this.boundary }).map(n => {
            if (n === 'gap') { const g = doc.createElement('span'); g.className = 'gap'; g.setAttribute('aria-hidden', 'true'); g.textContent = '…'; return g; }
            const b = button(doc, String(n), { 'data-page': String(n), 'aria-label': `Page ${n}` });
            if (n === page) b.setAttribute('aria-current', 'page');
            return b;
        }));
        this.part('prev').disabled = this.part('first').disabled = page <= 1; this.part('next').disabled = this.part('last').disabled = page >= total;
        this.part('first').hidden = this.part('last').hidden = !this.edges;
        this.part('status').textContent = `Page ${page} of ${total}`;
        const range = pageRange(page, this.pageSize, this.total);
        this.part('summary').hidden = this.total <= 0; this.part('summary').textContent = `${range.from}–${range.to} of ${this.total}`;
        this.part('size').hidden = this.sizes.length === 0;
        size.replaceChildren(...this.sizes.map(n => { const o = doc.createElement('option'); o.value = String(n); o.textContent = String(n); o.selected = n === this.pageSize; return o; }));
        more.disabled = this.loading; more.textContent = this.loading ? 'Loading…' : 'Load more';
    }
};
