// pk-master-detail-page static slotted mode with a flat pk-list-group as the master list (#1878): wide, the list is a real column beside the record with the current row marked
// (aria-current); on a phone with a record the page's own Menu button opens the list as a drawer over the record (second shot), and a row chosen or Escape closes it.
const MD = 'pk-master-detail-page';

export default {
    name: 'master-detail-list',
    elements: ['master-detail-page', 'list-group', 'button'],
    html: `<${MD} id="md" record-id="2">`
        + '<pk-list-group slot="list" id="orders" variant="action" label="Orders"><a href="#o1">Order 1</a><a href="#o2" aria-current="page">Order 2</a><a href="#o3">Order 3</a><a href="#o4">Order 4</a></pk-list-group>'
        + '<article slot="detail" id="rec"><h2>Order 2</h2><p>Plain server-rendered record, shown as written.</p></article>'
        + `</${MD}>`,
    steps: [{ wait: 400 }, { shot: 'record' }, { click: `${MD} >>> [part=menu]`, on: ['phone'] }, { wait: 300, on: ['phone'] }, { shot: 'menu-open', on: ['phone'] }, { key: 'Escape', on: ['phone'] }, { wait: 300, on: ['phone'] }, { shot: 'menu-closed', on: ['phone'] }],
    expect(t) {
        t.inViewport(MD);
        t.exists('#orders a[aria-current="page"]');
        if (t.viewport.name !== 'phone') {
            t.visible('#orders', 'the master list beside the record');
            t.visible('#rec', 'the record');
            t.noOverlap('#orders', '#rec');
            t.hidden(`${MD} >>> [part=menu]`, 'the Menu button (wide has both panes)');
            return;
        }
        t.visible('#rec', 'the record');
        t.visible(`${MD} >>> [part=menu]`, 'the Menu button');
        if (t.shot === 'menu-open') { t.visible('#orders', 'the open list drawer'); t.inViewport('#orders'); } else t.hidden('#orders', 'the closed list');
    },
};
