// Tests for the data table logic (sorting, filtering, selection, paging). Run: node --test sdk
import test from 'node:test';
import assert from 'node:assert/strict';
import { sortKey, sortRows, filterRows } from './table.js';

test('sortKey reads numbers through currency, dates, and folds text', () => {
    assert.equal(sortKey('$1,204.50', 'number'), 1204.5);
    assert.equal(sortKey(7, 'number'), 7);
    assert.equal(sortKey('n/a', 'number'), Number.NEGATIVE_INFINITY);
    assert.ok(sortKey('2026-01-07', 'date') < sortKey('2026-03-01', 'date'));
    assert.equal(sortKey('Alpha', 'text'), 'alpha');
    assert.equal(sortKey(null), '');
});

const rows = [{ id: 1, t: 'b', p: '$10' }, { id: 2, t: 'a', p: '$2' }, { id: 3, t: 'c', p: '$5' }];

test('sortRows sorts by a typed column without touching the input', () => {
    assert.deepEqual(sortRows(rows, { key: 'p', type: 'number' }).map(r => r.id), [2, 3, 1]);
    assert.deepEqual(sortRows(rows, { key: 't' }, 'descending').map(r => r.id), [3, 1, 2]);
    assert.deepEqual(rows.map(r => r.id), [1, 2, 3]);
    assert.deepEqual(sortRows(rows, null).map(r => r.id), [1, 2, 3]);
});

test('filterRows needs every active filter to match and ignores empty ones', () => {
    assert.deepEqual(filterRows(rows, { t: 'A' }).map(r => r.id), [2]);
    assert.deepEqual(filterRows(rows, { t: '', p: '$' }).map(r => r.id), [1, 2, 3]);
    assert.deepEqual(filterRows(rows, { t: 'a', p: '$10' }).map(r => r.id), []);
    assert.deepEqual(filterRows(rows, undefined).length, 3);
});


test('sortRows is stable, numeric-aware for text, and reverses', () => {
    const r = [{ id: 1, t: 'item 10' }, { id: 2, t: 'item 2' }, { id: 3, t: 'item 2' }];
    assert.deepEqual(sortRows(r, { key: 't' }).map(x => x.id), [2, 3, 1]);
    assert.deepEqual(sortRows(r, { key: 't' }, 'descending').map(x => x.id), [1, 2, 3]);
});

// ---- expandable rows (js/table-expand.js, loaded by the table only when `expandable` is set) and the empty / loading text

globalThis.HTMLElement ??= class {};
const X = await import('../../js/table-expand.js');

// A tiny stand-in for the table's element builder: nodes are plain objects.
const h = (tag, attrs = {}, ...kids) => ({ tag, attrs, kids, children: kids.filter(k => k && k.tag), insertBefore(n, ref) { const i = ref ? this.children.indexOf(ref) : this.children.length; this.children.splice(i, 0, n); } });
const table = (extra = {}) => ({ children: [{ slot: 'detail-2' }, { slot: 'cell-1-a' }], expanded: [], selectable: false, ...extra });

test('toggled adds or removes one id, as strings, and never twice', () => {
    assert.deepEqual(X.toggled([], '2', true), ['2']);
    assert.deepEqual(X.toggled([1, '2'], '2', false), ['1']);
    assert.deepEqual(X.toggled(['2'], '2', true), ['2']);
});

test('only a row the host gave detail content can expand', () => {
    assert.equal(X.hasDetail(table(), '2'), true);
    assert.equal(X.hasDetail(table(), '1'), false);
});

test('an expandable row gets a toggle with aria-expanded and aria-controls pointing at its detail row, which shows the row\'s slot', () => {
    const t = table({ expanded: [2] });
    const [tr, detail] = X.rows(t, h('tr'), '2', 0, 3, h);
    const btn = tr.children[0].kids[0];
    assert.equal(btn.attrs['aria-expanded'], 'true');
    assert.equal(btn.attrs['aria-controls'], detail.attrs.id);
    assert.equal(detail.attrs.hidden, false);
    assert.equal(detail.kids[0].kids[0].attrs.name, 'detail-2');
    assert.equal(detail.kids[0].attrs.colspan, 3);
    const [, closed] = X.rows(table(), h('tr'), '2', 1, 3, h);
    assert.equal(closed.attrs.hidden, true);
});

test('a row without detail content has an empty toggle cell and no detail row, and the toggle goes after the checkbox cell', () => {
    const rowsOf = X.rows(table(), h('tr'), '1', 0, 3, h);
    assert.equal(rowsOf.length, 1);
    assert.equal(rowsOf[0].children[0].kids[0], '');
    const check = h('td'), tr = h('tr', {}, check);
    X.rows(table({ selectable: true }), tr, '1', 0, 3, h);
    assert.equal(tr.children[0], check);
    assert.equal(tr.children[1].attrs['data-expand'], true);
});

