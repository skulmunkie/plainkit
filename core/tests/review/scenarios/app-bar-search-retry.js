// pk-app-bar-search, a failed search (#1799): the results panel shows the error message and a Retry button under it, inside the panel, with a
// tap-sized button on a phone; pressing it raises pk-retry and asks again, and the panel stays open.
const HEADER = 'pk-app-shell >>> [part=header]';
const POP = '#q >>> [part=popup]';
const ERR = '#q >>> [part=error]';
const RETRY = '#q >>> [part=retry]';
const TEXT = '#q >>> [part=control] >>> [part=control]';

export default {
    name: 'app-bar-search-retry',
    issue: [1799],
    elements: ['app-bar-search', 'app-shell'],
    html: `<pk-app-shell>
<pk-button slot="header" id="menu" variant="ghost" size="mini" icon aria-label="Menu"><pk-icon name="menu"></pk-icon></pk-button>
<pk-app-bar-search slot="header" id="q" debounce="10" placeholder="Search products and orders"></pk-app-bar-search>
<pk-stack><p>Recent orders appear here.</p></pk-stack>
</pk-app-shell>`,
    steps: [
        { click: '#q >>> [part=expand]', on: ['phone'] },
        { click: TEXT, on: ['desktop'] },
        { type: 'inv' },
        { wait: 100 },
        { set: '#q', prop: 'error', value: 'Search is unavailable. Try again.' },
        { wait: 100 },
        { shot: 'failed' },
        { click: RETRY }, { wait: 100 },
        { shot: 'retried' },
        { set: '#q', prop: 'error', value: '' },
        { set: '#q', prop: 'items', value: [{ id: 'i1', label: 'Invoice 5531', sub: 'Chandra Supply' }] },
        { wait: 100 },
        { shot: 'recovered' },
    ],
    expect(t) {
        const phone = t.viewport.name !== 'desktop';
        if (t.shot === 'failed' || t.shot === 'retried') {
            t.visible(POP, 'the results panel');
            t.inViewport(POP);
            t.hasText(ERR, 'Search is unavailable');
            t.visible(RETRY, 'the Retry button');
            t.within(RETRY, POP);
            t.within(ERR, POP);
            t.flushBelow(RETRY, ERR);
            t.noOverlap(RETRY, ERR);
            if (phone) t.atLeast(RETRY, 'height', 44);
            t.contrast(ERR, POP);
        }
        if (t.shot === 'recovered') {
            t.visible(POP, 'the results panel');
            t.hasText(POP, 'Invoice 5531');
            t.hidden(RETRY, 'Retry once results arrive');
            t.hidden(ERR, 'the error once results arrive');
        }
    },
};
