// pk-page-header variant="record" on a phone with a long last crumb, a badge popover and an icon-collapsed action (issue 1739): about two rows, the title one line with an ellipsis.
const TRAIL = '#ph >>> [part="trail"]', POP = '#ph pk-badge-popover', BADGE = '#ph pk-badge';
export default {
    name: 'page-header-record-long-title',
    issue: [1739],
    elements: ['page-header', 'badge-popover'],
    html: `<pk-page-header id="ph" variant="record" home-href="#home" home-label="Home" tabs-from="phone" crumbs='[{"label":"Items","href":"#items"},{"label":"A record title long enough to wrap onto three lines on a phone screen"}]'><pk-badge>Active</pk-badge><pk-badge variant="ok">Live</pk-badge><pk-badge-popover variant="warn" heading="2 checks failing">2<div slot="details">Details</div></pk-badge-popover><pk-button slot="actions" variant="primary" icon-name="refresh" collapse="phone">Sync</pk-button><pk-dropdown slot="actions"><pk-button slot="trigger" variant="ghost" icon icon-name="more" label="More actions"></pk-button></pk-dropdown></pk-page-header>`,
    steps: [{ shot: 'rest' }],
    expect(t) {
        t.visible(TRAIL, 'the crumbs');
        if (t.viewport.name === 'phone') {
            t.ok(t.rect(POP).height <= 32, 'the badge popover pill is badge height');
            t.ok(t.rect('#ph').height <= 110, 'the header is about two rows high');
            t.sameRow(POP, BADGE, 6);
        }
    },
};