test('activating a toggle changes expanded and raises pk-row-expand with { id, index, expanded }', () => {
    const events = [];
    const t = table({ expanded: [], ids: () => ['1', '2'], emit: (n, d) => events.push([n, d]) });
    const btn = { dataset: { expandId: '2' }, getAttribute: () => 'false' };
    assert.equal(X.click(t, { target: { closest: () => btn } }), true);
    assert.deepEqual(t.expanded, ['2']);
    assert.deepEqual(events, [['pk-row-expand', { id: '2', index: 1, expanded: true }]]);
    const open = { dataset: { expandId: '2' }, getAttribute: () => 'true' };
    X.click(t, { target: { closest: () => open } });
    assert.deepEqual(t.expanded, []);
    assert.equal(events[1][1].expanded, false);
    assert.equal(X.click(t, { target: { closest: () => null } }), false);
});

test('a click on slotted cell content raises pk-row-click by the composed path; slotted controls and shadow clicks do not', () => {
    const events = [], row = { matches: s => s === 'tbody tr[data-pk-context]', dataset: { pkContext: '2' } };
    const t = table({ clickable: true, shadowRoot: { contains: () => false }, ids: () => ['1', '2'], view: [{ a: 1 }, { a: 2 }], emit: (n, d) => events.push([n, d]) });
    const node = m => ({ matches: s => s.split(',').includes(m) });
    const at = (path, tt = t) => X.click(tt, { target: {}, composedPath: () => path });
    assert.equal(at([node('zzz'), row]), true);
    assert.deepEqual(events, [['pk-row-click', { id: '2', row: { a: 2 } }]]);
    assert.equal(at([node('button'), node('zzz'), row]), true); assert.equal(events.length, 1, 'a slotted button keeps its click');
    assert.equal(at([node('a'), row]), true); assert.equal(events.length, 1, 'a slotted link keeps its click');
    assert.equal(at([node('zzz'), row], { ...t, clickable: false }), false); assert.equal(events.length, 1, 'not clickable');
    assert.equal(at([node('zzz'), row], { ...t, shadowRoot: { contains: () => true } }), false, 'inside the shadow tree the table handles it');
    assert.equal(at([node('zzz')]), false, 'no row in the path');
});

test('the empty state has a text prop, and the table detail slots are listed in the meta', async () => {
    const { readFileSync } = await import('node:fs');
    const meta = JSON.parse(readFileSync(new URL('./table.meta.json', import.meta.url), 'utf8'));
    assert.equal(meta.props.find(p => p.name === 'emptyText').default, 'No rows');
    assert.deepEqual(meta.slots.filter(s => s.dynamic).map(s => s.name), ['cell-<rowId>-<key>', 'detail-<rowId>']);
    assert.ok(meta.events.some(e => e.name === 'pk-row-expand'));
});

// ---- sort cycle (js/table-data.js), one pk-select per checkbox click, keyboard activation of clickable rows

const { nextSort } = await import('../../js/table-data.js');

test('the same header cycles ascending, descending, cleared; another header starts ascending', () => {
    assert.deepEqual(nextSort('', 'ascending', 'a'), ['a', 'ascending']);
    assert.deepEqual(nextSort('a', 'ascending', 'a'), ['a', 'descending']);
    assert.deepEqual(nextSort('a', 'descending', 'a'), [null, null]);
    assert.deepEqual(nextSort('a', 'descending', 'b'), ['b', 'ascending']);
    assert.deepEqual(sortRows(rows, undefined, 'ascending').map(r => r.id), [1, 2, 3], 'a cleared sort is the natural order');
});

// The element's own methods, run against a stand-in host: no DOM needed.
const Table = (await import('./table.js')).default(class {});
const host = extra => { const events = []; return Object.assign(Object.create(Table.prototype), { events, selected: [], rowKey: 'id', manual: true, rows, columns: [], sort: 'a', sortDir: 'descending', emit(name, detail) { events.push([name, detail]); return true; } }, extra); };
const box = (data, checked) => ({ target: { dataset: data, checked } });

test('a checkbox click raises change and input, and pk-select is raised once', () => {
    const t = host();
    for (const type of ['input', 'change']) t.input({ type, ...box({ select: '2' }, true) });
    assert.deepEqual(t.events, [['pk-select', { selected: ['2'] }]]);
    const all = host();
    for (const type of ['input', 'change']) all.input({ type, ...box({ selectAll: '' }, true) });
    assert.equal(all.events.length, 1);
    assert.deepEqual(all.events[0][1].selected, ['1', '2', '3']);
});

