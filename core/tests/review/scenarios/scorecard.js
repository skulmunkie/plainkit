// The scorecard module (issue 682, S1/S3/S5/S10): mounted into a card, one run over two targets (a good one and one with an unnamed button and an image without alt), then the ranked table
// and the score tile. It is made of SDK elements only (no module stylesheet), so the tile, the ranked table with its change and failing-items cells, and the run button must fit the
// width at desktop and phone, in both themes, with nothing overlapping.
import { mountScorecard } from '../../../modules/scorecard/scorecard.js';

const HOST = '#sc-host';

export default {
    name: 'scorecard',
    issue: [682],
    elements: ['table', 'stat', 'grid', 'container'],
    html: '<pk-card heading="Scorecard"><div id="sc-host"></div></pk-card>',
    async setup(frame) {
        const targets = [
            { name: 'Good card', html: '<p>Fine</p>' },
            { name: 'Bad card', html: '<button></button><img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=">' },
        ];
        const card = await mountScorecard(frame.querySelector(HOST), { targets, themes: ['dark'], widths: [375] });
        await card.run();
    },
    steps: [{ wait: 1500 }, { shot: 'ranked' }],
    expect(t) {
        t.ok(t.metric('html', 'scrollWidth') <= t.metric('html', 'clientWidth') + 1, 'the page scrolls sideways');
        t.visible(`${HOST} pk-stat`, 'the overall score tile');
        t.visible(`${HOST} pk-table`, 'the ranked table');
        t.inViewport(`${HOST} pk-button`);
    },
};
