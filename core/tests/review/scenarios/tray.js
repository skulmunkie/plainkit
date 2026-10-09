// pk-tray: a viewport-fixed, non-modal tool panel with a floating launcher. Closed (the launcher alone), opened by the launcher at each size, long content scrolling inside with the
// last row clear of the launcher, the keyboard focus ring on the launcher, every edge (top, end, start), right to left, and the page behind it still in place.
const T = '#tray';
const P = '#tray >>> [part=panel]';
const H = '#tray >>> [part=header]';
const B = '#tray >>> [part=body]';
const L = '#tray >>> [part=launcher]';
const SIZES = '#tray >>> [part=sizes]';
const ROWS = Array.from({ length: 30 }, (_, i) => `<p class="row">Log line ${i + 1}: the build finished and the cache was warm.</p>`).join('');
const SHARE = { 'open-small': 0.25, 'open-medium': 0.4, 'open-large': 0.65 };

export default {
    name: 'tray',
    issue: [336],
    elements: ['tray', 'button', 'button-group'],
    html: `<div id="wrap" class="u-p-1r-1p25r">
<h1>Orders</h1>
<p>The page behind the tray keeps working: it is not dimmed, not inert and not shrunk.</p>
<pk-button id="page-btn" variant="secondary">Page action</pk-button>
<pk-tray id="tray" label="Tools" launcher-label="Open tools" hotkey="Ctrl+\`" sizes>${ROWS}</pk-tray>
</div>`,
    steps: [
        { shot: 'closed' },
        { focus: '#tray >>> [part=launcher]' }, { shot: 'launcher-focus' },
        { click: '#tray >>> [part=launcher]' }, { wait: 500 }, { shot: 'open-medium' },
        { click: '#tray >>> pk-button[value=small]' }, { wait: 300 }, { shot: 'open-small' },
        { click: '#tray >>> pk-button[value=large]' }, { wait: 300 }, { shot: 'open-large' },
        { scroll: '#tray >>> [part=body]', to: 9000 }, { wait: 200 }, { shot: 'scrolled-end' },
        { click: '#tray >>> pk-button[value=medium]' }, { wait: 300 },
        { set: '#tray', attr: 'edge', value: 'top' }, { wait: 300 }, { shot: 'edge-top' },
        { set: '#tray', attr: 'edge', value: 'end' }, { wait: 300 }, { shot: 'edge-end' },
        { set: '#tray', attr: 'edge', value: 'start' }, { wait: 300 }, { shot: 'edge-start' },
        { set: '#wrap', attr: 'dir', value: 'rtl' }, { wait: 300 }, { shot: 'edge-start-rtl' },
        { set: '#wrap', attr: 'dir', value: 'ltr' },
        { set: '#tray', attr: 'edge', value: 'bottom' }, { wait: 300 },
        { click: '#tray >>> [part=close]' }, { wait: 300 }, { shot: 'closed-again' },
    ],
    expect(t) {
        const v = t.viewport;
        t.visible(L, 'the launcher'); t.inViewport(L);
        if (t.shot === 'closed' || t.shot === 'launcher-focus' || t.shot === 'closed-again') {
            t.hidden(P, 'the panel while closed');
            if (t.shot === 'launcher-focus') { t.ringVisible(`${L} >>> [part=control]`); t.ringUnclipped(`${L} >>> [part=control]`); }
            return;
        }
        t.visible(P, 'the open panel'); t.inViewport(P);
        t.within(H, P); t.within(B, P); t.noOverlap(H, B);
        t.ok(t.attr(P, 'aria-label') === 'Tools', 'the panel is named');
        t.visible('#page-btn', 'the page behind');
        if (SHARE[t.shot]) {
            const p = t.rect(P);
            const want = v.height * SHARE[t.shot];
            const cap = v.height - 44 - 24;
            if (p) t.ok(Math.abs(p.height - Math.min(want, cap)) <= 3, `the panel is ${Math.round(p.height)}px tall, expected ${Math.round(Math.min(want, cap))}px (${SHARE[t.shot] * 100}% of ${v.height}, at most the viewport minus the launcher)`);
            if (p) t.ok(Math.abs(p.y + p.height - v.height) <= 1 && Math.abs(p.width - v.width) <= 1, 'bottom edge: full width, flush with the bottom');
            t.within(L, P);
        }
        if (t.shot === 'open-medium') t.visible(SIZES, 'the size choice');
        if (t.shot === 'scrolled-end') {
            t.scrolls(B);
            t.noOverlap(L, '#tray > p:last-of-type');
            t.within('#tray > p:last-of-type', B);
        }
        if (t.shot === 'edge-top') { const p = t.rect(P); if (p) t.ok(Math.abs(p.y) <= 1 && Math.abs(p.width - v.width) <= 1, 'top edge: full width, flush with the top'); t.noOverlap(L, P); }
        if (t.shot === 'edge-end' && v.name === 'desktop') { const p = t.rect(P); if (p) t.ok(Math.abs(p.x + p.width - v.width) <= 1 && Math.abs(p.height - v.height) <= 1, 'end edge: flush right, full height'); }
        if (t.shot === 'edge-start' && v.name === 'desktop') { const p = t.rect(P); if (p) t.ok(Math.abs(p.x) <= 1 && Math.abs(p.height - v.height) <= 1, 'start edge: flush left, full height'); }
        if (t.shot === 'edge-start-rtl' && v.name === 'desktop') { const p = t.rect(P); if (p) t.ok(Math.abs(p.x + p.width - v.width) <= 1, 'start edge in right-to-left: flush right'); }
        if (v.name === 'phone' && t.shot.startsWith('edge-') && t.shot !== 'edge-top') { const p = t.rect(P), l = t.rect(L); if (p && l) t.ok(Math.abs(p.width - v.width) <= 1 && p.y + p.height <= l.y + 1, 'phone: the side panel fills the width and stops above the launcher'); }
    },
};
