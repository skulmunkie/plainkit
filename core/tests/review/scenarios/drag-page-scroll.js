// Page-level auto-scroll while dragging (issue 332): a long pk-sortable list taller than the window. A drag whose pointer sits near the bottom edge of the window scrolls the page
// (js/drag-scroll.js, shared with pk-kanban), so the first row leaves the top and the drop line follows the row under the pointer; the drop stops the scroll. The setter plays the
// row handle's own events (grab, then a move to the bottom edge), like the kanban scenario, because a screenshot needs a drag in progress.
const ROWS = Array.from({ length: 60 }, (_, i) => `<pk-sortable-item value="r${i}">Step ${i + 1}: something to do</pk-sortable-item>`).join('');

export default {
    name: 'drag-page-scroll',
    elements: ['sortable', 'sortable-item'],
    html: `<pk-sortable id="list" label="Steps">${ROWS}</pk-sortable>`,
    setup(frame) {
        const list = frame.querySelector('#list'), first = list.querySelector('pk-sortable-item');
        const ev = (type, detail) => first.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
        Object.defineProperty(list, 'demoDrag', { set(on) {
            if (!on) return ev('pk-sortable-drop', { cancelled: true });
            const r = first.getBoundingClientRect();
            ev('pk-sortable-grab', { x: r.left + 20, y: r.top + 10 });
            ev('pk-sortable-drag', { x: r.left + 20, y: innerHeight - 6 });
        } });
    },
    steps: [
        { shot: 'rest' },
        { set: '#list', prop: 'demoDrag', value: true }, { wait: 700 }, { shot: 'scrolled-while-dragging' },
        { set: '#list', prop: 'demoDrag', value: false }, { wait: 100 },
    ],
    expect(t) {
        const first = t.rect('#list pk-sortable-item');
        if (!first) return;
        if (t.shot === 'rest') t.ok(first.y >= 0, 'at rest the first row is on screen');
        if (t.shot === 'scrolled-while-dragging') {
            t.exists('#list[dragging]');
            t.ok(first.y < 0 || first.bottom < 0, `the page scrolled under the dragging pointer near the window bottom (first row now at y=${Math.round(first.y)})`);
        }
    },
};
