// pk-page-header variant="record" titled by its last crumb on a phone (issue 1734): two or more inline actions take their own row under the crumbs, never over them.
const H = '#ph', TRAIL = '#ph >>> [part="trail"]', FIRST = '#ph pk-button:nth-of-type(1)', LAST = '#ph pk-button:nth-of-type(3)';
export default {
    name: 'page-header-record-phone',
    issue: [1734],
    elements: ['page-header'],
    html: `<pk-page-header id="ph" variant="record" home-href="#home" crumbs='[{"label":"Purchase orders","href":"/po"},{"label":"Order 1042"}]'><pk-badge variant="ok">Open</pk-badge><pk-button slot="actions" variant="primary">+ Record something</pk-button><pk-button slot="actions" variant="ghost">Second action</pk-button><pk-button slot="actions" variant="ghost">Third action</pk-button></pk-page-header>`,
    steps: [{ shot: 'rest' }],
    expect(t) {
        t.visible(TRAIL, 'the crumbs');
        if (t.viewport.name === 'phone') {
            t.flushBelow(FIRST, TRAIL, 16);
            t.within(LAST, H);
        } else t.sameRow(FIRST, TRAIL, 12);
    },
};
