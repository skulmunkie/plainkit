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
    changed(name, value) { if (name === 'rows') { this.clear(); this.append(...(Array.isArray(value) ? value : [])); } }
    // Rows are collected and drawn once per microtask, so a burst of appends is one insertion and one scroll.
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
    flush() {
        this.$flush = false;
        const list = this.part('list'), rows = keepLast(this.$in ?? [], this.max), frag = this.ownerDocument.createDocumentFragment();
        this.$in = [];
        for (const r of rows) frag.append(this.row(normalizeRow(r)));
        list.append(frag);
        this.settle();
    }
    row({ text, level, time }) {
        const d = (this.$tpl ??= this.shadowRoot.querySelector('template').content.firstElementChild).cloneNode(true), [t, l, m] = d.children;
        m.textContent = text;
        if (time) t.textContent = time; else t.remove();
        if (level) { l.textContent = level; d.classList.add(level); } else l.remove();
        return d;
    }
    // Drop the oldest rows past max, show or hide the empty text, and stay at the bottom unless paused.
    settle() {
        const list = this.part('list'), s = this.part('scroller');
        if (this.max > 0) while (list.childElementCount > this.max) list.firstElementChild.remove();
        this.part('empty').hidden = list.childElementCount > 0;
        if (!this.paused) s.scrollTop = s.scrollHeight;
    }
    scrolled() {
        const s = this.part('scroller'), pause = !atBottom(s.scrollTop, s.clientHeight, s.scrollHeight);
        if (pause === this.paused) return;
        this.paused = pause;
        this.emit('pk-pause', { paused: pause }, { cancelable: false });
    }
    updated() { this.settle(); }
};
