// The tool dock module (#1023): mountToolDock in dock mode is a pk-tray with a pk-tabs strip in its body. Closed (the launcher alone), opened by the launcher at each size,
// a second tab, long content scrolling clear of the launcher, closed by Close and by Escape. setup() mounts the real module and moves its tray into the frame (it appends to the body).
import { mountToolDock } from '../../../modules/tool-dock/tool-dock.js';

const P = '#dock >>> [part=panel]';
const H = '#dock >>> [part=header]';
const B = '#dock >>> [part=body]';
const L = '#dock >>> [part=launcher]';
const SHARE = { 'open-small': 0.25, 'open-medium': 0.4, 'open-large': 0.65 };
const rows = (n, what) => { const d = document.createElement('div'); for (let i = 1; i <= n; i++) { const p = document.createElement('p'); p.className = 'row'; p.textContent = `${what} line ${i}: the build finished and the cache was warm.`; d.append(p); } return d; };

export default {
    name: 'tool-dock',
    issue: [1023],
    elements: ['tray', 'tabs', 'tab', 'tab-panel', 'button', 'button-group'],
    html: `<div class="u-p-1r-1p25r"><h1>Orders</h1><p>The page behind the dock stays usable.</p><pk-button id="page-btn" variant="secondary">Page action</pk-button></div>`,
    async setup(frame) {
        const panels = [
            { id: 'console', title: 'Console', mount: el => { el.append(rows(30, 'Console')); } },
            { id: 'logs', title: 'Logs', mount: el => { el.append(rows(6, 'Logs')); } },
            { id: 'quality', title: 'Quality', mount: el => { el.append(rows(3, 'Quality')); } },
        ];
        await mountToolDock(null, { panels, label: 'Dev tools', launcherLabel: 'Tools' });
        const tray = document.querySelector('pk-tray');
        tray.id = 'dock';
        frame.append(tray);
    },
    steps: [
        { shot: 'closed' },
        { click: L }, { wait: 500 }, { shot: 'open-medium' },
        { click: '#dock >>> pk-button[value=small]' }, { wait: 300 }, { shot: 'open-small' },
        { click: '#dock >>> pk-button[value=large]' }, { wait: 300 }, { shot: 'open-large' },
        { click: '#dock pk-tab[value=logs]' }, { wait: 300 }, { shot: 'second-tab' },
        { click: '#dock pk-tab[value=console]' }, { wait: 200 },
        { scroll: B, to: 9000 }, { wait: 200 }, { shot: 'scrolled-end' },
        { click: '#dock >>> [part=close]' }, { wait: 300 }, { shot: 'closed-by-close' },
        { click: L }, { wait: 400 }, { key: 'Escape' }, { wait: 300 }, { shot: 'closed-by-escape' },
    ],
    expect(t) {
        const v = t.viewport;
        t.visible(L, 'the launcher'); t.inViewport(L);
        if (t.shot.startsWith('closed')) { t.hidden(P, 'the panel while closed'); return; }
        t.visible(P, 'the open panel'); t.inViewport(P);
        t.within(H, P); t.within(B, P); t.noOverlap(H, B);
        if (v.width <= 480) { // phone: every header control fits the row and is a full touch target; Close is icon-only (#1029)
            for (const c of ['[part=close]', 'pk-button[value=small]', 'pk-button[value=medium]', 'pk-button[value=large]']) { t.within(`#dock >>> ${c}`, H); t.atLeast(`#dock >>> ${c}`, 'width', 44); t.atLeast(`#dock >>> ${c}`, 'height', 44); }
            const close = t.rect('#dock >>> [part=close]');
            if (close) t.ok(close.width <= 48, `Close is ${Math.round(close.width)}px wide: it should be icon-only on a phone`);
        }
        t.ok(t.attr(P, 'aria-label') === 'Dev tools', 'the panel is named');
        t.visible('#dock pk-tabs', 'the tab strip in the body'); // taller than the body when a tab has long content: the body scrolls it
        if (t.shot !== 'scrolled-end') t.inViewport('#dock pk-tab[value=console]'); // scrolled to the end, the strip has scrolled away with the content (as it did before the tray)        t.visible('#page-btn', 'the page behind');
        if (SHARE[t.shot]) {
            const p = t.rect(P), want = Math.min(v.height * SHARE[t.shot], v.height - 44 - 24);
            if (p) t.ok(Math.abs(p.height - want) <= 3, `the panel is ${Math.round(p.height)}px tall, expected ${Math.round(want)}px`);
            t.within(L, P);
        }
        if (t.shot === 'second-tab') t.visible('#dock pk-tab-panel[value=logs]', 'the second tab\'s content');
        if (t.shot === 'scrolled-end') t.noOverlap(L, '#dock pk-tab-panel[value=console] .row:last-child');
    },
};
