// A slot between the title bar and the list (issue 1603): it stays above the table, and with stickyHeader inside a definite-height body the rows still scroll while the pager stays in view.
const columns = [{ key: 'sku', label: 'SKU' }, { key: 'title', label: 'Title' }];
const rows = Array.from({ length: 120 }, (_, i) => ({ id: i + 1, sku: `AC-${1000 + i}`, title: `Widget number ${i + 1}` }));
const BODY = 'pk-app-shell >>> [part=body]';
const LIST = 'pk-list-page';

export default {
    name: 'list-page-before-list',
    issue: [1603],
    elements: ['list-page'],
    html: `<pk-app-shell flush><span slot="header">Orders</span><pk-list-page><pk-alert slot="before-list" id="note">Last sync: 12 orders.</pk-alert></pk-list-page><span slot="footer">Acme Inc.</span></pk-app-shell>`,
    setup(frame) {
        const lp = frame.querySelector(LIST);
        lp.config = { heading: 'Orders', columns, pageSize: 100, stickyHeader: true };
        lp.load = () => ({ rows, total: rows.length });
    },
    steps: [{ wait: 'settle' }, { wait: 300 }, { shot: 'resting' }],
    expect(t) {
        const body = t.rect(BODY), note = t.rect('#note'), table = t.rect('pk-list-page >>> pk-data-table'), head = t.rect('pk-list-page >>> pk-page-shell >>> [part=header]');
        if (!body || !note || !table || !head) return t.ok(false, 'the body, title bar, slotted note and table all render');
        t.ok(note.y >= head.y + head.height - 1, 'the note sits below the title bar');
        t.ok(note.y + note.height <= table.y + 1, 'the note sits above the list');
        const pager = t.rect('pk-list-page >>> pk-data-table >>> pk-pagination');
        t.ok(!!pager && pager.y + pager.height <= body.y + body.height + 1, 'the pager stays in the visible body: the slot does not push the list out (stickyHeader)');
    },
};