test('sorting cleared through the header reports a null key and direction, also when the host owns the rows (manual)', () => {
    const t = host();
    t.sortBy(null, null);
    assert.deepEqual(t.events, [['pk-sort', { key: null, direction: null }]]);
    assert.equal(t.sort, '');
    assert.equal(t.sortDir, 'ascending');
    const c = host({ emit() { return false; } });
    c.sortBy(null, null);
    assert.equal(c.sort, 'a', 'a cancelled event keeps the sort');
});

test('Enter and Space on the row itself activate a clickable row; keys on controls inside it do not', () => {
    const row = { matches: s => s === 'tbody tr[data-clickable]' }, cell = { matches: () => false };
    for (const key of ['Enter', ' ']) assert.equal(X.activates({ key, target: row }, { clickable: true }), true);
    assert.equal(X.activates({ key: 'Enter', target: cell }, { clickable: true }), false);
    assert.equal(X.activates({ key: 'a', target: row }, { clickable: true }), false);
    assert.equal(X.activates({ key: 'Enter', target: row }, { clickable: false }), false);
});

// ---- windowing (js/table-vw.js, issue 131): THRESHOLD is one named constant, loaded by table.js only once a table needs it.
// view() memoizes so a scroll-driven re-render does not re-sort every frame; body() draws only the rows near the scroll position, with
// spacer rows standing in for the ones it skips.

