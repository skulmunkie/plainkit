// The dev console module (issue 682, S1/S10): mounted into a card, on its console tab with a few lines. It is made of SDK elements only (no module
// stylesheet), so the tab bar and the tables must fit the width at desktop and phone, in both themes, with nothing overlapping.
import { mountConsole } from '../../../modules/console/console.js';

const HOST = '#dc-host';
let api;

export default {
    name: 'console',
    issue: [682],
    elements: ['table', 'tabs', 'container'],
    html: '<pk-card heading="Console"><div id="dc-host"></div></pk-card>',
    async setup(frame) {
        api = await mountConsole(frame.querySelector(HOST), {});
        api.log('log', 'Hello from the scenario');
        api.log('warn', 'A warning with a longer message so the row has some width to show');
        api.log('error', 'Something failed');
    },
    steps: [
        { wait: 500 }, { shot: 'console' },
    ],
    expect(t) {
        t.ok(t.metric('html', 'scrollWidth') <= t.metric('html', 'clientWidth') + 1, 'the page scrolls sideways');
        t.visible(`${HOST} pk-tabs`, 'the tab bar');
        t.visible(`${HOST} pk-table`, 'the console table');
        t.inViewport(`${HOST} pk-tabs`);
    },
};
