// pk-date-range-picker with the calendar attribute (issue 333): the calendar button after the fields, the popover with the range pk-calendar open under the field with the
// picker's range shown, a range chosen with two clicks (the popover closes, the fields follow, focus is back on the button), Escape closing it, and right to left (d2: the button
// sits at the left end, the panel stays in the viewport). On a phone the panel never leaves the viewport and the button is a tap target.
const cal = id => `#${id} >>> [part=calendar]`;
const day = (id, iso) => `${cal(id)} >>> .day[data-date="${iso}"]`;
const panel = id => `#${id} >>> [part=popover] >>> [part=panel]`;

export default {
    name: 'date-range-picker-calendar',
    issue: [333],
    elements: ['date-range-picker', 'calendar', 'popover'],
    html: `<div class="u-p-1r-1p25r"><pk-stack>
<pk-date-range-picker id="d1" calendar label="Reporting period" start="2026-09-08" end="2026-09-17" presets="today,7d"></pk-date-range-picker>
<div dir="rtl"><pk-date-range-picker id="d2" calendar label="Reporting period" start="2026-09-08" end="2026-09-17" presets=""></pk-date-range-picker></div>
</pk-stack></div>`,
    steps: [
        { wait: 400 }, { shot: 'closed' },
        { click: '#d1 >>> [part=opener]' }, { wait: 400 }, { shot: 'open' },
        { click: day('d1', '2026-09-20') }, { hover: day('d1', '2026-09-25') }, { wait: 150 }, { shot: 'picking' },
        { click: day('d1', '2026-09-25') }, { wait: 300 }, { shot: 'range-chosen' },
        { click: '#d1 >>> [part=opener]' }, { wait: 300 }, { key: 'Escape' }, { wait: 300 }, { shot: 'escaped' },
        { click: '#d2 >>> [part=opener]' }, { wait: 400 }, { shot: 'rtl-open' },
    ],
    expect(t) {
        t.ok(t.metric('html', 'scrollWidth') <= t.metric('html', 'clientWidth') + 1, 'the page scrolls sideways (the panel or the fields run out of the viewport)');
        for (const id of ['d1', 'd2']) {
            t.visible(`#${id} >>> [part=opener]`, `the calendar button of ${id}`);
            t.within(`#${id} >>> [part=opener]`, `#${id}`, 1);
            t.atLeast(`#${id} >>> [part=opener]`, 'height', t.viewport.name === 'phone' ? 44 : 30);
            t.sameRow(`#${id} >>> [part=opener]`, `#${id} >>> [part=end]`, 8);
        }
        const open = { open: 'd1', picking: 'd1', 'rtl-open': 'd2' }[t.shot];
        if (!open) { t.hidden(panel('d1'), 'the panel of d1 while closed'); if (t.shot !== 'rtl-open') t.hidden(panel('d2'), 'the panel of d2 while closed'); }
        if (open) {
            t.visible(panel(open), 'the open panel'); t.inViewport(panel(open), 1);
            t.visible(cal(open), 'the calendar in the panel');
            t.within(cal(open), panel(open), 1);
            t.styleIs(cal(open), 'border-top-width', '0px');
            const p = t.rect(panel(open)), f = t.rect(`#${open} >>> [part=fields]`);
            if (p && f) t.ok(p.y >= f.bottom - 1, `the panel starts at y=${Math.round(p.y)}, above the end of the fields (y=${Math.round(f.bottom)})`);
            if (t.shot === 'open' || t.shot === 'rtl-open') { const focused = `${cal(open)} >>> .day[tabindex="0"]`; t.ringVisible(focused); t.ringUnclipped(focused); }
            if (t.shot === 'rtl-open') { const p2 = t.rect(panel(open)), b = t.rect(`#${open} >>> [part=opener]`); if (p2 && b && t.viewport.name !== 'phone') t.ok(Math.abs(p2.right - b.right) <= 1, `the RTL panel ends at x=${Math.round(p2.right)}, not at the opener's inline-start (right) edge x=${Math.round(b.right)}`); }
            if (t.shot !== 'picking') t.ok(t.attr(day(open, '2026-09-12'), 'data-range') === 'mid', 'the picker range is not shown in the calendar');
            if (t.shot === 'picking') t.ok(t.attr(day(open, '2026-09-22'), 'data-range') === 'mid', 'the pending range does not preview under the pointer');
        }
        if (t.shot === 'range-chosen') {
            t.ok(t.attr(day('d1', '2026-09-22'), 'data-range') === 'mid', 'the chosen range 20 to 25 September is not shown once the popover is opened again');
        }
    },
};
