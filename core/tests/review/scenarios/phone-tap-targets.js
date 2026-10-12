// On a phone the splitter handle and an empty-ish tab panel (a focus stop) keep the 44px touch target: the handle's row or column is --touch-target wide,
// the panel is at least that tall. Desktop sizes are unchanged (the rules are phone-only).
export default {
    name: 'phone-tap-targets',
    elements: ['splitter', 'tab-panel'],
    viewports: ['phone'],
    html: `<div class="u-p-1r-1p25r"><pk-stack>
<pk-splitter id="h" label="Resize the list"><div slot="start"><p>List</p><p>Rows</p><p>More</p></div><div slot="end"><p>Detail</p><p>Notes</p><p>More</p></div></pk-splitter>
<pk-splitter id="v" orientation="vertical" label="Resize the console"><div slot="start">Editor</div><div slot="end">Console</div></pk-splitter>
<pk-tabs value="a"><pk-tab value="a">First</pk-tab><pk-tab value="b">Second</pk-tab><pk-tab-panel value="a">One line.</pk-tab-panel><pk-tab-panel value="b">Two.</pk-tab-panel></pk-tabs>
</pk-stack></div>`,
    steps: [{ shot: 'rest' }],
    expect(t) {
        const h = t.rect('#h >>> [part="handle"]'), v = t.rect('#v >>> [part="handle"]'), p = t.rect('pk-tab-panel[selected]');
        t.ok(!!h && h.width >= 44 - 0.5, `the side-by-side handle is ${h && Math.round(h.width)}px wide, needs 44`);
        t.ok(!!v && v.height >= 44 - 0.5, `the stacked handle is ${v && Math.round(v.height)}px tall, needs 44`);
        t.ok(!!p && p.height >= 44 - 0.5, `the selected tab panel is ${p && Math.round(p.height)}px tall, needs 44`);
    },
};
