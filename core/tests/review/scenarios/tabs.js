// pk-tabs: the active tab has its underline and its panel, arrow keys move the selection and the focus ring stays visible and unclipped, a strip that does not
// fit either wraps (default) or scrolls sideways (scroll, also right to left) with a fade on the side that has more tabs, without the page scrolling sideways, and the
// selected tab is brought fully into view, clear of the fade, with its focus ring inside the strip (issues 338, 339).
const NAMES = ['Overview', 'Line items', 'Shipping', 'Payments', 'Returns', 'Documents', 'Notes', 'History'];
const TABS = NAMES.map((n, i) => `<pk-tab id="s${i}" value="s${i}"${i === 2 ? ' count="3"' : ''}>${n}</pk-tab>`).join('');
const PANELS = NAMES.map((n, i) => `<pk-tab-panel value="s${i}">${n} panel content.</pk-tab-panel>`).join('');
const RTL_TABS = NAMES.map((n, i) => `<pk-tab id="r${i}" value="r${i}">${n}</pk-tab>`).join('');

export default {
    name: 'tabs',
    elements: ['tabs', 'tab', 'tab-panel'],
    issue: [338, 339],
    html: `<div class="u-p-1r-1p25r"><pk-stack>
<pk-tabs id="t1" value="details">
<pk-tab id="a" value="details">Details</pk-tab><pk-tab id="b" value="history">History</pk-tab><pk-tab id="c" value="files" disabled>Files</pk-tab>
<pk-tab-panel value="details">Item details.</pk-tab-panel><pk-tab-panel value="history">Item history.</pk-tab-panel><pk-tab-panel value="files">Files.</pk-tab-panel>
</pk-tabs>
<pk-tabs id="t2" scroll value="s0">${TABS}<span slot="trailing">Updated a minute ago</span>${PANELS}</pk-tabs>
<div dir="rtl"><pk-tabs id="t3" scroll value="r0">${RTL_TABS}</pk-tabs></div>
</pk-stack></div>`,
    steps: [
        { shot: 'rest' },
        { focus: '#a' }, { key: 'ArrowRight' }, { wait: 200 }, { shot: 'arrow-right' },
        { focus: '#s0' }, { key: 'End' }, { wait: 700 }, { shot: 'strip-end' },
        { key: 'Home' }, { wait: 700 }, { shot: 'strip-start' },
        { key: 'ArrowRight' }, { wait: 500 }, { key: 'ArrowRight' }, { wait: 500 }, { key: 'ArrowRight' }, { wait: 500 }, { key: 'ArrowRight' }, { wait: 700 }, { shot: 'strip-middle' }, { shot: 'strip-middle-ring' },
        { focus: '#r0' }, { key: 'End' }, { wait: 700 }, { shot: 'rtl-end' },
        { key: 'Home' }, { wait: 700 }, { shot: 'rtl-start' },
    ],
    expect(t) {
        const PANEL = '#t1 > pk-tab-panel[selected]';
        const list = strip => strip + ' >>> [part=list]';
        // data-fade says which side of the strip is faded because it has more tabs there: end is the right edge, start the left, mirrored in right-to-left; no attribute = it fits.
        const fade = strip => t.attr(list(strip), 'data-fade');
        // The strip clips its tabs, so a tab must lie inside the strip, and clear of the fade on a side that has more tabs.
        const fits = (sel, strip, what) => {
            const a = t.rect(sel), l = t.rect(list(strip)), f = fade(strip);
            if (!a || !l) return t.ok(false, `${sel} or its strip is missing`);
            const FADE = parseFloat(t.style(list(strip), 'scroll-padding-left')) || 0; // the fade width: 1.75rem
            const rtl = strip === '#t3', onLeft = f === 'both' || f === (rtl ? 'end' : 'start'), onRight = f === 'both' || f === (rtl ? 'start' : 'end');
            const left = l.x + (onLeft ? FADE : 0), right = l.right - (onRight ? FADE : 0);
            t.ok(a.x >= left - 1 && a.right <= right + 1, `${what} (x ${Math.round(a.x)} to ${Math.round(a.right)}) is not fully inside its strip (x ${Math.round(l.x)} to ${Math.round(l.right)}) and clear of the edge fade`);
        };
        const affordance = (strip, want, what) => t.ok(fade(strip) === want, `${what}: the strip should fade its ${want} side (it has more tabs there), data-fade is ${fade(strip)}`);
        const phone = t.viewport.name === 'phone';
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
            t.atLeast('#b', 'height', phone ? 40 : 30);
        }
        if (t.shot === 'strip-end') {
            t.ok(t.attr('#s7', 'selected') !== null, 'End did not select the last tab');
            t.inViewport('#s7'); fits('#s7', '#t2', 'the last tab');
            t.ringVisible('#s7'); t.ringUnclipped('#s7');
            if (phone) affordance('#t2', 'start', 'scrolled to the end');
        }
        if (t.shot === 'strip-start') {
            t.ok(t.attr('#s0', 'selected') !== null, 'Home did not select the first tab');
            fits('#s0', '#t2', 'the first tab');
            if (phone) affordance('#t2', 'end', 'scrolled back to the start');
        }
        // Two shots of one state: the report lists one message per rule and shot.
        if (t.shot === 'strip-middle') {
            t.ok(t.attr('#s4', 'selected') !== null, 'four ArrowRight presses from the first tab did not select the fifth');
            t.inViewport('#s4'); fits('#s4', '#t2', 'the tab reached with the arrow keys');
            if (phone) affordance('#t2', 'both', 'scrolled to the middle');
        }
        if (t.shot === 'strip-middle-ring') { t.ringVisible('#s4'); t.ringUnclipped('#s4'); }
        if (t.shot === 'rtl-end') {
            t.ok(t.attr('#r7', 'selected') !== null, 'End did not select the last tab of the right-to-left strip');
            fits('#r7', '#t3', 'the last right-to-left tab'); t.ringVisible('#r7'); t.ringUnclipped('#r7');
            if (phone) affordance('#t3', 'start', 'right to left, scrolled to the end');
        }
        if (t.shot === 'rtl-start') {
            t.ok(t.attr('#r0', 'selected') !== null, 'Home did not select the first tab of the right-to-left strip');
            fits('#r0', '#t3', 'the first right-to-left tab'); t.ringVisible('#r0'); t.ringUnclipped('#r0');
            if (phone) affordance('#t3', 'end', 'right to left, back at the start');
        }
        if (phone && t.shot !== 'rest') t.ok(t.metric(list('#t2'), 'scrollWidth') > t.metric(list('#t2'), 'clientWidth'), 'the tab strip fits on a phone: the scenario no longer exercises scrolling');
        if (!phone) t.ok(fade('#t2') === null, 'the strip fits on a desktop and must not show an overflow fade');
    },
};
