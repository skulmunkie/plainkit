// The performance monitor module (issue 682, S1/S10): mounted into a card as a tool page would. It is made of SDK elements only (no module stylesheet), so the heading row, the
// stat tiles and the "What loaded" card must still fit the width at desktop and phone, in both themes, without overlapping.
import { mountPerformance } from '../../../modules/performance/performance.js';

const HOST = '#pf-host';

export default {
    name: 'performance',
    issue: [682],
    elements: ['stat', 'container', 'stack'],
    html: '<pk-card heading="Performance"><div id="pf-host"></div></pk-card>',
    async setup(frame) { await mountPerformance(frame.querySelector(HOST), { autostart: false }); },
    steps: [{ wait: 600 }, { shot: 'panel' }],
    expect(t) {
        t.ok(t.metric('html', 'scrollWidth') <= t.metric('html', 'clientWidth') + 1, 'the page scrolls sideways');
        t.visible(`${HOST} pk-stat`, 'a stat tile'); t.visible(`${HOST} pk-table`, 'the requests table');
        t.inViewport(`${HOST} pk-button`);
        t.noOverlap(`${HOST} pk-stat`, `${HOST} pk-card`);
    },
};
