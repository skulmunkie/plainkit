// pk-record-page with `sticky` (#1601): a long edit form scrolled 800px keeps its title bar under the app bar, and Edit/Cancel/Save sit in that bar so Save stays reachable.
const RP = 'pk-record-page';
const BAR = 'pk-app-shell >>> [part=header]';
const BODY = 'pk-app-shell >>> [part=body]';
const HEADER = `${RP} >>> [part=header] >>> [part=header]`; // the shell's own pk-page-header
const SAVE = `${RP} >>> [part=save]`;
const FIELDS = Array.from({ length: 24 }, (_, i) => ({ key: `f${i + 1}`, label: `Field ${i + 1}` }));

export default {
    name: 'record-page-sticky',
    issue: [1601],
    elements: ['record-page', 'page-shell', 'page-header'],
    html: `<pk-app-shell>
<pk-button slot="header" data-nav-toggle variant="ghost" size="mini" icon aria-label="Toggle the menu"><pk-icon name="menu"></pk-icon></pk-button>
<pk-record-page></pk-record-page>
</pk-app-shell>`,
    setup(frame) {
        const el = frame.querySelector(RP);
        el.load = () => ({});
        el.save = () => Promise.resolve();
        el.config = { id: '1', title: 'Order 1', fields: FIELDS, sticky: true };
        el.mode = 'edit';
    },
    steps: [{ waitFor: SAVE }, { shot: 'top' }, { scroll: BODY, to: 800 }, { shot: 'scrolled' }],
    expect(t) {
        t.visible(SAVE, 'the Save button');
        if (t.shot === 'scrolled') {
            t.ok(t.metric(BODY, 'scrollTop') >= 790, `the body scrolled to ${t.metric(BODY, 'scrollTop')}px, expected 800`);
            t.flushBelow(HEADER, BAR);
            t.inViewport(HEADER);
            t.inViewport(SAVE);
        }
    },
};
