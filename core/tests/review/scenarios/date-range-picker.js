// pk-date-range-picker (issue 333) in its states: at rest with quick ranges, a quick range chosen (pressed, both fields filled), the end set before the start (inline
// error wired to both fields), a minimum and maximum that disable the quick ranges outside them, disabled, and the focus ring. Fields stay inside the element and the page never
// scrolls sideways; on a phone every control is a full-height tap target. Right to left (r5): the start field sits on the right, the quick ranges start at the right edge and
// nothing leaves the element.
const part = (id, name) => `#${id} >>> [part=${name}]`;
const ctl = (id, name) => `#${id} >>> [part=${name}] >>> [part=control]`;
const box = (id, name) => `#${id} >>> [part=${name}] >>> [part=box]`;
const ids = ['r1', 'r2', 'r3', 'r4', 'r5'];

export default {
    name: 'date-range-picker',
    issue: [333],
    elements: ['date-range-picker'],
    html: `<div class="u-p-1r-1p25r"><pk-stack>
<pk-date-range-picker id="r1" label="Reporting period" start="2026-09-01" end="2026-09-14" presets="today,7d,30d,month,lastmonth"></pk-date-range-picker>
<pk-date-range-picker id="r2" label="Booking" start="2026-09-10" end="2026-09-18" presets="7d"></pk-date-range-picker>
<pk-date-range-picker id="r3" label="Trip window" min="2020-01-01" max="2020-12-31" presets="today,year"></pk-date-range-picker>
<pk-date-range-picker id="r4" label="Locked period" start="2026-09-01" end="2026-09-14" disabled></pk-date-range-picker>
<div dir="rtl"><pk-date-range-picker id="r5" label="Reporting period" start="2026-09-01" end="2026-09-14" presets="today,7d,30d,month,lastmonth"></pk-date-range-picker></div>
</pk-stack></div>`,
    steps: [
        { shot: 'rest' },
        { focus: '#r1 >>> [part=start] >>> [part=control]' }, { shot: 'focus' },
        { click: '#r1 >>> [data-preset="30d"]' }, { wait: 200 }, { shot: 'preset-chosen' },
        { set: '#r2', prop: 'end', value: '2026-09-01' }, { wait: 300 }, { shot: 'end-before-start' },
    ],
    expect(t) {
        const below = (a, b) => { const p = t.rect(a), q = t.rect(b); if (p && q) t.ok(p.y >= q.bottom - 1, `${a} starts at y=${Math.round(p.y)}, above the end of ${b} (y=${Math.round(q.bottom)})`); };
        t.ok(t.metric('html', 'scrollWidth') <= t.metric('html', 'clientWidth') + 1, 'the page scrolls sideways (the fields or quick ranges run out of the element)');
        for (const id of ids) {
            if (id !== 'r4') t.inViewport(`#${id}`, 1);
            for (const p of ['start', 'end']) { t.visible(part(id, p), `the ${p} field of ${id}`); t.within(part(id, p), `#${id}`, 1); t.atLeast(part(id, p), 'height', t.viewport.name === 'phone' ? 44 : 30); }
            t.noOverlap(part(id, 'start'), part(id, 'end'));
        }
        below(part('r1', 'presets'), part('r1', 'fields'));
        below(part('r5', 'presets'), part('r5', 'fields'));
        // Right to left: reading order runs from the right, so the start field is to the right of the end field and the quick ranges begin at the right edge of the element.
        const rs = t.rect(part('r5', 'start')), re = t.rect(part('r5', 'end')), host = t.rect('#r5'), first = t.rect('#r5 >>> [data-preset]');
        if (rs && re) t.ok(rs.x >= re.right - 1, `in right to left the start field (x=${Math.round(rs.x)}) is not to the right of the end field (right edge ${Math.round(re.right)})`);
        if (first && host) t.ok(first.right >= host.right - 16, `in right to left the first quick range ends at x=${Math.round(first.right)}, away from the right edge of the element (${Math.round(host.right)})`);
        t.within(part('r5', 'presets'), '#r5', 1);
        t.visible(part('r1', 'presets'), 'the quick ranges');
        t.hidden(part('r1', 'error'), 'the error of a valid range');
        t.ok(t.attr(part('r4', 'start'), 'disabled') !== null, 'the disabled picker keeps its field enabled');
        t.ok((t.attr(ctl('r1', 'start'), 'aria-label') ?? '') === 'Start date', 'the start field has no accessible name');
        // The window of 2020 leaves no room for a range ending today: both quick ranges are disabled.
        t.ok(t.attr(`#r3 >>> [data-preset="today"]`, 'disabled') !== null, 'a quick range wholly outside min and max is not disabled');
        if (t.shot === 'focus') { t.ringVisible(box('r1', 'start')); t.ringUnclipped(box('r1', 'start')); }
        if (t.shot === 'preset-chosen') {
            t.ok(t.attr('#r1 >>> [data-preset="30d"]', 'pressed') !== null, 'the chosen quick range is not marked pressed');
        }
        if (t.shot === 'end-before-start') {
            t.visible(part('r2', 'error'), 'the error for an end before the start'); t.within(part('r2', 'error'), '#r2', 1);
            t.hasText(part('r2', 'error'), 'before the start');
            below(part('r2', 'error'), part('r2', 'fields'));
            t.ok(t.attr(ctl('r2', 'end'), 'aria-invalid') === 'true', 'the end field is not aria-invalid');
            t.ok((t.attr(ctl('r2', 'start'), 'aria-description') ?? '').includes('before the start'), 'the start field does not carry the error text');
        }
    },
};
