// pk-record-page host sections (#1000): children slot="main-before" / "main-after" frame the field list, "side-after" follows the sidebar cards.
const RP = 'pk-record-page';
const MAIN = `${RP} >>> [part=main]`;

export default {
    name: 'record-page-sections',
    elements: ['record-page', 'detail-layout', 'field-list', 'card'],
    html: '<pk-record-page><pk-card slot="main-before" heading="Banner">Imported record.</pk-card><pk-card slot="main-after" heading="Activity">Created by the import.</pk-card><pk-card slot="side-after" heading="Related">Two open orders.</pk-card></pk-record-page>',
    setup(frame) {
        const el = frame.querySelector(RP);
        el.load = () => ({ name: 'Widget 1 Cover A', sku: 'AC-1001' });
        el.config = { id: '1', heading: 'Product', fields: [{ name: 'name', label: 'Name' }, { name: 'sku', label: 'SKU' }], sidebar: [{ heading: 'Summary', fields: ['sku'] }] };
    },
    steps: [{ shot: 'view' }],
    expect(t) {
        t.visible(`${RP} > [slot=main-before]`, 'the main-before section');
        t.visible(`${RP} > [slot=main-after]`, 'the main-after section');
        t.visible(`${RP} > [slot=side-after]`, 'the side-after section');
        t.noOverlap(`${RP} > [slot=main-before]`, MAIN);
        t.noOverlap(MAIN, `${RP} > [slot=main-after]`);
    },
};
