// pk-master-detail-page (#353): nothing selected (the list, and beside it an empty record pane when wide), a record selected from the route
// (side by side when wide, the record alone with Back on a phone), and the record's error state. The route is a button that sets `recordId`.
const MD = 'pk-master-detail-page';
const PARTS = `${MD} >>> `;

export default {
    name: 'master-detail-page',
    elements: ['master-detail-page', 'list-page', 'alert', 'button'],
    html: '<pk-stack gap="md"><pk-stack direction="row" gap="sm"><pk-button id="open" size="sm">Open record 2</pk-button><pk-button id="fail" size="sm">Open a failing record</pk-button><pk-button id="clear" size="sm">Clear</pk-button></pk-stack><pk-master-detail-page></pk-master-detail-page></pk-stack>',
    setup(frame) {
        const el = frame.querySelector(MD);
        el.config = { list: { columns: [{ key: 'name', label: 'Name' }, { key: 'status', label: 'Status' }] }, backLabel: 'Things', none: { heading: 'No record selected', description: 'Pick a thing from the list.' } };
        el.load = () => ({ rows: [{ id: '1', name: 'Blue widget', status: 'Active' }, { id: '2', name: 'Red gadget', status: 'Draft' }, { id: '3', name: 'Green gizmo', status: 'Archived' }], total: 3 });
        el.mountDetail = (pane, id) => {
            if (id === 'bad') throw new Error('The record could not be loaded.');
            const h = frame.ownerDocument.createElement('h2'); h.textContent = id === '2' ? 'Red gadget' : `Record ${id}`;
            pane.append(h);
        };
        const route = id => () => { el.recordId = id; };
        frame.querySelector('#open').addEventListener('click', route('2'));
        frame.querySelector('#fail').addEventListener('click', route('bad'));
        frame.querySelector('#clear').addEventListener('click', route(''));
    },
    steps: [
        { wait: 500 }, { shot: 'none' },
        { click: '#open' }, { wait: 400 }, { shot: 'selected' },
        { click: '#fail' }, { wait: 400 }, { shot: 'error' },
    ],
    expect(t) {
        t.inViewport(MD);
        const phone = t.viewport.name !== 'desktop';
        if (t.shot === 'none') {
            t.visible(`${PARTS}[part=master]`, 'the list');
            t.visible(`${PARTS}[part=list]`, 'the list page');
            if (!phone) t.visible(`${PARTS}[part=none] pk-empty-state`, 'the empty record pane');
            else t.hidden?.(`${PARTS}[part=detail]`);
        }
        if (t.shot === 'selected') {
            t.hasText(`${PARTS}[part=record]`, 'Red gadget');
            if (!phone) { t.noOverlap(`${PARTS}[part=master]`, `${PARTS}[part=detail]`); t.within(`${PARTS}[part=detail]`, MD, 1); }
            else { t.visible(`${PARTS}[part=back]`, 'the Back button'); t.within(`${PARTS}[part=detail]`, MD, 1); }
        }
        if (t.shot === 'error') {
            t.visible(`${PARTS}[part=state] pk-alert`, 'the error alert');
            t.hasText(`${PARTS}[part=state] pk-alert`, 'could not be loaded');
            t.visible(`${PARTS}[part=state] pk-button`, 'the Retry button');
        }
    },
};
