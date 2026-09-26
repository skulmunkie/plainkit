// pk-tabs: the active tab has its underline and its panel, arrow keys move the selection and the focus ring stays visible and unclipped, a strip that does not
// fit either wraps (default) or scrolls sideways with a fade (scroll) without the page scrolling sideways, and the selected tab is brought into view.
const NAMES = ['Overview', 'Line items', 'Shipping', 'Payments', 'Returns', 'Documents', 'Notes', 'History'];
const TABS = NAMES.map((n, i) => `<pk-tab id="s${i}" value="s${i}"${i === 2 ? ' count="3"' : ''}>${n}</pk-tab>`).join('');
const PANELS = NAMES.map((n, i) => `<pk-tab-panel value="s${i}">${n} panel content.</pk-tab-panel>`).join('');

const RING_ISSUE = 338; // filed defect (t.known: a warning); change to t.ok when fixed
const SCROLL_ISSUE = 339;
const RING_MSG = 'the focus ring of a tab in a scrolling strip is cut off at the top and bottom by the strip';

export default {
    name: 'tabs',
    elements: ['tabs', 'tab', 'tab-panel'],
    html: `<div class="u-p-1r-1p25r"><pk-stack>
<pk-tabs id="t1" value="details">
<pk-tab id="a" value="details">Details</pk-tab><pk-tab id="b" value="history">History</pk-tab><pk-tab id="c" value="files" disabled>Files</pk-tab>
<pk-tab-panel value="details">Item details.</pk-tab-panel><pk-tab-panel value="history">Item history.</pk-tab-panel><pk-tab-panel value="files">Files.</pk-tab-panel>
</pk-tabs>
<pk-tabs id="t2" scroll value="s0">${TABS}<span slot="trailing">Updated a minute ago</span>${PANELS}</pk-tabs>
</pk-stack></div>`,
    steps: [
        { shot: 'rest' },
        { focus: '#a' }, { key: 'ArrowRight' }, { wait: 200 }, { shot: 'arrow-right' },
        { focus: '#s0' }, { key: 'End' }, { wait: 500 }, { shot: 'strip-end' },
        { key: 'Home' }, { wait: 500 }, { key: 'ArrowRight' }, { wait: 400 }, { key: 'ArrowRight' }, { wait: 400 }, { key: 'ArrowRight' }, { wait: 400 }, { key: 'ArrowRight' }, { wait: 600 }, { shot: 'strip-middle' }, { shot: 'strip-middle-ring' },
    ],
    expect(t) {
        // A probe (records nothing): the tab, with its ring, lies inside the strip that clips it.
        const ringFits = sel => {
            const a = t.rect(sel), l = t.rect('#t2 >>> [part=list]');
            const out = (parseFloat(t.style(sel, 'outline-offset')) || 0) + (parseFloat(t.style(sel, 'outline-width')) || 0);
            return Boolean(a && l && a.y - out >= l.y - 0.5 && a.bottom + out <= l.bottom + 0.5);
        };
        const PANEL = '#t1 > pk-tab-panel[selected]';
        t.ok(t.metric('html', 'scrollWidth') <= t.metric('html', 'clientWidth') + 1, 'the page scrolls sideways (the tab strip is wider than the page)');
        if (t.shot === 'rest') {
            t.ok(t.attr('#a', 'selected') !== null && t.attr('#b', 'selected') === null, 'the first tab is not the only selected one');
            t.ok(t.style('#a', 'border-bottom-color') !== t.style('#b', 'border-bottom-color'), 'the selected tab has no underline colour of its own');
            t.styleIs('#a', 'border-bottom-width', '2px');
            t.visible(PANEL, 'the selected panel'); t.hasText(PANEL, 'Item details');
        }
        if (t.shot === 'arrow-right') {
            t.ok(t.attr('#b', 'selected') !== null && t.attr('#a', 'selected') === null, 'ArrowRight did not select the next tab (the disabled one is skipped when there is no next)');
            t.hasText(PANEL, 'Item history');
            t.ringVisible('#b'); t.ringUnclipped('#b');
            t.atLeast('#b', 'height', t.viewport.name === 'phone' ? 40 : 30);
        }
        if (t.shot === 'strip-end') {
            t.ok(t.attr('#s7', 'selected') !== null, 'End did not select the last tab');
            t.inViewport('#s7');
            t.ringVisible('#s7'); t.known(RING_ISSUE, ringFits('#s7'), RING_MSG);
        }
        // Two shots of one state: the report lists one message per rule and shot, so each known defect gets its own.
        if (t.shot === 'strip-middle') {
            t.ok(t.attr('#s4', 'selected') !== null, 'four ArrowRight presses from the first tab did not select the fifth');
            const s4 = t.rect('#s4');
            if (s4) t.known(SCROLL_ISSUE, s4.x >= 0 && s4.right <= t.viewport.width, `the tab reached with the arrow keys (x ${Math.round(s4.x)} to ${Math.round(s4.right)}) is cut off by the ${t.viewport.width}px viewport`);
        }
        if (t.shot === 'strip-middle-ring') { t.ringVisible('#s4'); t.known(RING_ISSUE, ringFits('#s4'), RING_MSG); }
        if (t.viewport.name === 'phone' && t.shot !== 'rest') t.ok(t.metric('#t2 >>> [part=list]', 'scrollWidth') > t.metric('#t2 >>> [part=list]', 'clientWidth'), 'the tab strip fits on a phone: the scenario no longer exercises scrolling');
    },
};
