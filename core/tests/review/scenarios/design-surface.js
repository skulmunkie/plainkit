// pk-design-surface: the page frame and the marks it draws around the page's nodes. The host (setup) plays the layout builder: it sets selected, dropTarget and chipFor and
// flags nodes hidden or empty, driven by the buttons like a person would. Shots: resting, selected with its chip, hidden and empty nodes, a drop target during an external drag
// (chip hidden), the tablet and phone frames, a node scrolled out of view and revealed, the keyboard ring, and right-to-left.
const S = '#surface';
const F = '#surface >>> [part=frame]';
const G = '#surface >>> .ground';
const CHIP = '#surface >>> [part=chip]';
const sel = kind => `#surface >>> [part=mark-${kind}]`;

export default {
    name: 'design-surface',
    issue: [430],
    elements: ['design-surface', 'button', 'card', 'stack', 'cluster', 'heading', 'text'],
    html: `<div id="stage"><pk-stack gap="2"><pk-cluster gap="1">
<pk-button id="b-select" size="sm" variant="secondary" collapse="phone" icon-name="edit">Select</pk-button>
<pk-button id="b-flags" size="sm" variant="secondary" collapse="phone" icon-name="eye-off">Hidden and empty</pk-button>
<pk-button id="b-drop" size="sm" variant="secondary" collapse="phone" icon-name="plus">Drag in</pk-button>
<pk-button id="b-far" size="sm" variant="secondary" collapse="phone" icon-name="chevron-down">Reveal last</pk-button>
</pk-cluster>
<pk-design-surface id="surface" label="Page canvas">
<pk-stack gap="3"><pk-heading level="3" id="title">Order summary</pk-heading>
<pk-card id="card"><pk-text>Two items, free shipping.</pk-text></pk-card>
<pk-text id="note">A note that can be hidden.</pk-text>
<pk-stack id="slot" gap="1"></pk-stack>
<pk-text>Filler one.</pk-text><pk-text>Filler two.</pk-text><pk-text>Filler three.</pk-text><pk-text>Filler four.</pk-text><pk-text>Filler five.</pk-text><pk-text>Filler six.</pk-text><pk-text>Filler seven.</pk-text><pk-text>Filler eight.</pk-text>
<pk-text id="last">The last line.</pk-text></pk-stack>
<pk-button slot="chip" size="sm" variant="ghost" collapse="phone" icon-name="edit">Edit</pk-button>
<pk-button slot="chip" size="sm" variant="ghost" collapse="phone" icon-name="trash">Delete</pk-button>
</pk-design-surface></pk-stack></div>`,
    setup(frame) {
        const $ = id => frame.querySelector(`#${id}`), s = $('surface');
        s.style.blockSize = '26rem';
        $('b-select').addEventListener('click', () => { s.selected = $('card'); s.chipFor = $('card'); s.reveal($('card')); });
        $('b-flags').addEventListener('click', () => { $('note').toggleAttribute('data-surface-hidden', true); $('slot').toggleAttribute('data-surface-empty', true); });
        $('b-drop').addEventListener('click', () => { s.dragging = true; s.dropTarget = $('slot'); });
        $('b-far').addEventListener('click', () => { s.dragging = false; s.dropTarget = null; s.selected = $('last'); s.chipFor = $('last'); s.reveal($('last')); });
    },
    steps: [
        { shot: 'resting' },
        { click: '#b-select' }, { wait: 150 }, { shot: 'selected-chip' },
        { click: '#b-flags' }, { wait: 150 }, { shot: 'hidden-empty' },
        { click: '#b-drop' }, { wait: 150 }, { shot: 'drop-target' },
        { set: S, attr: 'width', value: 'tablet' }, { wait: 150 }, { shot: 'tablet' },
        { set: S, attr: 'width', value: 'phone' }, { wait: 150 }, { shot: 'phone-frame' },
        { click: '#b-far' }, { wait: 250 }, { shot: 'revealed' },
        { focus: F }, { wait: 100 }, { shot: 'focus' },
        { set: S, attr: 'width', value: 'full' }, { set: '#stage', attr: 'dir', value: 'rtl' }, { click: '#b-select' }, { wait: 250 }, { shot: 'rtl' },
    ],
    expect(t) {
        t.visible(S, 'the surface'); t.within(F, G); t.fitsWidth(G);
        if (t.shot === 'selected-chip' || t.shot === 'rtl' || t.shot === 'revealed') {
            t.visible(sel('selected'), 'the selection mark'); t.within(sel('selected'), G); t.within(CHIP, G, 1); t.inViewport(CHIP);
        }
        if (t.shot === 'selected-chip' || t.shot === 'rtl') { t.within('#card', G); }
        if (t.shot === 'hidden-empty') { t.visible(sel('hidden'), 'the hidden veil'); t.visible(sel('empty'), 'the empty frame'); t.within(sel('hidden'), G); t.within(sel('empty'), G); }
        if (t.shot === 'drop-target') { t.visible(sel('drop'), 'the drop-target box'); t.hidden(CHIP, 'the chip during an external drag'); t.within(sel('drop'), G); }
        if (t.shot === 'phone-frame') { t.atLeast('#surface >>> [part=page]', 'width', 1); }
        if (t.shot === 'focus') t.ringVisible(F), t.ringUnclipped(F);
        if (t.viewport.name === 'phone' && t.shot === 'selected-chip') {
            for (const b of ['#surface > pk-button:nth-of-type(1)', '#surface > pk-button:nth-of-type(2)']) { const r = t.rect(b); if (r) t.ok(r.width >= 44 && r.height >= 44, `${b} is at least 44px (${Math.round(r.width)}x${Math.round(r.height)})`); }
        }
    },
};
