export default Base => class extends Base {
    updated() {
        const root = this.part('root');
        const scrollable = this.scroll && this.scroll !== 'none';
        if (scrollable) {
            root.setAttribute('tabindex', '0');
            root.setAttribute('role', 'region');
            if (this.label) root.setAttribute('aria-label', this.label);
            else { root.removeAttribute('aria-label'); this.warnOnce('label', `scroll="${this.scroll}" is set but label is empty: the scrolling region has no accessible name`, { scroll: this.scroll }); }
        } else {
            root.removeAttribute('tabindex');
            root.removeAttribute('role');
            root.removeAttribute('aria-label');
        }
    }
};
