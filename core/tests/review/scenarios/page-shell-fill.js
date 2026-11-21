// pk-page-shell fill (#1675): the shell takes the height of a fixed-height parent and its one child takes what the header leaves, down to the foot of the parent.
export default {
    name: 'page-shell-fill',
    elements: ['page-shell'],
    html: '<div id="box"><pk-page-shell fill heading="Orders"><pk-card heading="Rows"><p>Row 1</p><p>Row 2</p></pk-card></pk-page-shell></div>',
    setup(frame) { const b = frame.querySelector('#box'); b.style.blockSize = '24rem'; b.style.display = 'flex'; b.style.flexDirection = 'column'; },
    steps: [{ wait: 'settle' }, { shot: 'filled' }],
    expect(t) {
        t.within('pk-page-shell', '#box');
        const s = t.rect('pk-page-shell'), c = t.rect('pk-card'), b = t.rect('#box');
        t.ok(Math.abs(s.bottom - b.bottom) <= 1, 'the shell reaches the foot of its parent');
        t.ok(Math.abs(c.bottom - s.bottom) <= 1, 'the card reaches the foot of the shell');
    },
};
