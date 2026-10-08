// The logging settings module (issue 682, S1/S3/S10): mounted into a card as the settings page does. It is made of SDK elements only (no module stylesheet), so the panel must
// still fit the width at desktop and phone, in both themes, with its two headings, the two tables and the action row not overlapping.
import { mountLogSettings } from '../../../modules/log-settings/log-settings.js';

const HOST = '#ls-host';

export default {
    name: 'log-settings',
    issue: [682],
    elements: ['table', 'heading', 'container'],
    html: '<pk-card heading="Logging"><div id="ls-host"></div></pk-card>',
    async setup(frame) { await mountLogSettings(frame.querySelector(HOST), {}); },
    steps: [{ wait: 600 }, { shot: 'panel' }],
    expect(t) {
        t.ok(t.metric('html', 'scrollWidth') <= t.metric('html', 'clientWidth') + 1, 'the page scrolls sideways');
        t.visible(`${HOST} pk-table`, 'the scope table'); t.inViewport(`${HOST} pk-button`);
        t.visible(`${HOST} pk-heading`, 'a heading');
        t.hasText(`${HOST} pk-heading`, 'Level per scope');
    },
};
