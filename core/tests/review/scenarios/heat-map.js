// pk-heat-map (#1721, phase 1): issues by area at rest, a hovered box, the focus ring on a box (inset, so it is never clipped), the arrow keys moving focus, the data table in place of the map and right-to-left.
const ITEMS = [
    { id: 'billing', label: 'Billing', value: 42, severity: 'warning', href: '#billing' }, { id: 'auth', label: 'Sign-in', value: 31, severity: 'danger' }, { id: 'search', label: 'Search', value: 24 },
    { id: 'reports', label: 'Reports', value: 18, severity: 'info' }, { id: 'docs', label: 'Docs', value: 12, severity: 'success' }, { id: 'api', label: 'API', value: 9 },
    { id: 'mobile', label: 'Mobile', value: 6, severity: 'warning' }, { id: 'admin', label: 'Admin', value: 3 },
];
const M = '#m', MAP = '#m >>> [part=map]', BOX = '#m >>> .box';

export default {
    name: 'heat-map',
    issue: [1721],
    elements: ['heat-map'],
    html: `<div id="stage"><pk-heat-map id="m" label="Issues by area" items='${JSON.stringify(ITEMS)}'></pk-heat-map></div>`,
    steps: [
        { waitFor: BOX }, { shot: 'resting' },
        { hover: BOX }, { shot: 'hover' },
        { focus: BOX }, { shot: 'focus' },
        { key: 'ArrowRight' }, { key: 'ArrowDown' }, { shot: 'arrowed' },
        { set: M, attr: 'show-table', value: '' }, { shot: 'table' },
        { set: M, attr: 'show-table', value: null }, { set: '#stage', attr: 'dir', value: 'rtl' }, { waitFor: BOX }, { shot: 'rtl' },
    ],
    expect(t) {
        t.visible(M, 'the heat map'); t.within(M, '#stage');
        t.ok(t.metric('html', 'scrollWidth') <= t.metric('html', 'clientWidth') + 1, 'the page scrolls sideways');
        if (t.shot === 'table') { t.visible('#m >>> [part=table]', 'the data table'); t.hidden(MAP, 'the map'); return; }
        t.visible(BOX, 'a box'); t.within(BOX, MAP); t.visible('#m >>> .status', 'a severity word');
        t.ok(t.rect(MAP).width * t.rect(MAP).height > 0, 'the map has an area');
        t.atLeast(BOX, 'height', 44); t.atLeast(BOX, 'width', 44);
        t.contrast('#m >>> .box[data-severity=danger] .label', '#m >>> .box[data-severity=danger]');
        t.contrast('#m >>> .box[data-severity=warning] .label', '#m >>> .box[data-severity=warning]');
        t.contrast('#m >>> .box[data-severity=info] .label', '#m >>> .box[data-severity=info]');
        t.contrast('#m >>> .box[data-severity=success] .label', '#m >>> .box[data-severity=success]');
        t.contrast('#m >>> .box:not([data-severity=danger]):not([data-severity=warning]):not([data-severity=info]):not([data-severity=success]) .label', '#m >>> .box:not([data-severity=danger]):not([data-severity=warning]):not([data-severity=info]):not([data-severity=success])');
        if (t.shot === 'focus' || t.shot === 'arrowed') { t.ringVisible('#m >>> .box:focus-visible'); t.ringUnclipped('#m >>> .box:focus-visible'); }
    },
};
