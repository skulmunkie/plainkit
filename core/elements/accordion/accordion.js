export default Base => class extends Base {
    connected() {
        if (this.$t) return;
        // With exclusive, opening one item closes the others.
        this.$t = e => {
            if (!this.exclusive || !e.detail?.open) return;
            for (const item of this.slotted()) if (item !== e.target && item.open) item.open = false;
        };
        this.addEventListener('pk-toggle', this.$t);
    }
};
