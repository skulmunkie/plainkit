// pk-master-detail-page static slotted mode (#1829): the author's own list (slot=list) and record (slot=detail), no config and no script wiring. Wide: both side by side. Phone: one
// pane at a time, the record only when the host wrote record-id (a second shot). The current row is the one the author marked; the record's back link is the author's own.
export default {
    name: 'master-detail-static',
    elements: ['master-detail-page'],
    html: '<pk-master-detail-page id="md">'
        + '<nav slot="list" aria-label="Orders"><ul><li><a href="#o1">Order 1</a></li><li><a href="#o2" aria-current="page">Order 2</a></li><li><a href="#o3">Order 3</a></li></ul></nav>'
        + '<article slot="detail" id="rec"><h2>Order 2</h2><p>Plain server-rendered record, shown as written.</p><p><a href="#orders">Back to the orders</a></p></article>'
        + '</pk-master-detail-page>',
    steps: [{ wait: 400 }, { shot: 'list' }, { set: '#md', attr: 'record-id', value: '2' }, { wait: 300 }, { shot: 'record' }],
    expect(t) {
        t.inViewport('#md');
        t.exists('#md a[aria-current="page"]');
        if (t.shot === 'record' || t.viewport.name !== 'phone') t.visible('#rec', 'the author\'s record');
        if (t.shot === 'list' && t.viewport.name === 'phone') t.visible('#md nav', 'the author\'s list on a phone with no record-id');
        if (t.viewport.name !== 'phone') t.visible('#md nav', 'the author\'s list beside the record');
    },
};
