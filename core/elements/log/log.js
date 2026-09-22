// pk-log behaviour: a streaming log. append() adds rows without touching the ones already drawn, the oldest go past max, and the view sticks to the bottom until the
// user scrolls up (then paused is true and a button jumps back). The pure helpers are exported for the Node tests.
export const LEVELS = ['debug', 'info', 'warn', 'error'];

// Is the view at the bottom (within a few pixels of it)?
export const atBottom = (top, view, total, slack = 4) => total - top - view <= slack;

// The rows worth drawing when only the last max fit (max 0 means no cap).
export const keepLast = (rows, max) => (max > 0 && rows.length > max ? rows.slice(rows.length - max) : rows);

// A time given as text is shown as it is; a Date or a number of milliseconds becomes hh:mm:ss.
export function formatTime(t) {
    if (t === undefined || t === null || t === '') return '';
    if (typeof t !== 'number' && !(t instanceof Date)) return String(t);
    const d = new Date(t);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString([], { hour12: false });
}

// A row is a string or { text, level, time }; a level that is not known is dropped.
export function normalizeRow(row) {
    if (row === null || typeof row !== 'object') return { text: String(row ?? ''), level: '', time: '' };
    return { text: String(row.text ?? ''), level: LEVELS.includes(row.level) ? row.level : '', time: formatTime(row.time) };
}

export default Base => class extends Base {
    connected() {
        if (this.$init) return;
        this.$init = true;
        this.part('scroller').addEventListener('scroll', () => this.scrolled());
        this.part('resume').addEventListener('click', () => { this.paused = false; this.emit('pk-pause', { paused: false }, { cancelable: false }); });
    }
    // A pending scroll-to-bottom (queueSettle) reads layout on the next frame; nothing to fire once the element is gone.
    disconnected() { if (this.$raf) { cancelAnimationFrame(this.$raf); this.$raf = 0; } }
    changed(name, value) {
        if (name === 'rows') { this.clear(); this.append(...(Array.isArray(value) ? value : [])); }
        // overflow-anchor stays off while following (settle() already keeps the view at the bottom every frame; the browser's own
        // anchoring would otherwise fire a 'scroll' event for the still-unsettled view and pause the log) and on while paused (it
        // keeps the reader's row stable as new rows arrive above or the cap trims rows below).
        if (name === 'paused') this.part('scroller').classList.toggle('paused', value);
    }
    // Rows are collected and drawn once per microtask, so a burst of appends is one insertion.
    append(...rows) {
        const q = this.$in ??= [];
        for (const r of rows) q.push(r);
        if (!this.$flush) { this.$flush = true; queueMicrotask(() => this.flush()); }
    }
    clear() {
        this.$in = [];
        this.part('list').replaceChildren();
        this.part('empty').hidden = false;
    }
    // Inserting and trimming rows never reads layout, so every flush can run in full. Only settle()'s scroll-to-bottom forces one
    // (it reads scrollHeight); queueSettle coalesces it to once per animation frame no matter how many flushes land before it fires,
    // so a stream that appends from separate tasks (a socket message, a SignalR line) pays for one layout per frame, not per row.
    flush() {
        this.$flush = false;
        const list = this.part('list'), rows = keepLast(this.$in ?? [], this.max), frag = this.ownerDocument.createDocumentFragment();
        this.$in = [];
        for (const r of rows) frag.append(this.row(normalizeRow(r)));
        list.append(frag);
        this.trim();
        this.queueSettle();
    }
    row({ text, level, time }) {
        const d = (this.$tpl ??= this.shadowRoot.querySelector('template').content.firstElementChild).cloneNode(true), [t, l, m] = d.children;
        m.textContent = text;
        if (time) t.textContent = time; else t.remove();
        if (level) { l.textContent = level; d.classList.add(level); } else l.remove();
        return d;
    }
    // Drop the oldest rows past max and show or hide the empty text: DOM writes only, no layout is read.
    trim() {
        const list = this.part('list');
        if (this.max > 0) while (list.childElementCount > this.max) list.firstElementChild.remove();
        this.part('empty').hidden = list.childElementCount > 0;
    }
    // At most one pending frame at a time, however many flushes ask for it before it runs.
    queueSettle() {
        if (this.$raf) return;
        this.$raf = requestAnimationFrame(() => { this.$raf = 0; this.settle(); });
    }
    // Stay at the bottom unless paused. $setTop remembers the value so scrolled() can tell this scroll from the reader's own.
    settle() {
        if (this.paused) return;
        const s = this.part('scroller');
        s.scrollTop = this.$setTop = s.scrollHeight;
    }
    // A 'scroll' event fires for the reader's own scrolling, but also for the scrollTop settle() just set, and (while paused, with
    // overflow-anchor on) for the browser keeping the reader's row stable as rows are trimmed: none of those are the reader scrolling.
    scrolled() {
        const s = this.part('scroller');
        if (s.scrollTop === this.$setTop) return;
        const pause = !atBottom(s.scrollTop, s.clientHeight, s.scrollHeight);
        if (pause === this.paused) return;
        this.paused = pause;
        this.emit('pk-pause', { paused: pause }, { cancelable: false });
    }
    updated() { this.trim(); this.queueSettle(); }
};
