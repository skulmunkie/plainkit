// pk-checkbox behaviour: a native checkbox in a token skin, with an indeterminate state and select-all groups (a master with master="rows" mirrors every pk-checkbox group="rows").
export const flagsOf = v => { const o = {}; for (const k in v) o[k] = v[k]; return o; };
export const triState = (checked, total) => (total === 0 || checked === 0 ? 'none' : checked === total ? 'all' : 'some');

export default Base => class extends Base {
    connected() {
        if (this.$init) return;
        this.$init = true; this.$initial = this.checked;
        const i = this.part('input');
        i.addEventListener('change', () => {
            this.checked = i.checked; this.indeterminate = false;
            if (this.master) for (const m of this.members(this.master)) if (!m.disabled) { m.checked = this.checked; m.indeterminate = false; }
            if (this.group) this.master_()?.sync();
            this.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
            this.emit('pk-change', { checked: this.checked });
        });
        i.addEventListener('input', () => this.dispatchEvent(new Event('input', { bubbles: true, composed: true })));
        if (this.master) customElements.whenDefined('pk-checkbox').then(() => this.sync());
    }
    root() { return this.getRootNode(); }
    members(name) { return [...this.root().querySelectorAll(`pk-checkbox[group="${CSS.escape(name)}"]`)]; }
    master_() { return this.group ? this.root().querySelector(`pk-checkbox[master="${CSS.escape(this.group)}"]`) : null; }
    sync() {
        const m = this.members(this.master); const state = triState(m.filter(c => c.checked).length, m.length);
        this.checked = state === 'all'; this.indeterminate = state === 'some';
    }
    updated() {
        const i = this.part('input');
        i.checked = this.checked; i.indeterminate = this.indeterminate;
        this.setValidity(flagsOf(i.validity), i.validationMessage, i);
        this.setFormValue(this.checked ? this.value : null, this.checked ? 'checked' : '');
    }
    onReset() { this.checked = this.$initial; this.indeterminate = false; }
    onRestore(state) { this.checked = state === 'checked'; }
    focus(o) { this.part('input').focus(o); }
    toggle() { this.part('input').click(); }
};
