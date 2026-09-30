// pk-combobox inside containers that clip (issue 652): pk-card has overflow hidden and a short body, a form inside it adds a second wrapper. The open list must
// paint past the card's edge, be fully inside the viewport, hit-testable (not covered), and sit directly under its box; the select mode does the same.
const POP = id => `#${id} >>> [part=popup]`;
const BOX = id => `#${id} >>> [part=box]`;

export default {
    name: 'combobox-clipped',
    issue: [652],
    elements: ['combobox', 'card'],
    html: `<div class="u-p-1r-1p25r"><pk-card heading="Order">
<form><pk-stack>
<pk-combobox id="k1" label="Customer" placeholder="Type to search"><option value="1">Ada Lovelace</option><option value="2">Alan Turing</option><option value="3">Grace Hopper</option><option value="4">Edsger Dijkstra</option><option value="5">Barbara Liskov</option></pk-combobox>
<pk-combobox id="k2" mode="select" label="Channel" placeholder="Choose"><option value="web">Web</option><option value="market">Market</option><option value="live">Live</option><option value="other">Other</option></pk-combobox>
</pk-stack></form></pk-card></div>`,
    steps: [
        { click: '#k1 >>> [part=control]' }, { wait: 300 }, { shot: 'autocomplete-open' },
        { key: 'Escape' }, { wait: 200 },
        { click: '#k2 >>> [part=trigger]' }, { wait: 300 }, { shot: 'select-open' },
    ],
    expect(t) {
        const id = t.shot === 'autocomplete-open' ? 'k1' : 'k2';
        t.visible(POP(id), 'the open list');
        t.inViewport(POP(id));
        const b = t.rect(BOX(id)), p = t.rect(POP(id));
        if (b && p) {
            t.ok(Math.abs(p.y - b.bottom) <= 4 || Math.abs(b.y - p.bottom) <= 4, 'the list is not attached to its box');
            t.ok(p.width >= b.width - 2, `the list is ${Math.round(p.width)}px wide, narrower than its ${Math.round(b.width)}px box`);
        }
        t.ok(t.metric(POP(id), 'clientHeight') > 60, `the list is only ${t.metric(POP(id), 'clientHeight')}px tall: clipped by the card`);
    },
};
