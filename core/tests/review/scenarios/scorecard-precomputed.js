// The scorecard opened on a precomputed quality report (#197): the ranked table and score are there with no run, the button reads Run live, and nothing overflows.
import { mountScorecard } from '../../../modules/scorecard/scorecard.js';

const HOST = '#sc-host';

export default {
    name: 'scorecard-precomputed',
    issue: [197],
    elements: ['table', 'stat', 'grid', 'container'],
    html: '<pk-card heading="Scorecard"><div id="sc-host"></div></pk-card>',
    async setup(frame) {
        const quality = {
            at: '2026-10-01T00:00:00Z', overall: 71,
            items: [
                { id: 'pk-a', name: 'Alpha', kind: 'Forms', score: 96, findings: [] },
                { id: 'pk-b', name: 'Bravo', kind: 'Forms', score: 52, findings: [{ check: 'touch-target', severity: 'warn', selector: 'button', message: 'too small', contexts: ['dark 375px'], count: 1 }] },
            ],
        };
        const card = await mountScorecard(frame.querySelector(HOST), { targets: [{ name: 'x', html: '<p>x</p>' }], data: { quality } });
        await card.ready;
    },
    steps: [{ waitFor: `${HOST} pk-table` }, { shot: 'precomputed' }],
    expect(t) {
        t.ok(t.metric('html', 'scrollWidth') <= t.metric('html', 'clientWidth') + 1, 'the page scrolls sideways');
        t.visible(`${HOST} pk-stat`, 'the overall score tile');
        t.visible(`${HOST} pk-table`, 'the ranked table');
        t.inViewport(`${HOST} pk-button`);
    },
};
