// pk-record-page host sections (#1000): children slot="main-before" / "main-after" frame the field list or form, "side-after" follows the sidebar cards; in edit mode a custom field shows the child slot="editor-<key>".
const RP = 'pk-record-page';
const MAIN = `${RP} >>> [part=main]`;

export default {
    name: 'record-page-sections',
    elements: ['record-page', 'detail-layout', 'field-list', 'card', 'field-group', 'switch'],
    html: '<pk-record-page><pk-card slot="main-before" heading="Banner">Imported record.</pk-card><pk-card slot="main-after" heading="Activity">Created by the import.</pk-card><pk-switch slot="editor-gift">Gift wrap</pk-switch><pk-card slot="side-after" heading="Related">Two open orders.</pk-card></pk-record-page>',
    setup(frame) {
        const el = frame.querySelector(RP);
        el.load = () => ({ name: 'Widget 1 Cover A', sku: 'AC-1001' });
        el.save = () => Promise.resolve();
        el.config = { id: '1', heading: 'Product', fields: [{ name: 'name', label: 'Name' }, { name: 'sku', label: 'SKU' }, { key: 'gift', label: 'Gift', kind: 'custom' }], sidebar: [{ heading: 'Summary', fields: ['sku'] }] };
    },
    steps: [{ shot: 'view' }, { click: `${RP} >>> [part=edit]` }, { shot: 'edit' }],
    expect(t) {
        if (t.shot === 'edit') { t.visible(`${RP} > pk-switch[slot=editor-gift]`, 'the custom field editor'); t.noOverlap(`${RP} > pk-switch[slot=editor-gift]`, `${RP} > [slot=main-after]`); }
        t.visible(`${RP} > [slot=main-before]`, 'the main-before section');
        t.visible(`${RP} > [slot=main-after]`, 'the main-after section');
        t.visible(`${RP} > [slot=side-after]`, 'the side-after section');
        t.noOverlap(`${RP} > [slot=main-before]`, MAIN);
        t.noOverlap(MAIN, `${RP} > [slot=main-after]`);
    },
};
