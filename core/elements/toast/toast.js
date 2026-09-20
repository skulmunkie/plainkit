// Toast logic: the decisions behind the snackbar stack. Pure, so it can be tested without a DOM.
export const POSITIONS = ['top-start', 'top', 'top-end', 'bottom-start', 'bottom', 'bottom-end'];
export const KINDS = ['info', 'success', 'warning', 'danger'];
export const DEFAULT_POSITION = 'bottom-end';
export const DEFAULT_MAX = 3;
export const DEFAULT_DURATION = 5000;
export const ACTION_DURATION = 8000;

export const normalizePosition = p => (POSITIONS.includes(p) ? p : DEFAULT_POSITION);
export const normalizeKind = k => (KINDS.includes(k) ? k : 'info');

// Warnings and errors interrupt a screen reader (role alert); the rest wait their turn (role status).
export const roleFor = kind => (kind === 'danger' || kind === 'warning' ? 'alert' : 'status');

// A toast with a button needs longer. Zero means "stay until dismissed"; a negative or missing request means "automatic".
export function durationFor(requested, hasAction) {
    if (requested === 0) return 0;
    if (Number.isFinite(requested) && requested > 0) return requested;
    return hasAction ? ACTION_DURATION : DEFAULT_DURATION;
}

// How many queued toasts may appear now, given how many are visible.
export function showCount(visible, max, queued) {
    return Math.max(0, Math.min(queued, (max > 0 ? max : DEFAULT_MAX) - visible));
}

// Hovering or focusing a toast pauses its timer; what is left is the total minus the time it has run.
export function remainingAfter(total, ranFor) {
    return total === 0 ? 0 : Math.max(0, total - ranFor);
}

// The queue as a pure structure: push a request, take what fits, drop one that closed.
export function createQueue(max = DEFAULT_MAX) {
    const visible = new Set();
    const waiting = [];
    return {
        push(item) { waiting.push(item); return this.drain(); },
        drain() {
            const out = [];
            for (let n = showCount(visible.size, max, waiting.length); n > 0; n--) { const next = waiting.shift(); visible.add(next); out.push(next); }
            return out;
        },
        close(item) { visible.delete(item); const i = waiting.indexOf(item); if (i >= 0) waiting.splice(i, 1); return this.drain(); },
        get visibleCount() { return visible.size; },
        get waitingCount() { return waiting.length; },
    };
}

// pk-toast: one transient message with a timer that pauses on hover and focus. It removes itself when dismissed.
export default Base => class extends Base {
    connected() {
        if (!this.$w) {
            this.$w = true;
            this.addEventListener('pointerenter', () => this.pause()); this.addEventListener('pointerleave', () => this.resume());
            this.addEventListener('focusin', () => this.pause()); this.addEventListener('focusout', () => this.resume());
            this.shadowRoot.addEventListener('click', e => { if (e.target.closest?.('[data-action="close"]')) this.dismiss('close'); });
            this.addEventListener('click', e => { if (e.target.closest('[slot="action"]')) this.dismiss('action'); });
        }
        if (this.parentElement?.localName !== 'pk-toast-stack') this.begin();
    }
    disconnected() { clearTimeout(this.$t); }
    updated() { this.aria({ role: roleFor(this.kind) }); }
    hasAction() { return this.slotted('action').length > 0; }
    begin() {
        if (this.$total !== undefined) return;
        this.$total = durationFor(this.duration, this.hasAction());
        this.run(this.$total);
    }
    run(ms) { clearTimeout(this.$t); this.$left = ms; if (ms > 0) { this.$since = performance.now(); this.$t = setTimeout(() => this.dismiss('timeout'), ms); } }
    pause() { if (this.$total === undefined || !this.$left) return; clearTimeout(this.$t); this.$left = remainingAfter(this.$left, performance.now() - this.$since); }
    resume() { if (this.$total === undefined || this.matches(':hover') || this.matches(':focus-within')) return; if (this.$left > 0) this.run(this.$left); }
    dismiss(reason = 'method') { if (this.emit('pk-dismiss', { reason })) { clearTimeout(this.$t); this.remove(); } }
};
