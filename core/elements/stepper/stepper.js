// Plainkit stepper logic: the state of each step and whether it can be entered. Pure, so it can be tested without a DOM.
// The element (<pk-stepper current orientation linear clickable>) sets `state` and `index` on its <pk-step> children from these.
//
// State per step: done (before current), active (the current one), todo (after it), error (listed in `errors`, whatever its position).

export const STATES = ['todo', 'active', 'done', 'error'];

export function stepStates(count, current, errors = []) {
    return Array.from({ length: count }, (_, i) => (errors.includes(i) ? 'error' : i < current ? 'done' : i === current ? 'active' : 'todo'));
}

// A linear wizard lets you go back to any step you have reached and stay on the current one, never skip ahead; a non-linear one allows any step.
export function canEnter(index, current, { linear = true, furthest = current, count = Infinity } = {}) {
    if (index < 0 || index >= count) return false;
    return !linear || index <= Math.max(current, furthest);
}

// The index a movement key selects among steps, or null. Vertical steppers use Up/Down, horizontal ones Left/Right (mirrored in rtl).
export function stepKey(key, current, count, { vertical = false, rtl = false } = {}) {
    if (count <= 0) return null;
    const forward = vertical ? 'ArrowDown' : (rtl ? 'ArrowLeft' : 'ArrowRight');
    const back = vertical ? 'ArrowUp' : (rtl ? 'ArrowRight' : 'ArrowLeft');
    if (key === forward) return Math.min(current + 1, count - 1);
    if (key === back) return Math.max(current - 1, 0);
    if (key === 'Home') return 0;
    if (key === 'End') return count - 1;
    return null;
}

// The text a screen reader gets for a step: "Step 2 of 4: Pricing, current" and so on.
export const stepLabel = (index, count, title, state) => `Step ${index + 1} of ${count}: ${title}${state === 'active' ? ', current' : state === 'done' ? ', completed' : state === 'error' ? ', has an error' : ''}`;

// pk-stepper: sets each pk-step's state, index and position, and moves between steps by click or key.
export default Base => class extends Base {
    connected() {
        if (!this.$w) {
            this.$w = true; this.$far = this.current; customElements.whenDefined('pk-step').then(() => this.sync());
            this.watchSlot('', () => this.sync());
            this.addEventListener('click', e => { const s = e.target.closest('pk-step'); if (s && this.clickable) this.goTo(this.steps.indexOf(s)); });
            this.addEventListener('keydown', e => {
                const s = e.target.closest('pk-step'); if (!s || !this.clickable) return;
                const i = this.steps.indexOf(s);
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.goTo(i); return; }
                const to = stepKey(e.key, i, this.steps.length, { vertical: this.orientation === 'vertical', rtl: this.matches(':dir(rtl)') });
                if (to !== null) { e.preventDefault(); this.steps[to].focus(); }
            });
        }
        this.sync();
    }
    get steps() { return this.slotted().filter(s => s.localName === 'pk-step'); }
    changed(name) { if (name === 'current') this.$far = Math.max(this.$far ?? 0, this.current); if (name !== 'label') this.sync(); }
    sync() {
        const steps = this.steps; const errs = this.errors.split(',').filter(x => x.trim() !== '').map(x => Number(x.trim())).filter(Number.isInteger);
        const states = stepStates(steps.length, this.current, errs);
        steps.forEach((s, i) => {
            s.state = states[i]; s.index = i + 1; s.last = i === steps.length - 1; s.clickable = this.clickable; s.orientation = this.orientation;
            s.disabled = this.clickable && !canEnter(i, this.current, { linear: !this.free, furthest: this.$far ?? this.current, count: steps.length });
            s.tabIndex = this.clickable && !s.disabled ? 0 : -1;
            s.aria({ role: this.clickable ? 'button' : 'listitem', ariaLabel: stepLabel(i, steps.length, s.heading || s.textContent.trim(), states[i]), ariaCurrent: states[i] === 'active' ? 'step' : null, ariaDisabled: s.disabled ? 'true' : null });
        });
    }
    goTo(i) {
        const steps = this.steps;
        if (i === this.current || !canEnter(i, this.current, { linear: !this.free, furthest: this.$far ?? this.current, count: steps.length })) return;
        if (this.emit('pk-step-change', { index: i, previous: this.current })) this.current = i;
    }
    next() { this.goTo(this.current + 1); }
    previous() { this.goTo(this.current - 1); }
};
