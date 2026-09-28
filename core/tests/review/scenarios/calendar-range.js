// pk-calendar range mode (issue 333) in its states: a complete range (start and end filled, the days between tinted), a pending range previewing under the pointer,
// Escape giving a pending start up (the old range returns), a second click before the start swapping the ends, minimum and maximum (days outside are disabled; Enter and the arrow keys pick and preview from the keyboard) and right to left (the range runs from the right edge; the rounded ends mirror). The month never scrolls sideways and every day stays a tap target on a phone.
const day = (id, iso) => `#${id} >>> .day[data-date="${iso}"]`;
const roles = (t, id, dates) => dates.map(d => t.attr(day(id, d), 'data-range') || '');
const ids = ['c1', 'c2', 'c3', 'c4'];

export default {
    name: 'calendar-range',
    issue: [333],
    elements: ['calendar'],
    html: `<div class="u-p-1r-1p25r"><pk-cluster>
<pk-calendar id="c1" range month="2026-09-01" start="2026-09-01" end="2026-09-03"></pk-calendar>
<pk-calendar id="c2" range month="2026-09-01" start="2026-09-08" end="2026-09-17"></pk-calendar>
<pk-calendar id="c3" range week-start="1" month="2026-09-01" min="2026-09-07" max="2026-09-25" start="2026-09-14" end="2026-09-18"></pk-calendar>
<div dir="rtl"><pk-calendar id="c4" range month="2026-09-01"></pk-calendar></div>
</pk-cluster></div>`,
    steps: [
        { shot: 'rest' },
        { click: day('c1', '2026-09-10') }, { hover: day('c1', '2026-09-16') }, { wait: 100 }, { shot: 'pending' },
        { key: 'Escape' }, { wait: 100 }, { shot: 'cancelled' },
        { click: day('c1', '2026-09-18') }, { click: day('c1', '2026-09-12') }, { wait: 100 }, { shot: 'swapped' },
        { focus: day('c3', '2026-09-07') }, { key: 'Enter' }, { key: 'ArrowRight', times: 2 }, { wait: 100 }, { shot: 'keyboard-min' },
        { click: day('c4', '2026-09-08') }, { hover: day('c4', '2026-09-11') }, { wait: 100 }, { shot: 'rtl-pending' },
    ],
    expect(t) {
        t.ok(t.metric('html', 'scrollWidth') <= t.metric('html', 'clientWidth') + 1, 'the page scrolls sideways (a month runs out of its element)');
        for (const id of ids) { t.within(`#${id} >>> [part=grid]`, `#${id}`, 1); }
        t.atLeast(day('c2', '2026-09-10'), 'height', t.viewport.name === 'phone' ? 44 : 28);
        const sep = n => `2026-09-${String(n).padStart(2, '0')}`;
        const span = (id, a, b) => roles(t, id, Array.from({ length: b - a + 3 }, (_, i) => sep(a - 1 + i)));
        if (t.shot === 'rest') {
            t.ok(span('c2', 8, 17).join() === ['', 'start', ...Array(8).fill('mid'), 'end', ''].join(), `c2 shows ${span('c2', 8, 17).join('|')}, expected start, eight days between and end`);
            t.ok(t.attr(day('c2', '2026-09-08'), 'aria-selected') === 'true' && t.attr(day('c2', '2026-09-17'), 'aria-selected') === 'true', 'the start and end days of c2 are not aria-selected');
            t.ok(t.attr(day('c2', '2026-09-12'), 'aria-selected') === null, 'a day between is aria-selected (only the ends are)');
            t.hasText('#c2 >>> ' + '.day[data-date="2026-09-08"]', '8');
            t.ok((t.attr(day('c2', '2026-09-08'), 'aria-label') || '').endsWith('range start'), 'the start day label does not name the range start');
            t.ok((t.attr(day('c2', '2026-09-12'), 'aria-label') || '').endsWith('in range'), 'a day between does not say it is in range');
            t.ok(t.style(day('c2', '2026-09-12'), 'background-color') !== t.style(day('c2', '2026-09-20'), 'background-color'), 'a day in the range is not tinted differently from one outside');
        }
        if (t.shot === 'pending') {
            t.ok(span('c1', 10, 16).join() === ['', 'start', ...Array(5).fill('mid'), 'end', ''].join(), `the pending preview shows ${span('c1', 10, 16).join('|')}, expected start, mid days and the hovered end`);
            t.ok(t.attr('#c1 >>> [part=status]', 'role') === 'status' && t.text('#c1 >>> [part=status]').startsWith('Range start set to'), `the live region says "${t.text('#c1 >>> [part=status]')}"`);
        }
        if (t.shot === 'cancelled') {
            t.ok(roles(t, 'c1', [sep(1), sep(2), sep(3), sep(10)]).join() === 'start,mid,end,', 'Escape did not bring back the previous range 1 to 3 September');
            t.ok(t.text('#c1 >>> [part=status]') === 'Range selection cancelled', 'Escape did not announce the cancel');
        }
        if (t.shot === 'swapped') {
            t.ok(span('c1', 12, 18).join() === ['', 'start', ...Array(5).fill('mid'), 'end', ''].join(), `after clicking 18 then 12 c1 shows ${span('c1', 12, 18).join('|')}, expected 12 to 18`);
            t.ok(t.text('#c1 >>> [part=status]').startsWith('Range: '), 'the completed range is not announced');
        }
        if (t.shot === 'keyboard-min') {
            t.ok(t.attr(day('c3', '2026-09-03'), 'disabled') !== null, 'a day before min is not disabled');
            t.ok(!t.attr(day('c3', '2026-09-03'), 'data-range'), 'a day before min is part of the preview');
            const r = roles(t, 'c3', [sep(6), sep(7), sep(8), sep(9), sep(10)]).join('|');
            t.ok(r === '|start|mid|end|', `Enter then two ArrowRight from the minimum day previews ${r}, expected |start|mid|end|`);
            t.ok(t.text('#c3 >>> [part=status]').startsWith('Range start set to'), 'Enter on the minimum day did not announce the start');
        }
        if (t.shot === 'rtl-pending') {
            const a = t.rect(day('c4', '2026-09-08')), b = t.rect(day('c4', '2026-09-11'));
            if (a && b) t.ok(a.x > b.x, 'in right to left the earlier day (x=' + Math.round(a.x) + ') is not to the right of the later day (x=' + Math.round(b.x) + ')');
            t.ok(span('c4', 8, 11).join() === ['', 'start', 'mid', 'mid', 'end', ''].join(), `the rtl preview shows ${span('c4', 8, 11).join('|')}`);
            t.ok(t.style(day('c4', '2026-09-08'), 'border-top-right-radius') !== '0px' && t.style(day('c4', '2026-09-08'), 'border-top-left-radius') === '0px', 'in right to left the start day is not rounded on its right side only');
        }
    },
};
