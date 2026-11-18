// The list toolbar draws newAction and toolbarActions with the shared renderer (#1943, phase 2): newAction first and primary, icon buttons fold per actionsCollapse
// (default phone: icons only on a phone, icon + text on a large screen; always), the label staying the name, never clipped or overlapping, left to right and right to left.
const cfg = extra => JSON.stringify({ columns: [{ key: 'id', label: 'Id' }, { key: 'name', label: 'Name' }], newAction: { key: 'new', label: 'New order', icon: 'plus' }, toolbarActions: [{ key: 'export', label: 'Export', icon: 'download', variant: 'ghost' }, { key: 'share', label: 'Share', icon: 'share' }], ...extra }).replace(/'/g, '&#39;');
export default {
    name: 'list-page-new-action',
    issue: [1943],
    elements: ['list-page', 'data-table'],
    html: `<div id="stage" class="u-p-1r-1p25r"><pk-list-page id="l1" config='${cfg({})}'></pk-list-page><pk-list-page id="l2" config='${cfg({ actionsCollapse: 'always' })}'></pk-list-page></div>`,
    steps: [
        { shot: 'ltr' },
        { set: '#stage', attr: 'dir', value: 'rtl' }, { shot: 'rtl' },
    ],
    expect(t) {
        const phone = t.viewport.name === 'phone', first = id => t.rect(`#${id} >>> [part=actions] > pk-button`);
        for (const id of ['l1', 'l2']) { t.visible(`#${id}`, `list ${id}`); t.inViewport(`#${id}`); }
        const a = first('l1'), b = first('l2');
        if (a && b) {
            t.ok(b.width <= 48, `actionsCollapse always: New order is icon-only (${Math.round(b.width)}px wide)`);
            t.ok(phone ? a.width <= 48 : a.width > 60, `default: ${phone ? 'icon-only on a phone' : 'icon and text on a large screen'} (${Math.round(a.width)}px wide)`);
        }
    },
};
