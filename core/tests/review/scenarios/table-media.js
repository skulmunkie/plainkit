// pk-table media column (issue 1938) inside pk-list-page: a picture-led list. On desktop the image is a box at the row's inline start; on a phone (cards) it is the
// card's leading image beside the stacked title and values, and nothing leaves the viewport.
const LP = '#lp';
const TBL = `${LP} >>> [part=table] >>> [part=table]`;
const PIC = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="30" height="40"><rect width="30" height="40" fill="#7a8fb0"/><circle cx="15" cy="16" r="8" fill="#e8eef8"/></svg>');
const ROWS = Array.from({ length: 4 }, (_, i) => ({ id: i + 1, cover: PIC, title: ['A long title that runs over two lines on a phone', 'Short', 'Another quite long book title for wrapping', 'Third'][i], author: 'An Author', year: String(2020 + i) }));

export default {
    name: 'table-media',
    issue: [1938],
    elements: ['table', 'list-page'],
    html: `<pk-list-page id="lp"></pk-list-page>`,
    setup(frame) {
        const el = frame.querySelector(LP);
        el.config = { heading: 'Books', columns: [{ key: 'cover', label: 'Cover', type: 'media', ratio: '3/4', alt: 'title' }, { key: 'title', label: 'Title', title: true }, { key: 'author', label: 'Author' }, { key: 'year', label: 'Year' }], pageSize: 10, density: 'compact' };
        el.load = () => ({ rows: ROWS, total: 4 });
    },
    steps: [{ waitFor: `${TBL} >>> td[data-media] img` }, { wait: 'settle' }, { shot: 'list' }],
    expect(t) {
        t.ok(t.metric('html', 'scrollWidth') <= t.metric('html', 'clientWidth') + 1, 'the page scrolls sideways');
        const m = t.rect(`${TBL} >>> td[data-media]`), title = t.rect(`${TBL} >>> td[data-key=title]`), row = t.rect(`${TBL} >>> tbody tr`);
        if (!m || !title || !row) return t.ok(false, 'the media cell, the title cell and the row render');
        t.inViewport(`${TBL} >>> td[data-media]`);
        t.ok(m.right <= title.x + 1 || m.x >= title.x + title.width - 1, 'the media box and the title cell do not overlap');
        if (t.viewport.name === 'phone') {
            t.ok(m.x <= row.x + 24, `the image leads the card at its inline start (${Math.round(m.x - row.x)}px in)`);
            t.ok(m.height >= row.height - 24, `the image is as tall as the card content (${Math.round(m.height)}px of ${Math.round(row.height)}px)`);
        } else t.ok(Math.abs(m.height - row.height) < 2, 'the media box fills the row height');
    },
};
