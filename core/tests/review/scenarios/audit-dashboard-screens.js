// The audit dashboard's Screenshots panel (#1708): the four variants of one element side by side, the findings table under them, and the enlarged
// view. The fixture manifest is passed as an object and every shot is the one small PNG in tests/review/fixtures/.
const shot = (tag, example, viewport, theme, findings = []) => ({ tag, example, title: 't', viewport, theme, width: viewport === 'phone' ? 375 : 1280, file: 'shot.png', boxes: 0, findings });
const REVIEW = {
    generated: '2026-10-20T08:30:00.000Z',
    summary: { errors: 1, warnings: 0, ok: false },
    findings: [],
    shots: ['desktop', 'phone'].flatMap(v => ['light', 'dark'].map(th => shot('pk-card', 1, v, th, v === 'phone' && th === 'dark' ? [{ rule: 'overflow', severity: 'error', message: 'text overflows its box', fix: 'allow the text to wrap' }] : []))),
};

export default {
    name: 'audit-dashboard-screens',
    elements: ['dock', 'image-gallery', 'select', 'table'],
    html: '<div class="rv-bounded"><div id="mount"></div></div>',
    async setup(frame) {
        const { mountAuditDashboard } = await import('../../../modules/audit-dashboard/audit-dashboard.js');
        await mountAuditDashboard(frame.querySelector('#mount'), { baselineUrl: { version: 1, entries: [] }, reviewUrl: REVIEW, screensBase: new URL('../fixtures/', import.meta.url).pathname, height: 'fill' });
    },
    steps: [
        { wait: 'settle' },
        { click: '#mount pk-dock >>> pk-tab:nth-of-type(3)' }, { wait: 500 },
        { shot: 'grid' },
        { click: '#mount [slot=screens] pk-image-gallery >>> [data-index="0"] pk-media' }, { wait: 400 },
        { shot: 'enlarged' },
    ],
    expect(t) {
        t.exists('#mount [slot=screens] pk-image-gallery', 'the Screenshots panel draws a gallery of the review\'s shots');
        t.hasText('#mount [slot=screens] [role=status]', '4 of 4', 'the status line counts the shots shown');
        if (t.shot === 'grid') t.visible('#mount [slot=screens] pk-image-gallery >>> [data-index="3"]', 'all four variants of the element are on screen as thumbnails');
    },
};
