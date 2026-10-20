// pk-table-filters: the Filters trigger is a filter-icon button; on a phone only the icon shows (the word stays its name, the count stays as a badge), on desktop icon plus text (issue 1704).
export default {
    name: 'table-filters-trigger',
    issue: [1704],
    elements: ['table-filters'],
    html: `<div class="u-p-1r-1p25r"><pk-table-filters label="Search products" filter-count="2"><pk-select label="Category"><option>Accessories</option></pk-select></pk-table-filters></div>`,
    steps: [{ wait: 'settle' }, { shot: 'resting' }, { click: 'pk-table-filters >>> [part=trigger]' }, { wait: 'settle' }, { shot: 'open' }],
    expect(t) {
        const trig = t.rect('pk-table-filters >>> [part=trigger]'), icon = t.rect('pk-table-filters >>> [part=trigger-icon]'), label = t.rect('pk-table-filters >>> [part=trigger-label]'), badge = t.rect('pk-table-filters >>> [part=count]');
        if (!trig || !icon || !badge) return t.ok(false, 'the trigger, its icon and the count badge render');
        t.ok(icon.width > 8, 'the filter icon is drawn');
        if (t.viewport.name === 'phone') {
            t.ok((label?.width ?? 0) === 0, 'phone: the word is folded into the icon');
            t.ok(trig.width >= 44 && trig.height >= 44, `phone: the trigger is a ${Math.round(trig.width)}x${Math.round(trig.height)} touch target`);
        } else t.ok(label && label.width > 10, 'desktop: icon and the word "Filters" show together');
        t.inViewport('pk-table-filters >>> [part=trigger]');
    },
};
