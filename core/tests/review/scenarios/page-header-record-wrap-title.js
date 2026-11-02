// pk-page-header variant="record" with wrap-title (issue 1849, opt-in): on a phone a long title wraps to two or three lines; on desktop it stays one ellipsized line;
// the same header without wrap-title stays one line on both. Three headers: the title as the last crumb, as the heading, and the default (no opt-in).
const LONG = 'Purchase order 1042 for the north warehouse refit, the second delivery of shelving, racking, lighting and spare fittings';
const KIDS = n => `<pk-badge id="${n}1">Open</pk-badge><pk-badge id="${n}2" variant="ok">Paid in full</pk-badge><pk-button id="${n}a" slot="actions" variant="primary">Receive goods</pk-button>`;
const TITLES = { c: '#c >>> [part="trail"] > [aria-current="page"]', h: '#h >>> [part="title"]', d: '#d >>> [part="title"]' };
export default {
    name: 'page-header-record-wrap-title',
    issue: [1849],
    elements: ['page-header'],
    html: `<pk-page-header id="c" variant="record" wrap-title home-href="#home" home-label="Home" crumbs='[{"label":"Purchase orders","href":"#po"},{"label":"${LONG}"}]'>${KIDS('c')}</pk-page-header>`
        + `<pk-page-header id="h" variant="record" wrap-title heading="${LONG}" home-href="#home" home-label="Home" crumbs='[{"label":"Purchase orders","href":"#po"}]'>${KIDS('h')}</pk-page-header>`
        + `<pk-page-header id="d" variant="record" heading="${LONG}" home-href="#home" home-label="Home" crumbs='[{"label":"Purchase orders","href":"#po"}]'>${KIDS('d')}</pk-page-header>`,
    steps: [{ shot: 'rest' }],
    expect(t) {
        const phone = t.viewport.name === 'phone';
        for (const [n, title] of Object.entries(TITLES)) {
            t.visible(title, `the ${n} title`);
            const h = t.rect(title).height;
            if (n !== 'd' && phone) t.ok(h > 30 && h < 120, `${n}: the title wraps to two or three lines (${h}px)`);
            else t.ok(h < 50, `${n}: the title is one line (${h}px)`);
            for (const b of [1, 2]) { t.noOverlap(`#${n}${b}`, title); t.noOverlap(`#${n}${b}`, `#${n}a`); }
            t.noOverlap(`#${n}a`, title);
            t.fitsWidth(`#${n}`);
        }
    },
};