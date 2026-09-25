// Sticky sidebar: measure it so a sidebar taller than the viewport docks by its bottom edge instead of its top (issue 281).
export default Base => class extends Base {
    connected() {
        const side = this.part('sidebar');
        if (!side || typeof ResizeObserver === 'undefined') return;
        this.$ro ||= new ResizeObserver(() => side.style.setProperty('--pk-detail-layout-height', side.offsetHeight + 'px'));
        this.$ro.observe(side);
    }
    disconnected() { this.$ro?.disconnect(); }
};
