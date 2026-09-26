// pk-combobox open list (autocomplete and select mode): the list opens directly under (or above) the box at least as wide as it and inside the viewport, a long list
// scrolls inside its own max-height instead of growing the page, the arrow keys highlight an option and keep it in view, no match shows the empty message, and the
// select mode marks the chosen option and greys the disabled one. Focus stays on the control.
const OPTIONS = Array.from({ length: 30 }, (_, i) => `<option value="AC-${1000 + i}">AC-${1000 + i} - Widget ${i + 1}</option>`).join('');
const POP = id => `#${id} >>> [part=popup]`;
const BOX = id => `#${id} >>> [part=box]`;

export default {
    name: 'combobox',
    elements: ['combobox'],
    html: `<div class="u-p-1r-1p25r"><pk-stack>
<pk-combobox id="c1" label="Variant" placeholder="Type to search">${OPTIONS}</pk-combobox>
<pk-combobox id="c2" mode="select" label="Channel" placeholder="Choose a channel" value="market"><option value="web">Web</option><option value="market">Market</option><option value="live">Live</option><option value="other" disabled>Poshmark (unavailable)</option></pk-combobox>
</pk-stack></div>`,
    steps: [
        { shot: 'closed' },
        { click: '#c1 >>> [part=control]' }, { wait: 300 }, { shot: 'open-list' },
        { key: 'ArrowDown', times: 3 }, { wait: 200 }, { shot: 'active' },
        { key: 'End' }, { key: 'ArrowDown', times: 12 }, { wait: 300 }, { shot: 'scrolled' },
        { type: 'zzz' }, { wait: 300 }, { shot: 'empty' },
        { key: 'Escape' }, { wait: 200 },
        { click: '#c2 >>> [part=trigger]' }, { wait: 300 }, { shot: 'select-open' },
    ],
    expect(t) {
        const one = ['open-list', 'active', 'scrolled', 'empty'].includes(t.shot);
        if (t.shot === 'closed') { t.hidden(POP('c1'), 'the list of the autocomplete while closed'); t.hidden(POP('c2'), 'the list of the select while closed'); t.atLeast(BOX('c1'), 'height', t.viewport.name === 'phone' ? 44 : 30); return; }
        const id = one ? 'c1' : 'c2';
        t.visible(POP(id), 'the open list');
        t.inViewport(POP(id));
        const b = t.rect(BOX(id)), p = t.rect(POP(id));
        if (b && p) {
            t.ok(p.y >= b.bottom - 2 || p.bottom <= b.y + 2, `the list (y ${Math.round(p.y)} to ${Math.round(p.bottom)}) overlaps its box (y ${Math.round(b.y)} to ${Math.round(b.bottom)})`);
            t.ok(Math.min(Math.abs(p.y - b.bottom), Math.abs(b.y - p.bottom)) <= 4, 'the list is not attached to its box');
            t.ok(p.width >= b.width - 2, `the list is ${Math.round(p.width)}px wide, narrower than its ${Math.round(b.width)}px box`);
            t.ok(p.x >= b.x - 2 && p.x <= b.x + 2, `the list starts at x=${Math.round(p.x)}, its box at x=${Math.round(b.x)}`);
        }
        t.ok(t.metric(POP(id), 'clientHeight') <= 302, `the list is ${t.metric(POP(id), 'clientHeight')}px tall, expected its 300px maximum`);
        if (t.shot === 'open-list') { t.scrolls(POP(id)); t.ok(t.metric('html', 'scrollHeight') <= t.viewport.height + 1, 'the open list makes the page taller (it should overlay)'); }
        if (t.shot === 'active') t.ok(t.attr(`#${id} >>> [part=control]`, 'aria-activedescendant'), 'the arrow keys set no aria-activedescendant on the control');
        if (t.shot === 'scrolled') {
            t.ok(t.metric(POP(id), 'scrollTop') > 0, 'the list did not scroll to keep the highlighted option in view');
            const op = t.attr(`#${id} >>> [part=control]`, 'aria-activedescendant');
            if (op) t.within(`#${id} >>> #${op}`, POP(id), 2);
        }
        if (t.shot === 'empty') {
            t.visible(`#${id} >>> [part=empty]`, 'the empty message'); t.hasText(`#${id} >>> [part=empty]`, 'No matches');
            t.within(`#${id} >>> [part=empty]`, POP(id));
        }
        if (t.shot === 'select-open') {
            t.ok(t.attr('#c2 >>> [part=trigger]', 'aria-expanded') === 'true', 'the select trigger does not say aria-expanded="true"');
            t.hasText('#c2 >>> [part=trigger]', 'Market');
            t.ok(t.attr('#c2 >>> [part=option][aria-selected="true"]', 'aria-selected') === 'true', 'no option is marked selected');
            t.hasText('#c2 >>> [part=option][aria-selected="true"]', 'Market');
            t.ok(t.attr('#c2 >>> [part=option][aria-disabled="true"]', 'aria-disabled') === 'true', 'the unavailable option is not aria-disabled');
            t.atLeast('#c2 >>> [part=option]', 'height', t.viewport.name === 'phone' ? 40 : 28);
        }
    },
};
