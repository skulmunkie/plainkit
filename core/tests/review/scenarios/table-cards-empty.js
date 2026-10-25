// pk-table cards (issue 1777): a column that has a value for only some rows draws no dangling label in the cards that have none.
export default {
    name: 'table-cards-empty',
    issue: [1777],
    elements: ['table'],
    html: `<pk-table cards label="Orders" columns='[{"key":"no","label":"Order","title":true},{"key":"vendor","label":"Vendor"},{"key":"status","label":"Status"}]' rows='[{"id":1,"no":"PO-1001","vendor":"Acme","status":"Late"},{"id":2,"no":"PO-1002","vendor":"Globex","status":""},{"id":3,"no":"PO-1003","vendor":"Initech","status":""}]'></pk-table>`,
    steps: [{ shot: 'rest' }],
    expect(t) {
        t.inViewport('pk-table');
    },
};
