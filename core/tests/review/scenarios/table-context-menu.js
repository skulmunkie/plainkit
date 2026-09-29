// pk-table row context menu (issue #586): a still gallery example cannot show an open overlay, so this scenario wraps the table in a pk-context-menu and wires
// it with js/context-actions.js's wireContextMenu(), the shared { action, label, shortcut?, disabled?, danger? } contract. Two ways in: a right click (mouse) and
// the keyboard equivalent pk-context-menu already gives every trigger, Shift+F10 or the Menu key, from a focused cell inside the row.
import { wireContextMenu } from '../../../js/context-actions.js';

const cols = '[{"key":"sku","label":"SKU"},{"key":"stock","label":"Stock","type":"number"}]';
const rows = '[{"id":1,"sku":"AC-001","stock":12},{"id":2,"sku":"AC-002","stock":0},{"id":3,"sku":"AC-003","stock":5}]';

export default {
    name: 'table-context-menu',
    elements: ['table', 'context-menu', 'menu-item'],
    html: `<div class="u-p-1r-1p25r"><pk-context-menu id="menu"><pk-table id="t1" label="Products" selectable columns='${cols}' rows='${rows}'></pk-table></pk-context-menu></div>`,
    setup(frame) {
        const menu = frame.querySelector('#menu'), table = frame.querySelector('#t1');
        // The same run(action) a toolbar button or a keyboard shortcut would call: here, the table's own selection.
        const run = (action, id) => {
            if (!id) return;
            const on = new Set(table.selected.map(String));
            if (action === 'select') on.add(id); else if (action === 'deselect') on.delete(id);
            table.selected = [...on];
        };
        wireContextMenu(menu, {
            items: id => id ? [
                { action: 'select', label: 'Select row', disabled: table.selected.map(String).includes(id) },
                { action: 'deselect', label: 'Deselect row', disabled: !table.selected.map(String).includes(id) },
            ] : [],
            run,
        });
    },
    steps: [
        { shot: 'closed' },
        { focus: '#t1 >>> tbody tr[data-pk-context="2"] [data-select]' }, { key: 'ContextMenu' }, { wait: 200 }, { shot: 'open-keyboard' },
        { key: 'Escape' }, { wait: 100 },
    ],
    expect(t) {
        const menu = '#menu >>> [part=menu]';
        if (t.shot === 'closed') { t.hidden(menu, 'the menu while nothing was right-clicked'); return; }
        t.visible(menu, 'the open row context menu');
        t.inViewport(menu); // a context menu opens at the row it targets, so it is expected to sit over the table below the cursor: no noOverlap check against #t1
        const items = ['#menu > pk-menu-item:nth-of-type(1)', '#menu > pk-menu-item:nth-of-type(2)'];
        for (const sel of items) { t.visible(sel); t.within(sel, menu); t.atLeast(sel, 'height', t.viewport.name === 'phone' ? 40 : 28); }
        t.hasText(items[0], 'Select row'); t.hasText(items[1], 'Deselect row');
        t.ok(t.attr(items[0], 'disabled') === null, 'row 2 starts unselected: Select row is enabled');
        t.ok(t.attr(items[1], 'disabled') !== null, 'Deselect row is disabled while the row is not selected');
    },
};