const { default: V, THRESHOLD } = await import('../../js/table-vw.js');
const hv = (tag, attrs = {}, ...kids) => ({ tag, attrs, kids, style: { setProperty(k, v) { attrs[k] = v; } } });
// No DOM (and no CSS global) in a node:test run: a small real escaper, not a passthrough, so a test that puts a quote in a
// row key actually exercises the escaping table-vw.js/table.js rely on (issue 640).
globalThis.CSS ??= { escape: s => String(s).replace(/["\\]/g, '\\$&') };

test('THRESHOLD is one named constant, not a magic number scattered across the source', () => {
    assert.equal(THRESHOLD, 500);
});

test('view() memoizes the table\'s sorted/filtered rows: unchanged inputs skip the underlying getter, a changed one recomputes', () => {
    let calls = 0;
    const el = { rows, columns: [{ key: 't' }], filters: {}, sort: 't', sortDir: 'ascending', get view() { calls++; return sortRows(filterRows(this.rows, this.filters), this.columns.find(c => c.key === this.sort), this.sortDir); } };
    const a = V.view(el), b = V.view(el);
    assert.equal(a, b, 'same rows/columns/filters/sort: the cached array, not a call to the getter');
    assert.equal(calls, 1);
    el.rows = rows.slice();
    const c = V.view(el);
    assert.equal(calls, 2, 'a new rows reference invalidates the cache');
    assert.deepEqual(c.map(r => r.id), [2, 1, 3], 'still correctly sorted after the cache miss');
});

test('body() draws only the rows near the scroll position, flanked by spacer rows sized for the ones it skips', () => {
    const total = THRESHOLD + 100, data = Array.from({ length: total }, (_, i) => ({ id: i + 1 }));
    const el = { rowKey: 'id', clickable: false, selectable: false, currentRow: '', selected: [], expandable: false, columns: [{ key: 'id' }], list: n => el[n], $rowH: 20, part: n => (n === 'scroll' ? { scrollTop: 1000, clientHeight: 100, addEventListener() {} } : { querySelector: () => null }), querySelector: () => null };
    const out = V.body(el, data, hv);
    assert.equal(out[0].attrs['data-spacer'], 'top');
    assert.equal(out.at(-1).attrs['data-spacer'], 'bottom');
    const drawn = out.slice(1, -1);
    assert.equal(drawn.length, 25, '(scrollTop / rowH - overscan) to (+ viewport rows + 2 * overscan)');
    assert.equal(drawn[0].attrs['data-pk-context'], '41', 'the first drawn row is the one at the start of the window, not the top of the data');
    assert.equal(out[0].kids[0].attrs['block-size'], '800px', '40 skipped rows above, at 20px each');
    assert.equal(out.at(-1).kids[0].attrs['block-size'], `${(total - 65) * 20}px`, 'the rest of the rows below');
    assert.equal(el.$virtual, true);
});

test('body() returns null (table.js then draws every row itself) under THRESHOLD, and always for an expandable table', () => {
    const small = Array.from({ length: 10 }, (_, i) => ({ id: i + 1 }));
    const big = Array.from({ length: THRESHOLD + 100 }, (_, i) => ({ id: i + 1 }));
    const base = { rowKey: 'id', selected: [], columns: [], list: () => [], part: () => ({ querySelector: () => null }), querySelector: () => null };
    assert.equal(V.body({ ...base, expandable: false }, small, hv), null, 'under the threshold');
    assert.equal(V.body({ ...base, expandable: true }, big, hv), null, 'expandable never windows, however many rows');
});

// A stand-in for a real querySelector's strictness: `[slot="..."]` only parses when the quoted value is either free of
// quotes/backslashes or properly backslash-escaped (what CSS.escape produces); an unescaped `"` in the value is exactly the
// syntax error issue 640 crashed on, so this throws where a browser would too.
const strictQuerySelector = selector => {
    let i = 0;
    while ((i = selector.indexOf('="', i)) !== -1) {
        i += 2;
        const start = i;
        while (i < selector.length && selector[i] !== '"') i += selector[i] === '\\' ? 2 : 1;
        if (i >= selector.length) throw new SyntaxError(`'${selector}' is not a valid selector`); // the quoted value never closes
        if (selector[i + 1] !== ']') throw new SyntaxError(`'${selector}' is not a valid selector`); // an unescaped quote closed the value early
        i++;
    }
    return null;
};

test('issue 640: a row key containing a double quote does not crash body()\'s slot-name querySelector (windowed path)', () => {
    const total = THRESHOLD + 10;
    const data = Array.from({ length: total }, (_, i) => (i === 40 ? { id: 'warn|[browser:compat] "quoted" message {"a":1}' } : { id: i + 1 }));
    const el = { rowKey: 'id', clickable: false, selectable: false, currentRow: '', selected: [], expandable: false, columns: [{ key: 'id' }], list: n => el[n], $rowH: 20, part: n => (n === 'scroll' ? { scrollTop: 1000, clientHeight: 100, addEventListener() {} } : { querySelector: strictQuerySelector }), querySelector: strictQuerySelector };
    let out;
    assert.doesNotThrow(() => { out = V.body(el, data, hv); }, 'CSS.escape keeps the selector valid however the row key is spelled');
    const drawn = out.slice(1, -1);
    assert.equal(drawn[0].attrs['data-pk-context'], 'warn|[browser:compat] "quoted" message {"a":1}');
});

test('currentRow marks one row with aria-current and a tint and is a host-set string', async () => {
    const { readFileSync } = await import('node:fs');
    const meta = JSON.parse(readFileSync(new URL('./table.meta.json', import.meta.url), 'utf8'));
    const p = meta.props.find(x => x.name === 'currentRow');
    assert.deepEqual([p.type, p.default, p.reflect], ['string', '', true]);
    assert.match(readFileSync(new URL('./table.js', import.meta.url), 'utf8'), /'aria-current': this\.currentRow && this\.currentRow === id \? 'true' : null/);
    assert.match(readFileSync(new URL('./table.css', import.meta.url), 'utf8'), /tr\[aria-current\]/);
});

// ---- inline cell editing (js/table-edit.js, loaded by the table only when `editable` is set)

const E = await import('../../js/table-edit.js');

test('check reports what breaks a column\'s rules and nothing else', () => {
    assert.equal(E.check({ required: true }, '  '), 'Required');
    assert.equal(E.check({}, ''), '');
    assert.equal(E.check({ editor: 'number' }, 'lots'), 'Enter a number');
    assert.equal(E.check({ editor: 'number', min: 0 }, '-1'), 'At least 0');
    assert.equal(E.check({ editor: 'number', max: 9 }, '10'), 'At most 9');
    assert.equal(E.check({ editor: 'number', min: 0, max: 9 }, '4.5'), '');
    assert.equal(E.check({ editor: 'number' }, ''), '', 'an empty optional number is fine');
    assert.equal(E.check({ maxLength: 3 }, 'abcd'), 'At most 3 characters');
});

test('typed gives a number column a number (or null), the rest the text', () => {
    assert.equal(E.typed({ editor: 'number' }, '4.5'), 4.5);
    assert.equal(E.typed({ editor: 'number' }, ' '), null);
    assert.equal(E.typed({ editor: 'text' }, 'abc'), 'abc');
});

test('the edit props and the pk-cell-edit event are in the meta, and an editable table never windows', async () => {
    const { readFileSync } = await import('node:fs');
    const meta = JSON.parse(readFileSync(new URL('./table.meta.json', import.meta.url), 'utf8'));
    assert.equal(meta.props.find(p => p.name === 'editable').default, false);
    assert.ok(meta.props.some(p => p.name === 'cellErrors'));
    const ev = meta.events.find(e => e.name === 'pk-cell-edit');
    assert.equal(ev.cancelable, true);
    assert.deepEqual(Object.keys(ev.detail), ['id', 'index', 'row', 'key', 'value', 'previous']);
    assert.match(readFileSync(new URL('../../js/table-vw.js', import.meta.url), 'utf8'), /if \(el\.expandable \|\| el\.editable \|\|/);
});
