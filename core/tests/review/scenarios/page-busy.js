// Counted busy and the framework-owned loading overlay (issue 371): createPage({ body }) wraps the page body in a pk-loading-overlay it creates itself, shows it only after
// the delay and keeps it for the minimum time, and holds it up while ANY action still runs. The scenario uses a 2500 ms delay and a 300 ms minimum (the defaults are 150 and 300)
// so the "not yet" state is still there when the screenshot is taken; the actions are gated by buttons (Finish slow / Finish second), so no state depends on timing but the delay. States: idle; a fast action that never shows it; a slow one inside the delay (aria-busy,
// no overlay), shown, a second overlapping action (label of the most recent), the second finishing while the first still runs, idle again, and a failing action (danger alert, no stuck overlay).
import { createPage } from '../../../js/page.js';

const BODY = '#body';
const OV = 'pk-loading-overlay';
const SHADE = 'pk-loading-overlay >>> [part=overlay]';
const LABEL = 'pk-loading-overlay >>> [part=label]';
const ROWS = Array.from({ length: 60 }, (_, i) => `<p>Row ${i + 1} of a long report.</p>`).join('');
const SCROLLER = 'pk-app-shell >>> [part=body]';
const CONTENT = 'pk-loading-overlay >>> [part=content]';
const sleep = ms => new Promise(r => setTimeout(r, ms));
// Legibility (issue 374): the label must sit on a solid panel over a strong scrim, wherever the region is short, tall or scrolled.
const rgba = c => { const m = /^(?:rgba?|color\(srgb)\(?\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?/.exec(c) ?? /^color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)(?: \/ ([\d.]+))?/.exec(c); if (!m) return null; const k = c.startsWith('color(') ? 255 : 1; return { r: m[1] * k, g: m[2] * k, b: m[3] * k, a: m[4] === undefined ? 1 : +m[4] }; };
const lum = ({ r, g, b }) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
function legible(t, ov, what) {
    const overlay = `${ov} >>> [part=overlay]`, panel = `${ov} >>> [part=panel]`, label = `${ov} >>> [part=label]`;
    t.visible(panel, `${what}: the panel`);
    const bg = rgba(t.style(panel, 'background-color')), fg = rgba(t.style(label, 'color')), scrim = rgba(t.style(overlay, 'background-color'));
    t.ok(bg && bg.a === 1, `${what}: the panel behind the label must be an opaque surface (background ${t.style(panel, 'background-color')})`);
    t.ok(scrim && scrim.a >= 0.8, `${what}: the scrim must hide the covered content (opacity ${scrim?.a})`);
    if (bg && fg) t.ok(contrast(fg, bg) >= 4.5, `${what}: the label contrast on its panel is ${contrast(fg, bg).toFixed(2)}, WCAG AA needs 4.5`);
    t.within(label, panel, 0.5); t.within(panel, ov, 1);
}
let idleRect = null; // the body's box while idle, to prove the overlay moves nothing

export default {
    name: 'page-busy',
    issue: 371,
    elements: ['loading-overlay'],
    html: `<div class="rv-page">
<pk-cluster id="bar"><pk-button id="fast" size="small">Fast action</pk-button><pk-button id="slow" size="small">Slow action</pk-button><pk-button id="second" size="small">Second action</pk-button><pk-button id="finish-second" size="small" variant="ghost">Finish second</pk-button><pk-button id="finish-slow" size="small" variant="ghost">Finish slow</pk-button><pk-button id="fail" size="small" variant="danger">Failing action</pk-button></pk-cluster>
<pk-alert id="alert" hidden></pk-alert>
<div id="body"><pk-card heading="Orders"><p>Order 1041 shipped to Acme Ltd.</p><p>Order 1042 is waiting for payment.</p><p>Order 1043 was refunded.</p><pk-button id="inside" size="small">Open order</pk-button></pk-card></div>
<pk-app-shell id="shell" hidden><pk-side-nav slot="nav" label="Main"><a slot="brand" href="#">Acme</a><pk-nav-item href="#" current>Reports</pk-nav-item></pk-side-nav><h2 slot="title">Reports</h2><span slot="footer">Acme Inc.</span><pk-loading-overlay id="tall" label="Loading the report…"><pk-card heading="Report">${ROWS}</pk-card></pk-loading-overlay></pk-app-shell>
<div id="short-wrap" hidden><pk-loading-overlay id="short" label="Saving…"><pk-card><p>Saved 3 orders.</p></pk-card></pk-loading-overlay></div>
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
        { set: '#bar', attr: 'hidden', value: true }, { set: '#alert', attr: 'hidden', value: true }, { set: '#body', attr: 'hidden', value: true }, { set: '#shell', attr: 'hidden', value: null },
        { set: '#tall', attr: 'busy', value: true }, { wait: 100 }, { shot: 'tall-top' },
        { scroll: SCROLLER, to: 900 }, { wait: 100 }, { shot: 'tall-scrolled' },
        { set: '#shell', attr: 'hidden', value: true }, { set: '#short-wrap', attr: 'hidden', value: null }, { set: '#short', attr: 'busy', value: true }, { wait: 100 }, { shot: 'short' },
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
            t.centredIn('pk-loading-overlay >>> [part=panel]', OV, 3);
            t.inViewport('#fast'); // the toolbar is outside the region: still usable
            legible(t, OV, 'the busy region');
        }
        if (t.shot === 'overlapping') { shown(); t.hasText(LABEL, 'Exporting'); same(); }
        if (t.shot === 'second-done-first-running') { shown(); t.hasText(LABEL, 'Loading orders'); t.ok(t.attr(BODY, 'aria-busy') === 'true', 'still aria-busy: the first action runs'); same(); }
        if (t.shot === 'idle-again') {
            t.hidden(SHADE, 'the overlay'); t.ok(t.attr(BODY, 'aria-busy') === null, 'aria-busy cleared after the last action');
            t.ok(frame.__cls < 0.001, `layout shift score ${frame.__cls}`); same();
        }
        if (t.shot === 'tall-top' || t.shot === 'tall-scrolled') {
            legible(t, '#tall', `the tall region (${t.shot})`);
            t.within('#tall >>> [part=panel]', SCROLLER, 1); t.inViewport('#tall >>> [part=panel]', 1); t.inViewport('#tall >>> [part=label]', 1);
            t.ok(t.metric(SCROLLER, 'scrollHeight') > t.viewport.height, 'the tall region is taller than the viewport');
            if (t.shot === 'tall-scrolled') t.ok(t.metric(SCROLLER, 'scrollTop') > 500, 'the region is scrolled');
        }
        if (t.shot === 'short') {
            legible(t, '#short', 'the very short region'); t.inViewport('#short >>> [part=panel]', 1);
            const p = t.rect('#short >>> [part=panel]'), o = t.rect('#short');
            if (p && o) t.ok(Math.abs(p.cy - o.cy) <= 2 && Math.abs(p.cx - o.cx) <= 2, 'the panel is centred in the short region');
        }
        if (t.shot === 'failed') { t.visible('#alert', 'the danger alert'); t.ok(t.attr('#alert', 'kind') === 'danger', 'the status is danger'); t.hidden(SHADE, 'the overlay'); t.ok(t.attr(BODY, 'aria-busy') === null, 'no stuck busy'); }
    },
};
