// pk-settings-page config.variant (#2137): the compact record header. The last crumb is the title and shares one row with the action; a heading would sit under the crumbs.
const SP = '#sp';
const CRUMBS = `${SP} >>> pk-breadcrumb`;
const ACTION = `${SP} >>> [slot=actions]`;
export default {
    name: 'settings-page-record-header',
    issue: [2137],
    elements: ['settings-page', 'page-header', 'page-shell'],
    html: '<div class="rv-page"><pk-settings-page id="sp"></pk-settings-page></div>',
    setup(frame) {
        frame.querySelector(SP).config = {
            variant: 'record',
            breadcrumb: [{ label: 'Home', href: '#' }, { label: 'Jobs' }],
            actions: [{ key: 'new', label: 'New job', variant: 'primary' }],
            sections: [{ heading: 'General', fields: [{ key: 'name', type: 'text', label: 'Name' }] }],
        };
    },
    steps: [{ wait: 'settle' }, { shot: 'rest' }],
    expect(t) {
        t.visible(CRUMBS, 'the crumbs');
        t.visible(ACTION, 'the action');
        t.noOverlap(CRUMBS, ACTION);
        if (t.viewport.name !== 'phone') t.sameRow(ACTION, CRUMBS, 8); // a phone's actions take their own row under the crumbs
        t.ok(t.metric('html', 'scrollWidth') <= t.metric('html', 'clientWidth') + 1, 'the page scrolls sideways');
    },
};
