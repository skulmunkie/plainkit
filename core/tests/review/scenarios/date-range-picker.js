// pk-date-range-picker (issue 333) in its states: at rest with quick ranges, a quick range chosen (pressed, both fields filled), the end set before the start (inline
// error wired to both fields), a minimum and maximum that disable the quick ranges outside them, disabled, and the focus ring. Fields stay inside the element and the page never
// scrolls sideways; on a phone every control is a full-height tap target.
const part = (id, name) => `#${id} >>> [part=${name}]`;
const ids = ['r1', 'r2', 'r3', 'r4'];

export default {
    name: 'date-range-picker',
    issue: [333],
    elements: ['date-range-picker'],
    html: `<div class="u-p-1r-1p25r"><pk-stack>
<pk-date-range-picker id="r1" label="Reporting period" start="2026-09-01" end="2026-09-14" presets="today,7d,30d,month,lastmonth"></pk-date-range-picker>
<pk-date-range-picker id="r2" label="Booking" start="2026-09-10" end="2026-09-18" presets="7d"></pk-date-range-picker>
<pk-date-range-picker id="r3" label="Trip window" min="2020-01-01" max="2020-12-31" presets="today,year"></pk-date-range-picker>
<pk-date-range-picker id="r4" label="Locked period" start="2026-09-01" end="2026-09-14" disabled></pk-date-range-picker>
</pk-stack></div>`,
    steps: [
        { shot: 'rest' },
        { focus: '#r1 >>> [part=start]' }, { shot: 'focus' },
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
        t.visible(part('r1', 'presets'), 'the quick ranges');
        t.hidden(part('r1', 'error'), 'the error of a valid range');
        t.ok(t.attr(part('r4', 'start'), 'disabled') !== null, 'the disabled picker keeps its field enabled');
        t.ok((t.attr(part('r1', 'start'), 'aria-label') ?? '') === 'Start date', 'the start field has no accessible name');
        // The window of 2020 leaves no room for a range ending today: both quick ranges are disabled.
        t.ok(t.attr(`#r3 >>> [data-preset="today"]`, 'disabled') !== null, 'a quick range wholly outside min and max is not disabled');
        if (t.shot === 'focus') { t.ringVisible(part('r1', 'start')); t.ringUnclipped(part('r1', 'start')); }
        if (t.shot === 'preset-chosen') {
            t.ok(t.attr('#r1 >>> [data-preset="30d"]', 'aria-pressed') === 'true', 'the chosen quick range is not marked pressed');
        }
        if (t.shot === 'end-before-start') {
            t.visible(part('r2', 'error'), 'the error for an end before the start'); t.within(part('r2', 'error'), '#r2', 1);
            t.hasText(part('r2', 'error'), 'before the start');
            below(part('r2', 'error'), part('r2', 'fields'));
            t.ok(t.attr(part('r2', 'end'), 'aria-invalid') === 'true', 'the end field is not aria-invalid');
            t.ok(t.attr(part('r2', 'start'), 'aria-describedby') === 'e', 'the start field is not tied to the error text');
        }
    },
};
