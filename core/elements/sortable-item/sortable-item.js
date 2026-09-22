// pk-sortable-item behaviour: one row of a pk-sortable. It owns its own handle and pointer capture (like pk-splitter's separator) and tells its
// parent what happens through bubbling, composed events; it never reaches into the parent or its siblings. The parent pushes dragging and
// dropIndicator back down (like pk-tabs pushes selected) so this file never mutates state the list itself decides.
export default Base => class extends Base {
    connected() {
        if (this.$init) return;
        this.$init = true;
        const h = this.part('handle');
        h.addEventListener('pointerdown', e => this.grab(e));
        h.addEventListener('pointermove', e => this.drag(e));
        for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) h.addEventListener(type, e => this.drop(e));
    }
    grab(e) {
        if (this.disabled || e.button > 0) return;
        this.$id = e.pointerId;
        try { this.part('handle').setPointerCapture(e.pointerId); } catch { /* a synthetic pointer is not active: the drag still follows the handle's own events */ }
        this.emit('pk-sortable-grab', { x: e.clientX, y: e.clientY }, { cancelable: false });
    }
    drag(e) {
        if (this.$id !== e.pointerId) return;
        this.emit('pk-sortable-drag', { x: e.clientX, y: e.clientY }, { cancelable: false });
    }
    drop(e) {
        if (this.$id === undefined) return;
        const h = this.part('handle');
        if (h.hasPointerCapture?.(this.$id)) h.releasePointerCapture(this.$id);
        this.$id = undefined;
        this.emit('pk-sortable-drop', { cancelled: e.type === 'pointercancel' }, { cancelable: false });
    }
    updated() {
        this.aria({ role: 'listitem', ariaRoleDescription: 'Draggable item', ariaDisabled: this.disabled ? 'true' : null });
        const h = this.part('handle');
        h.disabled = this.disabled;
        h.setAttribute('aria-label', `Drag ${this.value || 'item'} to reorder`);
    }
};
