// The logs viewer module (issue 682, S1/S10): mounted into a card with three entries, then the long one opened in the detail card. It is made of SDK elements only (no module
// stylesheet), so the toolbar, the table and the detail card (a long unbroken message included) must fit the width at desktop and phone, in both themes.
import { mountLogs } from '../../../modules/logs/logs.js';
import { createLogger } from '../../../js/log.js';

const HOST = '#lg-host';
const LONG = `request failed: https://example.test/api/orders/${'0123456789abcdef'.repeat(12)}?token=none`;

export default {
    name: 'logs',
    issue: [682],
    elements: ['table', 'card', 'code-block', 'text'],
    html: '<pk-card heading="Logs"><div id="lg-host"></div></pk-card>',
    async setup(frame) {
        const api = await mountLogs(frame.querySelector(HOST), { level: 'debug' });
        const log = createLogger('scenario');
        log.info('Order 1041 shipped');
        log.warn('Payment is waiting for the bank');
        log.error(LONG, new Error('The request was refused'));
        await new Promise(r => setTimeout(r, 400));
        const long = api.entries().find(e => e.message === LONG);
        if (long) api.select(long.id);
    },
    steps: [{ wait: 500 }, { shot: 'detail' }],
    expect(t) {
        t.ok(t.metric('html', 'scrollWidth') <= t.metric('html', 'clientWidth') + 1, 'the page scrolls sideways');
        t.visible(`${HOST} pk-table`, 'the entries table');
        t.visible(`${HOST} pk-card`, 'the detail card');
        t.within(`${HOST} pk-card pk-stack > :nth-child(2)`, `${HOST} pk-card`, 1, 'the message stays inside the detail card');
    },
};
