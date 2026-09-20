export default Base => class extends Base {
    updated() {
        this.style.setProperty('--pk-skeleton-lines', String(this.lines));
        if (this.size) this.style.setProperty('--pk-skeleton-size', this.size); else this.style.removeProperty('--pk-skeleton-size');
    }
};
