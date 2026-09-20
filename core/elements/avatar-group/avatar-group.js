export default Base => class extends Base {
    connected() { this.watchSlot('', () => this.requestUpdate()); }
    updated() {
        const people = this.slotted();
        people.forEach((p, i) => { p.hidden = i >= this.max; });
        const more = Math.max(0, people.length - this.max);
        const tile = this.part('more');
        tile.hidden = more === 0;
        tile.textContent = `+${more}`;
        this.aria({ role: 'group', ariaLabel: this.label });
    }
};
