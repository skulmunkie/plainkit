// Counted busy and the framework-owned loading overlay (issue 371): createPage({ body }) wraps the page body in a pk-loading-overlay it creates itself, shows it only after
// the delay and keeps it for the minimum time, and holds it up while ANY action still runs. The scenario uses a 2500 ms delay and a 300 ms minimum (the defaults are 150 and 300)
// so the "not yet" state is still there when the screenshot is taken; the actions are gated by buttons (Finish slow / Finish second), so no state depends on timing but the delay. States: idle; a fast action that never shows it; a slow one inside the delay (aria-busy,
// no overlay), shown, a second overlapping action (label of the most recent), the second finishing while the first still runs, idle again, and a failing action (danger alert, no stuck overlay).
import { createPage } from '../../../js/page.js';

const BODY = '#body';
const OV = 'pk-loading-overlay';
const SHADE = 'pk-loading-overlay >>> [part=overlay]';
const LABEL = 'pk-loading-overlay >>> [part=label]';
const CONTENT = 'pk-loading-overlay >>> [part=content]';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let idleRect = null; // the body's box while idle, to prove the overlay moves nothing

export default {
    name: 'page-busy',
    issue: 371,
    elements: ['loading-overlay'],
    html: `<div class="rv-page">
<pk-cluster><pk-button id="fast" size="small">Fast action</pk-button><pk-button id="slow" size="small">Slow action</pk-button><pk-button id="second" size="small">Second action</pk-button><pk-button id="finish-second" size="small" variant="ghost">Finish second</pk-button><pk-button id="finish-slow" size="small" variant="ghost">Finish slow</pk-button><pk-button id="fail" size="small" variant="danger">Failing action</pk-button></pk-cluster>
<pk-alert id="alert" hidden></pk-alert>
<div id="body"><pk-card heading="Orders"><p>Order 1041 shipped to Acme Ltd.</p><p>Order 1042 is waiting for payment.</p><p>Order 1043 was refunded.</p><pk-button id="inside" size="small">Open order</pk-button></pk-card></div>
</div>`,
    setup(frame) {
        const page = createPage({ body: frame.querySelector(BODY), alert: frame.querySelector('#alert'), delay: 2500, minTime: 300, scope: 'scenario-page-busy' });
        const on = (id, fn) => frame.querySelector(`#${id}`).addEventListener('click', fn);
        const run = (fn, label) => page.busy(fn, label).catch(err => page.log.debug('the scenario action failed on purpose', err));
        const gates = {};
        const hold = (key, label) => run(() => new Promise(r => { gates[key] = r; }), label);
        on('fast', () => run(() => sleep(100), 'Saving…'));
        on('slow', () => hold('slow', 'Loading orders…'));
        on('second', () => hold('second', 'Exporting…'));
        on('finish-slow', () => gates.slow?.());
        on('finish-second', () => gates.second?.());
        on('fail', () => run(async () => { await sleep(50); throw new Error('The export failed.'); }, 'Exporting…'));
        frame.__toggles = 0; frame.__cls = 0;
        new MutationObserver(list => { for (const m of list) if (m.attributeName === 'busy') frame.__toggles++; }).observe(frame.querySelector(OV), { attributes: true });
        new PerformanceObserver(list => { for (const e of list.getEntries()) if (!e.hadRecentInput) frame.__cls += e.value; }).observe({ type: 'layout-shift', buffered: false });
    },
    steps: [
        { shot: 'idle' },
        { click: '#fast' }, { wait: 3000 }, { shot: 'fast-never-shown' },
        { click: '#slow' }, { shot: 'inside-the-delay' },
        { wait: 2800 }, { shot: 'busy' },
        { click: '#second' }, { wait: 100 }, { shot: 'overlapping' },
        { click: '#finish-second' }, { wait: 100 }, { shot: 'second-done-first-running' },
        { click: '#finish-slow' }, { wait: 800 }, { shot: 'idle-again' },
        { click: '#fail' }, { wait: 250 }, { shot: 'failed' },
    ],
    expect(t) {
        const frame = t.frame;
        const same = () => { const r = t.rect(BODY); const b = idleRect; return !r || !b || t.ok(Math.abs(r.x - b.x) < 0.5 && Math.abs(r.y - b.y) < 0.5 && Math.abs(r.width - b.width) < 0.5 && Math.abs(r.height - b.height) < 0.5, `the body moved or resized (${JSON.stringify(r)} vs idle ${JSON.stringify(b)}): the overlay must not shift layout`); };
        const shown = () => t.visible(SHADE, 'the overlay');
        if (t.shot === 'idle') {
            idleRect = t.rect(BODY);
            t.hidden(SHADE, 'the overlay'); t.ok(t.attr(BODY, 'aria-busy') === null, 'no aria-busy while idle'); t.exists(OV);
            t.ok(t.attr(OV, 'busy') === null, 'the overlay is idle');
        }
        if (t.shot === 'fast-never-shown') { t.hidden(SHADE, 'the overlay'); t.ok(frame.__toggles === 0, `the overlay flashed ${frame.__toggles} time(s) for an action shorter than the delay`); t.ok(t.attr(BODY, 'aria-busy') === null, 'aria-busy cleared'); same(); }
        if (t.shot === 'inside-the-delay') { t.hidden(SHADE, 'the overlay (inside the delay)'); t.ok(t.attr(BODY, 'aria-busy') === 'true', 'the region is aria-busy at once'); same(); }
        if (t.shot === 'busy') {
            shown(); t.hasText(LABEL, 'Loading orders'); t.ok(t.attr(BODY, 'aria-busy') === 'true', 'aria-busy on the body');
            t.ok(t.attr('pk-loading-overlay >>> [part=overlay]', 'role') === 'status' && t.attr(SHADE, 'aria-live') === 'polite', 'the label is announced politely');
            t.within(BODY, SHADE, 1); t.within(SHADE, OV, 1); t.exists(CONTENT); same();
            t.centredIn('pk-loading-overlay >>> [part=spinner]', OV, 3);
            t.inViewport('#fast'); // the toolbar is outside the region: still usable
        }
        if (t.shot === 'overlapping') { shown(); t.hasText(LABEL, 'Exporting'); same(); }
        if (t.shot === 'second-done-first-running') { shown(); t.hasText(LABEL, 'Loading orders'); t.ok(t.attr(BODY, 'aria-busy') === 'true', 'still aria-busy: the first action runs'); same(); }
        if (t.shot === 'idle-again') {
            t.hidden(SHADE, 'the overlay'); t.ok(t.attr(BODY, 'aria-busy') === null, 'aria-busy cleared after the last action');
            t.ok(frame.__cls < 0.001, `layout shift score ${frame.__cls}`); same();
        }
        if (t.shot === 'failed') { t.visible('#alert', 'the danger alert'); t.ok(t.attr('#alert', 'kind') === 'danger', 'the status is danger'); t.hidden(SHADE, 'the overlay'); t.ok(t.attr(BODY, 'aria-busy') === null, 'no stuck busy'); }
    },
};
