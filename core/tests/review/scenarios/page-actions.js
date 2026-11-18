// The title bar's action list (#1943, phase 1): newAction first and primary, icon items fold to the icon alone by the bar-wide actionsCollapse (default phone: icons only on a
// phone, icon + text on a large screen; always; none), the label staying the name, never clipped or overlapping, left to right and (dir="rtl") right to left.
export default {
    name: 'page-actions',
    issue: [1943],
    elements: ['page-header', 'tool-page', 'record-page', 'sections-page'],
    html: `<div id="stage" class="u-p-1r-1p25r"><pk-tool-page id="p1" config='{"heading":"Default (phone)","newAction":{"key":"new","label":"New order","icon":"plus"},"actions":[{"key":"export","label":"Export","icon":"download","variant":"ghost"},{"key":"share","label":"Share","icon":"share"}]}'></pk-tool-page><pk-tool-page id="p2" config='{"heading":"Always","newAction":{"key":"new","label":"New order","icon":"plus"},"actions":[{"key":"export","label":"Export","icon":"download","variant":"ghost"},{"key":"share","label":"Share","icon":"share"}],"actionsCollapse":"always"}'></pk-tool-page><pk-tool-page id="p3" config='{"heading":"None","newAction":{"key":"new","label":"New order","icon":"plus"},"actions":[{"key":"export","label":"Export","icon":"download","variant":"ghost"},{"key":"share","label":"Share","icon":"share"}],"actionsCollapse":"none"}'></pk-tool-page></div>`,
    steps: [
        { shot: 'ltr' },
        { set: '#stage', attr: 'dir', value: 'rtl' }, { shot: 'rtl' },
    ],
    expect(t) {
        const rtl = t.shot.startsWith('rtl'), phone = t.viewport.name === 'phone';
        const width = id => t.rect(`#${id} >>> pk-button[slot=actions]`);
        for (const id of ['p1', 'p2', 'p3']) {
            t.visible(`#${id}`, `page ${id}`);
            t.inViewport(`#${id}`);
        }
        const a = width('p1'), b = width('p2'), c = width('p3');
        if (a && b && c) {
            t.ok(b.width <= 48, `actionsCollapse always: New order is icon-only (${Math.round(b.width)}px wide)`);
            t.ok(c.width > 60, `actionsCollapse none: New order keeps its words (${Math.round(c.width)}px wide)`);
            t.ok(phone ? a.width <= 48 : a.width > 60, `default: ${phone ? 'icon-only on a phone' : 'icon and text on a large screen'} (${Math.round(a.width)}px wide)`);
        }
    },
};
