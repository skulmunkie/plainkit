// pk-heat-map phase 3 (#1721): group-by (framed areas with a header, children inside), a group that is too small merging into Other, the Other members table open over the map, closed again with Escape, and right-to-left.
const kid = (id, label, value, severity) => ({ id, label, value, ...(severity ? { severity } : {}) });
const teams = [
    { id: 'pay', label: 'Payments', children: [kid('p1', 'Invoices', 30, 'warning'), kid('p2', 'Refunds', 10), kid('p3', 'Tax', 20, 'danger')] },
    { id: 'acc', label: 'Accounts', children: [kid('a1', 'Sign-in', 40, 'danger'), kid('a2', 'Profile', 20)] },
    { id: 'web', label: 'Web', children: [kid('w1', 'Search', 24), kid('w2', 'Docs', 12, 'success'), kid('w3', 'Pages', 8, 'info')] },
    { id: 'tiny1', label: 'Legal', children: [kid('t1', 'Terms', 1)] },
    { id: 'tiny2', label: 'Ops', children: [kid('t2', 'Backups', 1, 'warning')] },
];
const flat = [kid('big', 'Platform', 500), kid('mid', 'Web', 300), ...Array.from({ length: 6 }, (_, i) => kid(`s${i}`, `Small ${i + 1}`, 3, i === 0 ? 'danger' : undefined))];
const J = v => JSON.stringify(v);
const OTHER = '#o >>> .other', MORE = '#o >>> [part=more]', CLOSE = '#o >>> [part=more-close]';

export default {
    name: 'heat-map-groups',
    issue: [1721],
    elements: ['heat-map'],
    html: `<div id="stage"><pk-heat-map id="g" label="Issues by team and area" group-by items='${J(teams)}'></pk-heat-map><pk-heat-map id="o" label="Flat with Other" items='${J(flat)}'></pk-heat-map></div>`,
    steps: [
        { waitFor: '#g >>> .frame' }, { waitFor: OTHER }, { shot: 'resting' },
        { focus: '#g >>> .box' }, { shot: 'focus-child' },
        { click: OTHER }, { waitFor: CLOSE }, { shot: 'other-open' },
        { key: 'Escape' }, { shot: 'other-closed' },
        { set: '#stage', attr: 'dir', value: 'rtl' }, { wait: 'settle' }, { shot: 'rtl' },
    ],
    expect(t) {
        t.visible('#g', 'the grouped map'); t.visible('#g >>> .frame', 'a group frame'); t.visible('#g >>> .glabel', 'a group header');
        t.within('#g >>> .box', '#g >>> [part=map]'); t.noOverlap('#g', '#o');
        t.ok(t.metric('html', 'scrollWidth') <= t.metric('html', 'clientWidth') + 1, 'the page scrolls sideways');
        if (t.shot === 'other-open') { t.visible(MORE, 'the Other table'); t.within(MORE, '#o'); t.atLeast(CLOSE, 'height', 44); t.contrast('#o >>> [part=more-title]', '#o >>> [part=more]'); }
        else t.hidden(MORE, 'the Other table');
        if (t.shot === 'focus-child') t.ringUnclipped('#g >>> .box:focus-visible');
    },
};
