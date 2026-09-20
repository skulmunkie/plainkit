// pk-toast-stack: the live region for one screen position. Shows at most `max` toasts; the rest wait (hidden, timers not started).
// PkToast.show(message, options) creates the stack for a position on demand and pushes a toast.
const POSITIONS = ['top-start', 'top', 'top-end', 'bottom-start', 'bottom', 'bottom-end'];

function show(message, o = {}) {
    const position = POSITIONS.includes(o.position) ? o.position : 'bottom-end';
    let stack = document.querySelector(`pk-toast-stack[position="${position}"]`);
    if (!stack) { stack = document.createElement('pk-toast-stack'); stack.setAttribute('position', position); document.body.append(stack); }
    const t = document.createElement('pk-toast');
    t.setAttribute('kind', o.kind ?? 'info');
    if (o.heading) t.heading = o.heading;
    if (Number.isFinite(o.duration)) t.duration = o.duration;
    if (o.noClose) t.noClose = true;
    t.append(document.createTextNode(message));
    if (o.action?.label) {
        const b = document.createElement('pk-button'); b.slot = 'action'; b.setAttribute('variant', 'ghost'); b.textContent = o.action.label;
        b.addEventListener('click', () => o.action.onClick?.());
        t.append(b);
    }
    stack.push(t);
    return t;
}

export default Base => class extends Base {
    static show(message, options) { return show(message, options); }
    connected() {
        if (!this.$w) {
            this.$w = true;
            this.watchSlot('', () => this.layout());
            this.addEventListener('pk-dismiss', () => queueMicrotask(() => this.layout()));
        }
        this.aria({ role: 'region', ariaLabel: 'Notifications' });
        globalThis.PkToast ??= this.constructor;
        this.layout();
    }
    changed(name) { if (name === 'max') this.layout(); }
    push(toast) { this.append(toast); }
    layout() {
        const toasts = this.slotted().filter(t => t.localName === 'pk-toast');
        toasts.forEach((t, i) => { const on = i < (this.max > 0 ? this.max : 3); t.hidden = !on; if (on) t.begin?.(); });
    }
};
