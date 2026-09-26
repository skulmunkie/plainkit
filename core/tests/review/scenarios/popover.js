// pk-popover open: a non-modal panel next to its trigger (the same fixed-layer risk as pk-dropdown, issue 283), with a trigger wrapped in display: contents,
// the confirm variant with Cancel and Confirm reachable, a panel at the right edge that must stay in the viewport, and the trigger's focus ring.
const PANEL = id => `#${id} >>> [part=panel]`;

export default {
    name: 'popover',
    issue: [283, 300],
    elements: ['popover'],
    html: `<div class="u-p-1r-1p25r"><pk-cluster>
<pk-popover id="p1" heading="Order 1042"><span slot="trigger" class="u-contents"><pk-button id="t1" variant="ghost">Details</pk-button></span>Placed 12 September, three lines, shipping to Portland. The customer asked for a gift receipt and two separate boxes.</pk-popover>
<pk-popover id="p2" variant="confirm" heading="Delete this line?" message="It cannot be undone." confirm-label="Delete" danger class="u-ml-auto"><pk-button id="t2" slot="trigger" variant="warn">Delete line</pk-button></pk-popover>
</pk-cluster>
<p>Some page text under the toolbar.</p></div>`,
    steps: [
        { shot: 'closed' },
        { click: '#t1' }, { wait: 300 }, { shot: 'open-wrapped' },
        { key: 'Escape' }, { wait: 200 },
        { click: '#t2' }, { wait: 300 }, { shot: 'open-confirm' },
        { key: 'Escape' }, { wait: 200 },
        { focus: '#t1 >>> [part=control]' }, { shot: 'trigger-focus' },
    ],
    expect(t) {
        const open = { 'open-wrapped': ['p1', 't1'], 'open-confirm': ['p2', 't2'] }[t.shot];
        if (!open) {
            t.hidden(PANEL('p1'), 'the panel of the first popover while closed'); t.hidden(PANEL('p2'), 'the panel of the second popover while closed');
            if (t.shot === 'trigger-focus') { t.ringVisible('#t1 >>> [part=control]'); t.ringUnclipped('#t1 >>> [part=control]'); }
            return;
        }
        const [id, trig] = open;
        const panel = PANEL(id);
        t.visible(panel, 'the open panel');
        t.inViewport(panel);
        t.noOverlap(panel, `#${trig}`);
        const p = t.rect(panel), b = t.rect(`#${trig}`);
        if (p && b) {
            const near = Math.min(Math.abs(p.y - b.bottom), Math.abs(b.y - p.bottom));
            t.ok(near <= 20, `the panel is ${Math.round(near)}px from its trigger, expected it next to it (at most 20px)`);
            t.ok(p.x < b.right && p.right > b.x, `the panel (x ${Math.round(p.x)} to ${Math.round(p.right)}) is not aligned with its trigger (x ${Math.round(b.x)} to ${Math.round(b.right)})`);
            t.ok(p.x > 0 || p.y > 0, 'the panel is at 0,0 (it lost its anchor)');
        }
        t.ok(t.metric(panel, 'scrollWidth') <= t.metric(panel, 'clientWidth') + 1, 'the panel content is wider than the panel');
        t.visible(`#${id} >>> [part=title]`, 'the heading');
        t.within(`#${id} >>> [part=title]`, panel);
        if (id === 'p2') {
            for (const part of ['cancel', 'confirm']) {
                const sel = `#${id} >>> [part=${part}]`;
                t.visible(sel, `the ${part} button`); t.within(sel, panel); t.atLeast(sel, 'height', t.viewport.name === 'phone' ? 36 : 28);
            }
            t.noOverlap(`#${id} >>> [part=cancel]`, `#${id} >>> [part=confirm]`);
            t.ok(t.attr(panel, 'role') === 'alertdialog', 'the confirm panel is not role=alertdialog');
        } else t.hidden(`#${id} >>> [part=actions]`, 'the Cancel and Confirm row of a plain popover');
    },
};
