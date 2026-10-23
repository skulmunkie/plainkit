// pk-page-header variant="record" with a 120-character title, three badges and a primary action (issue 1761): the title is one line cut with an ellipsis
// (the full text is its tooltip), the badges and the action keep their width, and the action never paints over a badge. Two headers: the title as the
// last crumb (no heading), and the title as the heading.
const LONG = 'Purchase order 1042 for the north warehouse refit, the second delivery of shelving, racking, lighting and spare fittings';
const KIDS = n => `<pk-badge id="${n}1">Open</pk-badge><pk-badge id="${n}2" variant="ok">Paid in full</pk-badge><pk-badge id="${n}3" variant="warn">Late</pk-badge><pk-button id="${n}a" slot="actions" variant="primary">Receive goods</pk-button>`;
const TITLES = { c: '#c >>> [part="trail"] > [aria-current="page"]', h: '#h >>> [part="title"]' };
export default {
    name: 'page-header-record-title-ellipsis',
    issue: [1761],
    elements: ['page-header'],
    html: `<pk-page-header id="c" variant="record" home-href="#home" home-label="Home" crumbs='[{"label":"Purchase orders","href":"#po"},{"label":"${LONG}"}]'>${KIDS('c')}</pk-page-header>`
        + `<pk-page-header id="h" variant="record" heading="${LONG}" home-href="#home" home-label="Home" crumbs='[{"label":"Purchase orders","href":"#po"}]'>${KIDS('h')}</pk-page-header>`,
    steps: [{ shot: 'rest' }, { resize: 960, on: ['desktop'] }, { wait: 'settle', on: ['desktop'] }, { shot: 'narrow', on: ['desktop'] }],
    expect(t) {
        for (const [n, title] of Object.entries(TITLES)) {
            t.visible(title, `the ${n === 'c' ? 'crumb' : 'heading'} title`);
            t.styleIs(title, 'text-overflow', 'ellipsis');
            t.styleIs(title, 'white-space', 'nowrap');
            t.ok(t.attr(title, 'title') === LONG, `${n}: the full title is the tooltip`);
            t.ok(t.rect(title).height < 50, `${n}: the title is one line (${t.rect(title).height}px)`);
            for (const b of [1, 2, 3]) {
                t.noOverlap(`#${n}${b}`, `#${n}a`);
                t.noOverlap(`#${n}${b}`, title);
                t.ok(t.rect(`#${n}${b}`).height < 40, `${n}: badge ${b} stays one line`);
            }
            t.fitsWidth(`#${n}`);
        }
    },
};
