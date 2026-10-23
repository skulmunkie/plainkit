// pk-page-header record with backLink in a narrow container (issue 1739): the parent crumbs fold into one back chevron that shares row one with the title and the actions.
const H = '#ph', BACK = '#ph >>> [part="back"]', CUR = '#ph >>> [part="trail"] > [aria-current="page"]', ACT = '#ph pk-button:nth-of-type(1)';
export default {
    name: 'page-header-back-fold',
    issue: [1739],
    elements: ['page-header'],
    html: `<pk-page-header id="ph" variant="record" back-link home-href="#home" home-label="Home" crumbs='[{"label":"Purchase orders","href":"#po"},{"label":"Order 1042 for the regional warehouse"}]'><pk-badge variant="ok">Open</pk-badge><pk-button slot="actions" variant="primary" icon-name="refresh" collapse="phone">Sync</pk-button></pk-page-header>`,
    steps: [{ shot: 'rest' }],
    expect(t) {
        t.visible(CUR, 'the title crumb');
        if (t.viewport.name === 'phone') {
            t.visible(BACK, 'the back chevron');
            t.sameRow(BACK, CUR, 6);
            t.sameRow(ACT, CUR, 6);
            t.noOverlap(BACK, CUR);
            t.ok(t.rect(H).height <= 110, 'the header is about two rows high');
        } else { t.visible(BACK, 'the back link'); t.noOverlap(BACK, CUR); }
    },
};
