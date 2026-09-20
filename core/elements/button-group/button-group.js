// pk-button-group behaviour: a toggle mode. In single mode pressing one pk-button (with toggle) releases the others and it cannot be released; in multi mode each flips on its own.
// The pure rule is exported for the Node tests.
// Given the buttons' pressed states and the one that just changed, the pressed states after the group's rule.
export function afterToggle(mode, states, changed) {
    if (mode !== 'single') return states;
    return states.map((s, i) => i === changed);
}
export default Base => class extends Base {
    connected() {
        if (this.$init) return;
        this.$init = true;
        this.addEventListener('pk-toggle', e => {
            if (this.mode !== 'single') return;
            const all = [...this.querySelectorAll('pk-button[toggle]')];
            const i = all.indexOf(e.target);
            if (i < 0) return;
            const next = afterToggle('single', all.map(b => b.pressed), i);
            all.forEach((b, n) => { b.pressed = next[n]; });
        });
    }
};
