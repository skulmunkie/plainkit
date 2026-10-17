// pk-splitter with collapsible (issue 1523): the toggle on the separator, the end pane collapsed to nothing and restored, the toggle's focus ring, and right to left,
// on a desktop and a phone. The measuring cases are in tests/browser/cases-layout.js; this renders the states so they can be looked at.
const SP = '#sp';
const TOGGLE = '#sp >>> [part=toggle]';
const HANDLE = '#sp >>> [part=handle]';
const START = '#sp >>> [part=start]';
const END = '#sp >>> [part=end]';

export default {
    name: 'splitter',
    issue: [1523],
    elements: ['splitter'],
    html: `<div id="stage" class="u-p-1r-1p25r">
<pk-splitter id="sp" size="60" min="30" max="80" collapsible label="Resize the inspector" toggle-label="Toggle the inspector">
<div slot="start" class="stack"><strong>Document</strong><span>The start pane takes the room the end pane gives up.</span></div>
<div slot="end" class="stack"><strong>Inspector</strong><span>Its content stays in place while collapsed.</span></div>
</pk-splitter>
<pk-splitter id="sv" orientation="vertical" size="50" collapsible collapsed label="Resize the console" toggle-label="Toggle the console">
<div slot="start">Editor</div><div slot="end">Console</div>
</pk-splitter>
</div>`,
    steps: [
        { shot: 'expanded' },
        { click: TOGGLE }, { wait: 500 }, { shot: 'collapsed' },
        { focus: TOGGLE }, { shot: 'collapsed-focus' },
        { set: '#stage', attr: 'dir', value: 'rtl' }, { shot: 'collapsed-rtl' },
        { click: TOGGLE }, { wait: 500 }, { shot: 'expanded-rtl' },
    ],
    expect(t) {
        t.visible(TOGGLE, 'the toggle'); t.visible(HANDLE, 'the separator'); t.inViewport(TOGGLE);
        const tg = t.rect(TOGGLE), h = t.rect(HANDLE), s = t.rect(START), e = t.rect(END);
        if (t.viewport.name === 'phone' && tg) t.ok(tg.width >= 43.5 && tg.height >= 43.5, `the toggle is ${Math.round(tg.width)}x${Math.round(tg.height)}, under the 44px touch target`);
        if (tg && h) t.ok(Math.abs(tg.x + tg.width / 2 - (h.x + h.width / 2)) < 2, 'the toggle is centred on the separator line');
        if (s && e && h) {
            const collapsed = t.shot.startsWith('collapsed');
            if (collapsed) { t.ok(e.width < 1, `the collapsed end pane is ${Math.round(e.width)}px wide, not 0`); t.ok(s.width > 0 && s.width + h.width >= t.rect(SP).width - 1, 'the start pane fills the splitter'); }
            else t.ok(e.width > 40, 'the expanded end pane has room');
        }
        const ve = t.rect('#sv >>> [part=end]'), vs = t.rect('#sv >>> [part=start]');
        t.visible('#sv >>> [part=toggle]', 'the stacked toggle');
        if (ve && vs) t.ok(ve.height < 1 && vs.height > 100, `the collapsed stacked end pane is ${Math.round(ve.height)}px high and the start pane ${Math.round(vs.height)}px`);
        if (t.shot === 'collapsed-focus') t.ringUnclipped(TOGGLE);
    },
};
