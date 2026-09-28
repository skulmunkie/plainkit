// pk-nav-item inside a pk-navbar (#381): the container styles the item. A current item shows the bar's bottom mark (not the side nav's start bar), on the same row as plain links.
export default {
    name: 'navbar-nav-item',
    issue: [381],
    elements: ['nav-item', 'navbar'],
    html: `<pk-navbar label="Main"><a slot="brand" href="#">Brand</a><pk-nav-item href="#" current>Orders</pk-nav-item><pk-nav-item href="#">Reports</pk-nav-item><a href="#">Plain link</a></pk-navbar>`,
    steps: [{ wait: 300 }, { shot: 'idle' }],
    expect(t) {
        if (window.innerWidth < 1024) return;
        const mark = t.style('pk-navbar > pk-nav-item[current] >>> [part=link]', 'box-shadow');
        t.ok(mark !== 'none' && !/ 3px 0px 0px/.test(mark), `the current item shows the bar mark (bottom), got ${mark}`);
        const a = t.rect('pk-navbar > pk-nav-item[current]'), b = t.rect('pk-navbar > pk-nav-item:not([current])');
        if (a && b) t.ok(Math.abs(a.y - b.y) <= 1, 'items share one row');
    },
};
