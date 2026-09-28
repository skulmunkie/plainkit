// pk-kanban (issue 332): the resting board, a card dragged over another column (its drop-target highlight and insertion line), an empty column, a long column that scrolls
// inside itself, and the keyboard move. The board applies nothing itself, so setup() plays the host: on pk-move it moves the real card node.
const CARDS = n => Array.from({ length: n }, (_, i) => `<pk-sortable-item value="m${i}"><pk-card heading="Task ${i + 1}" level="3">Something to do.</pk-card></pk-sortable-item>`).join('');

export default {
    name: 'kanban',
    elements: ['kanban', 'kanban-column', 'sortable-item', 'card'],
    html: `<pk-kanban id="board" label="Sprint board">
  <pk-kanban-column id="todo" value="todo" label="To do">${CARDS(2)}</pk-kanban-column>
  <pk-kanban-column id="doing" value="doing" label="In progress"><pk-sortable-item value="d1"><pk-card heading="Build the board" level="3">Pointer, touch and keys.</pk-card></pk-sortable-item></pk-kanban-column>
  <pk-kanban-column id="done" value="done" label="Done" empty-text="Nothing shipped yet"></pk-kanban-column>
  <pk-kanban-column id="long" value="long" label="Backlog">${CARDS(12)}</pk-kanban-column>
</pk-kanban>`,
    setup(frame) {
        const board = frame.querySelector('#board');
        board.addEventListener('pk-move', e => {
            const { item, to, toIndex } = e.detail;
            const card = board.querySelector(`pk-sortable-item[value="${item}"]`), col = board.querySelector(`pk-kanban-column[value="${to}"]`);
            const rest = Array.from(col.children).filter(c => c !== card);
            col.insertBefore(card, rest[toIndex] ?? null);
        });
        // A still screenshot needs a drag in progress: the setter plays the handle's own events (grab, then a move over the "Done" column) and its release.
        const first = board.querySelector('#todo pk-sortable-item'), ev = (type, detail) => first.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
        Object.defineProperty(board, 'demoDrag', { set(on) {
            if (!on) return ev('pk-sortable-drop', { cancelled: true });
            const done = board.querySelector('#done'); done.scrollIntoView({ block: 'nearest', inline: 'center' }); // a phone shows one column: bring it under a pointer that sits clear of the edge zones
            const r = done.getBoundingClientRect();
            ev('pk-sortable-grab', { x: 0, y: 0 });
            ev('pk-sortable-drag', { x: r.left + r.width / 2, y: r.top + 60 });
        } });
    },
    steps: [
        { shot: 'rest' },
        { set: '#board', prop: 'demoDrag', value: true }, { shot: 'dragging' },
        { set: '#board', prop: 'demoDrag', value: false },
        { focus: '#todo pk-sortable-item' }, { key: 'Alt+ArrowRight' }, { wait: 100 },
        { shot: 'moved' },
        { scroll: '#long >>> [part=list]', to: 600 }, { shot: 'scrolled' },
    ],
    expect(t) {
        t.inViewport('#board');
        t.visible('#done >>> [part=empty]', 'the empty column shows its message, a drop target that cannot be missed');
        t.hasText('#todo >>> [part=count]', t.shot === 'moved' || t.shot === 'scrolled' ? '1' : '2');
        if (t.shot === 'dragging') t.exists('#done[drop-target]');
        const long = t.rect('#long');
        if (long) t.ok(long.height <= 560, `a 12-card column scrolls inside itself (height ${Math.round(long.height)}px), it must not grow the page`);
        const a = t.rect('#todo'), b = t.rect('#doing');
        if (a && b && t.viewport.name === 'desktop') t.ok(Math.abs(a.y - b.y) < 1, 'columns share one row and start at the same top');
    },
};
