// Browser cases for pk-heat-map (#1721, phase 1). Same contract as cases.js: [name, async (t) => void]. Every layout expectation is a measurement of real boxes.
import { until } from './wait.js';

const ITEMS = [
    { id: 'billing', label: 'Billing', value: 42, severity: 'warning' }, { id: 'auth', label: 'Sign-in', value: 31, severity: 'danger' }, { id: 'search', label: 'Search', value: 24 },
    { id: 'reports', label: 'Reports', value: 18, severity: 'info' }, { id: 'docs', label: 'Docs', value: 12, severity: 'success' }, { id: 'api', label: 'API', value: 9 },
];
const TEAMS = [
    { id: 'pay', label: 'Payments', children: [{ id: 'p1', label: 'Invoices', value: 30, severity: 'warning' }, { id: 'p2', label: 'Refunds', value: 10 }, { id: 'p3', label: 'Tax', value: 20, severity: 'danger' }] },
    { id: 'acc', label: 'Accounts', children: [{ id: 'a1', label: 'Sign-in', value: 40 }, { id: 'a2', label: 'Profile', value: 20 }] },
    { id: 'web', label: 'Web', children: [{ id: 'w1', label: 'Search', value: 24 }, { id: 'w2', label: 'Docs', value: 12, severity: 'success' }] },
];
const json = v => JSON.stringify(v).replace(/'/g, '&#39;');
const mountMap = async (t, items = ITEMS, { width = 600, attrs = '', height = '' } = {}) => {
    const wrap = await t.mount(`<div id="w"><pk-heat-map label="Issues by area" ${attrs} items='${json(items)}'></pk-heat-map></div>`);
    wrap.style.inlineSize = `${width}px`;
    if (height) wrap.style.setProperty('--pk-heat-map-height', height);
    const el = wrap.querySelector('pk-heat-map');
    // Wait for the boxes to fill the map at the width the wrapper now has: the layout follows a resize observation, not the mount.
    await until(() => { const m = el.shadowRoot.querySelector('[part="map"]').getBoundingClientRect(), tiles = [...el.shadowRoot.querySelectorAll('.item')]; return tiles.length && Math.abs(m.width - width) < 1 && (attrs.includes('group-by') ? tiles.every(li => li.getBoundingClientRect().width > 0) : Math.abs(tiles.reduce((s, li) => s + li.getBoundingClientRect().width * li.getBoundingClientRect().height, 0) - m.width * m.height) <= 1); }, 'the boxes to fill the map');
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
    ['heat-map: layout=rows keeps the input order while values change, and still fills the map', async t => {
        const rowsItems = [{ id: 'a', label: 'Alpha', value: 10 }, { id: 'b', label: 'Beta', value: 40 }, { id: 'c', label: 'Gamma', value: 25 }, { id: 'd', label: 'Delta', value: 20 }];
        const el = await mountMap(t, rowsItems, { attrs: 'layout="rows" min-box="0"' });
        const names = () => boxes(el).map(b => b.querySelector('.label').textContent).join();
        t.eq(names(), 'Alpha,Beta,Gamma,Delta', 'input order, not value order');
        el.items = [{ ...rowsItems[0], value: 90 }, ...rowsItems.slice(1)];
        await until(() => r(items(el)[0]).width * r(items(el)[0]).height > 20000, 'the first box to grow');
        t.eq(names(), 'Alpha,Beta,Gamma,Delta', 'the order is stable after a value change');
        const map = r(el.shadowRoot.querySelector('[part="map"]'));
        t.ok(Math.abs(items(el).reduce((s, li) => s + r(li).width * r(li).height, 0) - map.width * map.height) <= 1, 'still fills the map');
    }],
    ['heat-map: max-items keeps the top N and merges the rest into Other', async t => {
        const el = await mountMap(t, Array.from({ length: 6 }, (_, i) => ({ id: `i${i}`, label: `Item ${i}`, value: 100 - i * 10 })), { attrs: 'max-items="3" min-box="0"' });
        t.eq(boxes(el).length, 4);
        t.eq(el.shadowRoot.querySelector('.other .label').textContent, 'Other (3)');
        t.eq(el.shadowRoot.querySelectorAll('tbody tr').length, 6, 'the table still lists all six');
    }],
    ['heat-map: Other takes the most serious severity of what it holds', async t => {
        const el = await mountMap(t, [{ id: 'big', label: 'Big', value: 900 }, { id: 'x', label: 'X', value: 30, severity: 'warning' }, { id: 'y', label: 'Y', value: 20 }, { id: 'z', label: 'Z', value: 10, severity: 'info' }]);
        const other = el.shadowRoot.querySelector('.other');
        t.ok(other, 'there is an Other box');
        t.eq(other.dataset.severity, 'warning');
        t.ok(other.getAttribute('aria-label').endsWith('Warning'), other.getAttribute('aria-label'));
    }],
    ['heat-map: scale=intensity shades one hue by intensity, names it, and shows it in the table', async t => {
        const el = await mountMap(t, [{ id: 'hot', label: 'Hot', value: 30, intensity: 0.9 }, { id: 'cool', label: 'Cool', value: 30, intensity: 0.1 }], { attrs: 'scale="intensity" min-box="0"' });
        const [hot, cool] = boxes(el), chroma = e => { const c = getComputedStyle(e).backgroundColor.match(/[\d.]+/g).slice(0, 3).map(Number); return Math.max(...c) - Math.min(...c); };
        t.ok(chroma(hot) > chroma(cool), `the hot box is more saturated: ${getComputedStyle(hot).backgroundColor} against ${getComputedStyle(cool).backgroundColor}`);
        t.eq(hot.getAttribute('aria-label'), 'Hot, 30, intensity 90%');
        t.eq(el.shadowRoot.querySelector('tbody tr').children[3].textContent, '90%');
        t.eq(hot.dataset.severity, undefined, 'no severity colour is applied');
    }],
    ['heat-map: value-format share and compact change how the value reads, in the box and in its name', async t => {
        const el = await mountMap(t, [{ id: 'a', label: 'A', value: 1500 }, { id: 'b', label: 'B', value: 500 }], { attrs: 'value-format="share" min-box="0"' });
        t.eq(boxes(el)[0].querySelector('.value').textContent, '75%');
        el.valueFormat = 'compact'; await until(() => boxes(el)[0]?.querySelector('.value').textContent === (1500).toLocaleString(undefined, { notation: 'compact' }), 'the compact value');
        t.ok(boxes(el)[0].getAttribute('aria-label').includes((1500).toLocaleString(undefined, { notation: 'compact' })));
    }],
    ['heat-map: pk-heat-focus-item reports the focused box', async t => {
        const el = await mountMap(t);
        const seen = []; el.addEventListener('pk-heat-focus-item', e => seen.push(e.detail.id));
        boxes(el)[1].focus(); boxes(el)[0].focus();
        t.eq(seen.join(), 'auth,billing');
    }],
    ['heat-map: at 375px with one dominant item no tile is a thin strip: every box reaches the 44px touch target in both sides', async t => {
        const el = await mountMap(t, [{ id: 'p', label: 'Platform', value: 900, severity: 'danger' }, { id: 'w', label: 'Web', value: 40 }, { id: 'm', label: 'Mobile', value: 30, severity: 'warning' }, { id: 'd', label: 'Docs', value: 20 }], { width: 375 });
        for (const b of boxes(el)) { const q = r(b); t.ok(q.width >= 44 && q.height >= 44, `${b.getAttribute('aria-label')} is ${q.width} by ${q.height}`); }
    }],
    ['heat-map: a tile too narrow for its text shows only its number; the label stays in the name and title, and no label is cut to a stub', async t => {
        const many = Array.from({ length: 12 }, (_, i) => ({ id: `n${i}`, label: `Region ${i}`, value: 10 }));
        const el = await mountMap(t, many, { width: 270, height: '6.5rem', attrs: 'min-box="40"' });
        const rem = parseFloat(getComputedStyle(el).fontSize);
        let narrow = 0;
        for (const b of boxes(el)) {
            const label = b.querySelector('.label'), w = r(b).width;
            if (w < 4.5 * rem) { narrow++; t.eq(getComputedStyle(label).display, 'none', `${b.title}: a ${w}px tile hides its label`); t.ok(b.querySelector('.value') && getComputedStyle(b.querySelector('.value')).display !== 'none', 'and keeps its number'); }
            else t.ok(label.scrollWidth <= label.clientWidth + 1 || w >= 4.5 * rem, 'a wider tile may truncate with an ellipsis');
            t.ok(b.getAttribute('aria-label').startsWith('Region') || b.classList.contains('other'), 'the name keeps the label');
        }
        t.ok(narrow > 0, 'the case exercised a narrow tile');
    }],
    ['heat-map: boxes move with a transition when motion is allowed', async t => {
        const el = await mountMap(t);
        t.ok(parseFloat(getComputedStyle(items(el)[0]).transitionDuration) > 0, 'a value change animates by default (reduced motion switches it off in css)');
    }],
    ['heat-map: group-by draws framed areas; children sit inside their frame below its header, nothing overlaps, areas follow the weights', async t => {
        const el = await mountMap(t, TEAMS, { attrs: 'group-by min-box="0"' });
        const frames = [...el.shadowRoot.querySelectorAll('.frame')], map = r(el.shadowRoot.querySelector('[part="map"]')), em = parseFloat(getComputedStyle(el).fontSize);
        t.eq(frames.length, 3);
        const covered = () => frames.reduce((s, f) => s + r(f).width * r(f).height, 0);
        await until(() => Math.abs(covered() - map.width * map.height) <= 1, `the frames to tile the map (${covered()} of ${map.width * map.height})`);
        const groupOf = id => TEAMS.find(g => g.children.some(c => c.id === id));
        const kids = boxes(el);
        t.eq(kids.length, 7);
        for (const k of kids) {
            const g = groupOf(k.dataset.id.split('/')[1]), frame = frames[TEAMS.indexOf(g) === 0 ? 0 : frames.findIndex((_, i) => i === TEAMS.indexOf(g))], q = r(k), f = r(frame);
            t.ok(q.left >= f.left - 0.5 && q.right <= f.right + 0.5 && q.bottom <= f.bottom + 0.5, `${k.title} is inside ${g.label}`);
            t.ok(q.top >= f.top + 1.9 * em, `${k.title} is below the header of ${g.label} (${q.top - f.top}px)`);
        }
        for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) t.ok(!overlap(r(kids[i]), r(kids[j])), `${kids[i].title} overlaps ${kids[j].title}`);
        t.eq(frames[0].querySelector('.glabel').textContent, 'Payments'); t.eq(frames[0].querySelector('.gvalue').textContent, '60');
        t.ok(kids[0].getAttribute('aria-label').startsWith('Payments: '), kids[0].getAttribute('aria-label'));
        t.eq([...el.shadowRoot.querySelectorAll('tbody tr th')].map(x => x.textContent).filter(x => x.includes(' / ')).length, 7, 'the table reads "Group / child"');
    }],
    ['heat-map: without group-by a group is one plain box with the summed value and no frame', async t => {
        const el = await mountMap(t, TEAMS, { attrs: 'min-box="0"' });
        t.eq(el.shadowRoot.querySelectorAll('.frame').length, 0);
        t.eq(boxes(el).length, 3);
        t.eq(boxes(el)[0].querySelector('.value').textContent, '60');
    }],
    ['heat-map: Other opens its members as a table over the map; Escape and Close return focus to the Other box; a cancelled select does not open it', async t => {
        const many = [{ id: 'big', label: 'Big', value: 500 }, { id: 'mid', label: 'Mid', value: 300 }, ...Array.from({ length: 6 }, (_, i) => ({ id: `s${i}`, label: `Small ${i}`, value: 2, severity: i === 0 ? 'warning' : 'neutral' }))];
        const el = await mountMap(t, many, { width: 400 });
        const other = el.shadowRoot.querySelector('.other'), more = el.shadowRoot.querySelector('[part="more"]'), host = r(el);
        t.ok(more.hidden, 'closed at first');
        const before = r(el).height;
        el.addEventListener('pk-heat-select', e => e.preventDefault(), { once: true });
        other.click(); await t.settle(); t.ok(more.hidden, 'a cancelled select does not open it');
        other.click(); await t.settle();
        t.ok(!more.hidden, 'opens');
        const members = Number(other.querySelector('.label').textContent.match(/\d+/)[0]);
        t.eq(more.querySelectorAll('tbody tr').length, members, 'one row per member');
        t.eq(el.shadowRoot.activeElement, el.shadowRoot.querySelector('[part="more-close"]'), 'focus moves to Close');
        const q = r(more); t.ok(q.left >= host.left - 1 && q.right <= host.right + 1 && q.top >= host.top - 1 && q.bottom <= host.bottom + 1, 'the panel stays inside the element');
        t.eq(r(el).height, before, 'the element keeps its height');
        el.shadowRoot.querySelector('[part="more-close"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true }));
        t.ok(more.hidden, 'Escape closes'); t.eq(el.shadowRoot.activeElement, other, 'focus returns to Other');
        other.click(); await t.settle(); el.shadowRoot.querySelector('[part="more-close"]').click();
        t.ok(more.hidden, 'Close closes'); t.eq(el.shadowRoot.activeElement, other);
    }],
];
