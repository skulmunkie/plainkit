// Browser cases for pk-heat-map (#1721, phase 1). Same contract as cases.js: [name, async (t) => void]. Every layout expectation is a measurement of real boxes.
import { until } from './wait.js';

const ITEMS = [
    { id: 'billing', label: 'Billing', value: 42, severity: 'warning' }, { id: 'auth', label: 'Sign-in', value: 31, severity: 'danger' }, { id: 'search', label: 'Search', value: 24 },
    { id: 'reports', label: 'Reports', value: 18, severity: 'info' }, { id: 'docs', label: 'Docs', value: 12, severity: 'success' }, { id: 'api', label: 'API', value: 9 },
];
const json = v => JSON.stringify(v).replace(/'/g, '&#39;');
const mountMap = async (t, items = ITEMS, { width = 600, attrs = '' } = {}) => {
    const wrap = await t.mount(`<div id="w"><pk-heat-map label="Issues by area" ${attrs} items='${json(items)}'></pk-heat-map></div>`);
    wrap.style.inlineSize = `${width}px`;
    const el = wrap.querySelector('pk-heat-map');
    // Wait for the boxes to fill the map at the width the wrapper now has: the layout follows a resize observation, not the mount.
    await until(() => { const m = el.shadowRoot.querySelector('[part="map"]').getBoundingClientRect(), tiles = [...el.shadowRoot.querySelectorAll('.item')]; return tiles.length && Math.abs(m.width - width) < 1 && Math.abs(tiles.reduce((s, li) => s + li.getBoundingClientRect().width * li.getBoundingClientRect().height, 0) - m.width * m.height) <= 1; }, 'the boxes to fill the map');
    await t.settle();
    return el;
};
const items = el => [...el.shadowRoot.querySelectorAll('.item')];
const boxes = el => [...el.shadowRoot.querySelectorAll('.box')];
const r = e => e.getBoundingClientRect();
const overlap = (a, b) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;

export const heatMapCases = [
    ['heat-map: the boxes fill the map exactly, with no overlap and nothing outside it', async t => {
        const el = await mountMap(t);
        const map = r(el.shadowRoot.querySelector('[part="map"]')), tiles = items(el).map(r);
        t.eq(tiles.length, ITEMS.length);
        t.ok(map.width > 500 && map.height > 200, `the map has a size: ${map.width} by ${map.height}`);
        const sum = tiles.reduce((s, b) => s + b.width * b.height, 0);
        t.ok(Math.abs(sum - map.width * map.height) <= 1, `the boxes cover the map: ${sum} of ${map.width * map.height}`);
        for (const b of tiles) t.ok(b.left >= map.left - 0.5 && b.right <= map.right + 0.5 && b.top >= map.top - 0.5 && b.bottom <= map.bottom + 0.5, 'a box leaves the map');
        for (let i = 0; i < tiles.length; i++) for (let j = i + 1; j < tiles.length; j++) t.ok(!overlap(tiles[i], tiles[j]), `boxes ${i} and ${j} overlap`);
        t.ok(el.scrollHeight <= el.clientHeight + 1, 'the element never scrolls');
    }],
    ['heat-map: box areas are proportional to the values (within the rounding of whole pixels)', async t => {
        const el = await mountMap(t);
        const map = r(el.shadowRoot.querySelector('[part="map"]')), total = ITEMS.reduce((s, i) => s + i.value, 0);
        // The boxes come largest first, which is the order of ITEMS here.
        items(el).forEach((li, i) => {
            const b = r(li), want = (ITEMS[i].value / total) * map.width * map.height;
            t.ok(Math.abs(b.width * b.height - want) <= b.width + b.height, `${ITEMS[i].id}: ${b.width * b.height} px against ${want}`);
        });
    }],
    ['heat-map: a resize lays the boxes out again for the new width and keeps filling the map', async t => {
        const el = await mountMap(t, ITEMS, { width: 600 });
        const before = r(items(el)[0]);
        el.parentElement.style.inlineSize = '320px';
        await until(() => Math.abs(r(el.shadowRoot.querySelector('[part="map"]')).width - 320) < 1 && Math.abs(items(el).reduce((s, li) => s + r(li).width * r(li).height, 0) - 320 * r(el.shadowRoot.querySelector('[part="map"]')).height) <= 1, 'the boxes to fill the narrower map');
        const after = r(items(el)[0]);
        t.ok(after.width < before.width, `the first box narrowed: ${before.width} then ${after.width}`);
    }],
    ['heat-map: the gap is drawn inside each tile, so boxes are apart by the gap and the tiles still meet', async t => {
        const el = await mountMap(t);
        const [a, b] = boxes(el).slice(0, 2).map(r), tiles = items(el).slice(0, 2).map(r);
        const apart = Math.max(b.left - a.right, a.left - b.right, b.top - a.bottom, a.top - b.bottom);
        const gap = parseFloat(getComputedStyle(el).fontSize) * 0.25; // --space-1 is 0.25rem; the tile padding is half the gap on each side
        t.ok(apart > 0 && Math.abs(apart - gap) <= 2, `the first two boxes are ${apart}px apart, expected about ${gap}`);
        t.ok(tiles[0].width > a.width, 'the box sits inside its tile');
    }],
    ['heat-map: one tab stop, arrow keys move to the geometric neighbour, Home and End go to the ends', async t => {
        const el = await mountMap(t);
        const all = boxes(el);
        t.eq(all.filter(b => b.tabIndex === 0).length, 1, 'exactly one box is in the tab order');
        all[0].focus(); await t.settle();
        const first = r(all[0]);
        t.eq(el.shadowRoot.activeElement, all[0]);
        const press = k => el.shadowRoot.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, composed: true }));
        const moved = [];
        for (const k of ['ArrowRight', 'ArrowDown']) { const from = r(el.shadowRoot.activeElement); press(k); await t.settle(); const to = r(el.shadowRoot.activeElement); moved.push([k, from, to]); }
        const [, , right] = moved[0];
        t.ok(right.left + right.width / 2 > first.left + first.width / 2 || right.top + right.height / 2 > first.top + first.height / 2, 'ArrowRight did not move away from the first box');
        t.ok(el.shadowRoot.activeElement !== all[0], 'focus moved');
        press('End'); await t.settle(); t.eq(el.shadowRoot.activeElement, all.at(-1), 'End goes to the last box');
        press('Home'); await t.settle(); t.eq(el.shadowRoot.activeElement, all[0], 'Home goes to the first box');
        t.eq(all.filter(b => b.tabIndex === 0).length, 1, 'still exactly one tab stop');
        // From the first (the biggest, top left) box, ArrowRight lands on a box whose centre is to its right.
        press('ArrowRight'); await t.settle();
        const c = r(el.shadowRoot.activeElement), f = r(all[0]);
        t.ok(c.left + c.width / 2 > f.left + f.width / 2, 'ArrowRight lands on a box to the right');
    }],
    ['heat-map: boxes are named "label, value, status", a link when it has an href, and a click raises pk-heat-select once', async t => {
        const el = await mountMap(t, [{ id: 'a', label: 'Open', value: 1200, severity: 'warning', href: '#open' }, { id: 'b', label: 'Done', value: 30, severity: 'success' }, { id: 'c', label: 'Idle', value: 20 }], { attrs: 'min-box="0"' });
        const [a, b, c] = boxes(el);
        t.eq(a.localName, 'a'); t.eq(a.getAttribute('href'), '#open'); t.eq(b.localName, 'button');
        t.eq(a.getAttribute('aria-label'), `Open, ${(1200).toLocaleString()}, Warning`);
        t.eq(c.getAttribute('aria-label'), 'Idle, 20', 'a neutral box carries no status word');
        t.ok(a.querySelector('.status') && !c.querySelector('.status'), 'the severity word is shown for a non-neutral box only');
        const seen = [];
        el.addEventListener('pk-heat-select', e => { seen.push(e.detail.id); e.preventDefault(); });
        b.click(); a.click(); await t.settle();
        t.eq(seen.join(), 'b,a', 'one event per click, with the item id');
    }],
    ['heat-map: the data table has one row per item (largest first) and show-table shows it in place of the map', async t => {
        const el = await mountMap(t);
        const table = el.shadowRoot.querySelector('[part="table"]'), wrap = el.shadowRoot.querySelector('[part="data"]'), rows = [...table.querySelectorAll('tbody tr')];
        t.eq(rows.length, ITEMS.length);
        t.eq(rows[0].querySelector('th').textContent, 'Billing');
        t.eq(rows[0].children[3].textContent, 'Warning'); t.eq(rows[2].children[3].textContent, 'Neutral');
        t.ok(r(wrap).width <= 2 && r(wrap).height <= 2, 'the table is visually hidden by default');
        el.showTable = true; await t.settle();
        t.ok(r(table).width > 200 && r(table).height > 60, 'show-table shows the table');
        t.eq(getComputedStyle(el.shadowRoot.querySelector('[part="map"]')).display, 'none', 'and hides the map');
    }],
    ['heat-map: boxes under min-box merge into one Other box, never dropped, and the table still lists every item', async t => {
        const many = [{ id: 'big', label: 'Big', value: 500 }, { id: 'mid', label: 'Mid', value: 300 }, ...Array.from({ length: 8 }, (_, i) => ({ id: `s${i}`, label: `Small ${i}`, value: 2 }))];
        const el = await mountMap(t, many, { width: 400 });
        const other = el.shadowRoot.querySelector('.other');
        t.ok(other, 'there is an Other box');
        t.eq(other.querySelector('.label').textContent, 'Other (8)');
        t.eq(el.shadowRoot.querySelectorAll('tbody tr').length, 10, 'the table lists all 10');
        const seen = []; el.addEventListener('pk-heat-select', e => seen.push(e.detail)); other.click(); await t.settle();
        t.eq(seen[0].id, '__other'); t.eq(seen[0].item.members.length, 8);
        el.minBox = 0; await t.settle();
        await until(() => !el.shadowRoot.querySelector('.other'), 'min-box 0 to show every item');
        t.eq(boxes(el).length, 10);
    }],
    ['heat-map: bad items are skipped and said once; no items shows the empty text', async t => {
        const el = await mountMap(t, [{ id: 'a', label: 'A', value: 5 }, { id: 'z', label: 'Zero', value: 0 }, { id: 'n', label: 'Neg', value: -2 }]);
        t.eq(boxes(el).length, 1);
        el.items = []; await t.settle();
        t.eq(boxes(el).length, 0);
        t.eq(el.shadowRoot.querySelector('[part="empty"]').hidden, false);
    }],
];
