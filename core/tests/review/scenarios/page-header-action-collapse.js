// pk-page-header action buttons (issue 1009): icon plus label on desktop, icon only on a phone (the label stays the accessible name), at least a touch target.
const BTNS = ['#ph pk-button:nth-of-type(1)', '#ph pk-button:nth-of-type(2)'];
export default {
    name: 'page-header-action-collapse',
    issue: [1009],
    elements: ['page-header'],
    html: `<pk-page-header id="ph" variant="record"><pk-badge>Open</pk-badge><pk-button slot="actions" variant="ghost" icon-name="document" collapse="phone">Print</pk-button><pk-button slot="actions" icon-name="save" collapse="phone">Save</pk-button></pk-page-header>`,
    steps: [{ wait: 200 }, { shot: 'rest' }],
    expect(t) {
        for (const s of BTNS) {
            t.visible(s, 'an action button');
            const r = t.rect(s);
            if (t.viewport.name === 'phone') {
                if (r) t.ok(r.width <= 64, `on a phone an action button should be icon only, but it is ${Math.round(r.width)}px wide`);
                t.atLeast(s, 'height', 44);
            } else if (r) t.ok(r.width > 80, `on desktop an action button keeps icon and text, but it is ${Math.round(r.width)}px wide`);
        }
    },
};
