// Browser cases for the layout primitives (pk-cluster, pk-stack, pk-grid). Same contract as cases.js: [name, async (t) => void].
// Sizes are set through CSSOM (the strict CSP forbids style attributes in markup).
const px = v => parseFloat(v);
const size = (el, w, h = 20) => { el.style.inlineSize = `${w}px`; el.style.blockSize = `${h}px`; };
const token = (el, name) => { const p = document.createElement('div'); p.style.inlineSize = `var(${name})`; el.append(p); const v = getComputedStyle(p).inlineSize; p.remove(); return v; };
const rem = n => n * px(getComputedStyle(document.documentElement).fontSize);
// The stage host is a plain block: give it a width, mount the layout inside, size the children.
async function layout(t, tag, attrs, count, width, childWidth) {
    const host = t.stage(`<${tag} ${attrs}>${'<div></div>'.repeat(count)}</${tag}>`);
    host.style.inlineSize = `${width}px`;
    await t.load(host);
    const el = host.firstElementChild;
    for (const c of el.children) { c.style.blockSize = '20px'; if (childWidth) c.style.inlineSize = `${childWidth}px`; }
    await t.settle();
    return el;
}
const tops = el => new Set([...el.children].map(c => Math.round(c.getBoundingClientRect().top)));
const lefts = el => [...el.children].map(c => Math.round(c.getBoundingClientRect().left));

export const layoutCases = [
    ['cluster: a horizontal row wraps at the container edge, nowrap keeps one line, and the gap is the default token', async t => {
        const el = await layout(t, 'pk-cluster', '', 4, 200, 80);
        t.eq(el.direction, 'horizontal'); t.eq(el.gap, 'sm');
        t.eq(getComputedStyle(el).display, 'flex'); t.eq(getComputedStyle(el).flexWrap, 'wrap');
        t.ok(tops(el).size > 1, 'four 80px items wrap inside 200px');
        t.eq(px(getComputedStyle(el).columnGap), px(token(el, '--space-2')), 'default gap is --space-2');
        el.nowrap = true; await t.settle();
        t.eq(getComputedStyle(el).flexWrap, 'nowrap'); t.eq(tops(el).size, 1, 'one line');
    }],

    ['cluster: every gap value maps to its spacing token, and align, justify and vertical map to the flex properties', async t => {
        const el = await layout(t, 'pk-cluster', '', 2, 400, 40);
        for (const [g, tok] of [['none', null], ['xs', '--space-1'], ['sm', '--space-2'], ['md', '--space-4'], ['lg', '--space-6'], ['xl', '--space-8']]) {
            el.gap = g; await t.settle();
            t.eq(px(getComputedStyle(el).columnGap), tok ? px(token(el, tok)) : 0, `gap ${g}`);
        }
        for (const [a, css] of [['start', 'flex-start'], ['center', 'center'], ['end', 'flex-end'], ['stretch', 'stretch']]) { el.align = a; await t.settle(); t.eq(getComputedStyle(el).alignItems, css, `align ${a}`); }
        for (const [j, css] of [['start', 'flex-start'], ['center', 'center'], ['end', 'flex-end'], ['between', 'space-between']]) { el.justify = j; await t.settle(); t.eq(getComputedStyle(el).justifyContent, css, `justify ${j}`); }
        el.direction = 'vertical'; await t.settle();
        t.eq(getComputedStyle(el).flexDirection, 'column'); t.eq(getComputedStyle(el).flexWrap, 'nowrap');
        el.setAttribute('direction', 'bogus'); t.eq(el.direction, 'horizontal', 'an unknown direction falls back');
    }],

    ['cluster: the hidden attribute hides it', async t => {
        const el = await layout(t, 'pk-cluster', 'hidden', 1, 200);
        t.eq(getComputedStyle(el).display, 'none');
    }],

    ['base CSS: items of a role="list" list laid out as a flex row share one top edge; a plain list keeps its item spacing (#1813)', async t => {
        const box = await t.mount('<div><ul role="list" id="row"><li>One</li><li>Two</li><li>Three</li></ul><ul id="prose"><li>A</li><li>B</li></ul></div>');
        const row = box.querySelector('#row'); Object.assign(row.style, { display: 'flex', gap: '1rem', listStyle: 'none', padding: '0' });
        await t.settle();
        const tops = [...row.children].map(li => Math.round(li.getBoundingClientRect().top));
        t.eq(new Set(tops).size, 1, `all items share one top (got ${tops.join(',')})`);
        t.eq(getComputedStyle(row.children[1]).marginBlockStart, '0px', 'no item margin in a role=list list');
        const p = box.querySelector('#prose').children[1];
        t.ok(parseFloat(getComputedStyle(p).marginBlockStart) > 0, 'a plain list keeps the --space-1 item spacing');
    }],

    ['stack: children stack vertically with the gap token, stretch by default, and align changes the cross axis', async t => {
        const el = await layout(t, 'pk-stack', '', 3, 300);
        t.eq(getComputedStyle(el).flexDirection, 'column'); t.eq(el.gap, 'md');
        t.eq(px(getComputedStyle(el).rowGap), px(token(el, '--space-4')), 'default gap is --space-4');
        const [a, b] = [...el.children].map(c => c.getBoundingClientRect());
        t.eq(Math.round(b.top - a.bottom), Math.round(px(token(el, '--space-4'))), 'the second child sits one gap below the first');
        t.eq(Math.round(a.width), 300, 'stretch fills the width');
        for (const [g, tok] of [['xs', '--space-1'], ['sm', '--space-2'], ['lg', '--space-6'], ['xl', '--space-8']]) { el.gap = g; await t.settle(); t.eq(px(getComputedStyle(el).rowGap), px(token(el, tok)), `gap ${g}`); }
        el.gap = 'none'; el.align = 'start'; await t.settle();
        t.eq(px(getComputedStyle(el).rowGap), 0); t.eq(getComputedStyle(el).alignItems, 'flex-start');
        for (const c of el.children) size(c, 50); await t.settle();
        t.eq(Math.round(el.firstElementChild.getBoundingClientRect().width), 50, 'start sizes to content width');
    }],

    ['stack: dividers draw a rule above every child but the first', async t => {
        const el = await layout(t, 'pk-stack', 'dividers', 3, 300);
        const [a, b] = [...el.children];
        t.eq(getComputedStyle(a).borderBlockStartWidth, '0px'); t.eq(getComputedStyle(b).borderBlockStartWidth, '1px');
        el.dividers = false; await t.settle(); t.eq(getComputedStyle(b).borderBlockStartWidth, '0px');
    }],

    ['grid: auto-fit equal columns of at least min, at two widths, down to one column on a phone', async t => {
        const gap = px(token(document.body, '--space-2')), min = rem(10);
        const fit = w => Math.floor((w + gap) / (min + gap));
        const el = await layout(t, 'pk-grid', 'min="10rem" gap="sm"', 6, Math.round(min * 3.5));
        t.eq(el.min, '10rem'); t.eq(getComputedStyle(el).display, 'grid');
        const cols = () => getComputedStyle(el).gridTemplateColumns.split(' ').length;
        const widths = () => new Set([...el.children].map(c => Math.round(c.getBoundingClientRect().width)));
        t.eq(cols(), fit(Math.round(min * 3.5)), 'a container of 3.5 minimums fits three columns');
        t.eq(cols(), 3);
        t.eq(widths().size, 1, 'columns are equal width');
        t.ok([...widths()][0] >= Math.floor(rem(10)), 'never narrower than min');
        el.parentElement.style.inlineSize = `${Math.round(min * 2.2)}px`; await t.settle();
        t.eq(cols(), 2, 'a container of 2.2 minimums fits two columns');
        el.parentElement.style.inlineSize = `${Math.round(min * 1.5)}px`; await t.settle();
        t.eq(cols(), 1, 'a narrow container collapses to one column');
        t.eq(lefts(el).every(l => l === lefts(el)[0]), true, 'children share a left edge in one column');
        t.eq(px(getComputedStyle(el).columnGap), px(token(el, '--space-2')), 'gap sm is --space-2');
    }],

    ['grid: columns caps the count, an unparseable min is ignored, and the default min applies without one', async t => {
        const el = await layout(t, 'pk-grid', 'min="6rem" columns="3"', 9, 900);
        const cols = () => getComputedStyle(el).gridTemplateColumns.split(' ').length;
        t.eq(cols(), 3, 'at most three columns although more would fit');
        el.parentElement.style.inlineSize = `${Math.round(rem(6) * 1.5)}px`; await t.settle();
        t.eq(cols(), 1, 'still drops to one column when narrow');
        el.parentElement.style.inlineSize = '900px'; el.columns = 0; await t.settle();
        t.ok(cols() > 3, 'no cap without columns');
        el.min = 'nonsense'; await t.settle();
        t.eq(el.style.getPropertyValue('--pk-grid-min'), '', 'an invalid min does not reach the css');
        t.ok(cols() >= 1, 'the grid still lays out');
        el.removeAttribute('min'); await t.settle(); t.eq(el.min, '16rem');
        t.eq(px(getComputedStyle(el).columnGap), px(token(el, '--space-4')), 'default gap is --space-4');
    }],
    ['grid: tracks sets a fixed track list, col-span and row-span size the children in it, an unparseable list is ignored (#1666)', async t => {
        const host = t.stage('<div><pk-grid tracks="repeat(12, minmax(0, 1fr))" gap="none"><div data-col-span="8">a</div><div data-col-span="4" data-row-span="2">b</div><div data-col-span="4">c</div><div data-col-span="4">d</div><div>e</div></pk-grid></div>');
        host.style.inlineSize = '1200px'; await t.load(host); await t.settle();
        const el = host.querySelector('pk-grid'), [a, b, c, d, e] = [...el.children];
        const rect = n => n.getBoundingClientRect(), w = n => Math.round(rect(n).width);
        t.eq(getComputedStyle(el).gridTemplateColumns.split(' ').length, 12, 'twelve tracks');
        t.eq(w(a), 800, 'col-span 8 is two thirds'); t.eq(w(b), 400, 'col-span 4 is a third'); t.eq(w(e), 100, 'a child without a span takes one track');
        t.ok(Math.abs(rect(a).top - rect(b).top) < 1 && rect(b).left >= rect(a).right - 1, 'the 8 and 4 share the first row');
        t.ok(rect(b).height >= rect(c).height + rect(d).height - 2 || rect(b).bottom >= rect(d).bottom - 1, 'row-span 2 reaches down beside the next row');
        for (const c of el.children) { c.removeAttribute('data-col-span'); c.removeAttribute('data-row-span'); }
        el.tracks = 'minmax(0, 1.5fr) minmax(0, 1fr)'; await t.settle();
        t.eq(getComputedStyle(el).gridTemplateColumns.split(' ').length, 2, 'a custom track list');
        el.tracks = 'not a track list'; await t.settle();
        t.eq(el.style.getPropertyValue('--pk-grid-ratio'), '', 'an unparseable list does not reach the css');
    }],
    ['grid: still fills its container inside a flex row (a shrink-to-fit parent must not collapse it)', async t => {
        const host = t.stage('<div><pk-grid min="6rem"><div></div><div></div></pk-grid></div>');
        host.firstElementChild.style.display = 'flex'; host.firstElementChild.style.alignItems = 'flex-start'; host.style.inlineSize = '500px';
        await t.load(host); await t.settle();
        t.eq(Math.round(host.querySelector('pk-grid').getBoundingClientRect().width), 500);
    }],

    ['splitter: lays out two panes by size, the separator follows the window splitter pattern, keys and a pointer drag resize and raise pk-resize once', async t => {
        const host = t.stage('<pk-splitter size="30" min="10" max="80" step="5" label="Resize the list"><div slot="start">A</div><div slot="end">B</div></pk-splitter>');
        host.style.inlineSize = '500px'; await t.load(host); await t.settle();
        const el = host.firstElementChild; const h = el.part('handle');
        const w = p => el.part(p).getBoundingClientRect().width; const room = 500 - h.getBoundingClientRect().width;
        t.ok(Math.abs(w('start') - room * 0.3) < 1.5, 'the start pane is 30 percent of the room'); t.ok(Math.abs(w('end') - room * 0.7) < 1.5);
        t.eq(h.getAttribute('role'), 'separator'); t.eq(h.getAttribute('aria-orientation'), 'vertical'); t.eq(h.getAttribute('aria-valuenow'), '30'); t.eq(h.getAttribute('aria-valuemin'), '10'); t.eq(h.getAttribute('aria-valuemax'), '80'); t.eq(h.getAttribute('aria-label'), 'Resize the list'); t.eq(h.tabIndex, 0); t.eq(h.getAttribute('aria-controls'), 'p'); t.ok(el.shadowRoot.getElementById('p'));
        const seen = []; el.addEventListener('pk-resize', e => seen.push(e.detail.size));
        const key = k => h.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, composed: true, cancelable: true }));
        key('ArrowRight'); await t.settle(); t.eq(el.size, 35); t.eq(h.getAttribute('aria-valuenow'), '35'); t.eq(seen.join(), '35');
        key('End'); key('End'); key('Home'); await t.settle(); t.eq(seen.join(), '35,80,10'); t.eq(el.size, 10);
        key('ArrowDown'); t.eq(seen.length, 3, 'Down does nothing side by side');
        el.size = 40; await t.settle(); t.eq(seen.length, 3, 'a size the host sets raises nothing'); t.ok(Math.abs(w('start') - room * 0.4) < 1.5);
        const box = el.part('root').getBoundingClientRect(); const r = h.getBoundingClientRect(); const cx = r.left + r.width / 2;
        const ptr = (type, x) => h.dispatchEvent(new PointerEvent(type, { pointerId: 7, clientX: x, clientY: r.top + 5, button: 0, bubbles: true, composed: true }));
        let inputs = 0; el.addEventListener('input', () => { inputs++; });
        ptr('pointerdown', cx); ptr('pointermove', box.left + 4 + room * 0.6); await t.settle(); t.ok(Math.abs(el.size - 60) < 0.5, 'the drag lands at 60 percent'); t.eq(seen.length, 3, 'no commit while dragging'); t.ok(inputs >= 1);
        ptr('pointerup', 0); await t.settle(); t.eq(seen.length, 4); t.eq(seen[3], el.size); t.ok(!el.part('root').hasAttribute('data-dragging'));
        el.disabled = true; await t.settle(); t.eq(h.tabIndex, -1); t.eq(h.getAttribute('aria-disabled'), 'true'); const kept = el.size; key('ArrowRight'); t.eq(el.size, kept);
        const v = t.stage('<pk-splitter orientation="vertical" size="50"><div slot="start">A</div><div slot="end">B</div></pk-splitter>'); await t.load(v); await t.settle();
        const ve = v.firstElementChild; const vh = ve.part('handle'); t.eq(vh.getAttribute('aria-orientation'), 'horizontal');
        vh.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, composed: true, cancelable: true })); t.eq(ve.size, 52);
        t.ok(ve.part('start').getBoundingClientRect().height > 0 && ve.getBoundingClientRect().height >= 200, 'stacked panes share a fixed height');
    }],
    ['splitter: collapsible collapses the end pane to zero width, the start pane fills, expanding restores the exact size, and the toggle names its state (also stacked and right to left)', async t => {
        const wait = () => new Promise(r => setTimeout(r, 400));
        const host = t.stage('<pk-splitter size="40" collapsible toggle-label="Toggle the inspector"><div slot="start">A</div><div slot="end"><button id="b">B</button></div></pk-splitter>');
        host.style.inlineSize = '600px'; await t.load(host); await t.settle();
        const el = host.firstElementChild; const w = p => el.part(p).getBoundingClientRect(); const tg = el.part('toggle'); const h = el.part('handle');
        const before = w('start').width;
        t.ok(!tg.hidden && tg.getBoundingClientRect().width > 0, 'the toggle shows with collapsible');
        t.eq(tg.getAttribute('aria-expanded'), 'true'); t.eq(tg.getAttribute('aria-label'), 'Toggle the inspector'); t.eq(tg.getAttribute('aria-controls'), 'e'); t.ok(el.shadowRoot.getElementById('e'));
        const hr = h.getBoundingClientRect(), tr = tg.getBoundingClientRect();
        t.ok(tr.left + tr.width / 2 > hr.left - 1 && tr.left + tr.width / 2 < hr.right + 1, 'the toggle sits on the separator line ' + JSON.stringify([hr.left, hr.right, tr.left, tr.right]));
        const seen = []; el.addEventListener('pk-collapse-change', e => seen.push(e.detail.collapsed));
        el.part('end').querySelector('slot').assignedElements()[0].querySelector('#b').focus();
        tg.click(); await t.settle(); await wait();
        t.eq(seen.join(), 'true'); t.ok(el.hasAttribute('collapsed'), 'collapsed reflects'); t.eq(el.size, 40, 'size is kept');
        t.ok(w('end').width < 1, 'the end pane has no width'); t.ok(el.part('end').inert);
        const room = el.part('root').getBoundingClientRect().width - h.getBoundingClientRect().width;
        t.ok(Math.abs(w('start').width - room) < 1.5, 'the start pane fills the room');
        t.eq(h.getAttribute('aria-valuenow'), '0'); t.eq(tg.getAttribute('aria-expanded'), 'false'); t.eq(tg.getAttribute('aria-label'), 'Toggle the inspector');
        t.ok(h.getBoundingClientRect().width > 0 && tg.getBoundingClientRect().width > 0, 'the separator and the toggle stay to restore it');
        h.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, composed: true, cancelable: true })); await t.settle(); await wait();
        t.eq(seen.join(), 'true,false'); t.ok(Math.abs(w('start').width - before) < 1, 'expanding restores the exact start width'); t.ok(w('end').width > 1); t.ok(!el.part('end').inert);
        h.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, composed: true })); await t.settle(); await wait(); t.eq(seen.join(), 'true,false,true');
        el.collapsed = false; await t.settle(); await wait(); t.eq(seen.length, 3, 'a collapsed value the host sets raises nothing'); t.ok(w('end').width > 1);
        host.setAttribute('dir', 'rtl'); el.collapsed = true; await t.settle(); await wait();
        const rr = el.part('root').getBoundingClientRect(); t.ok(w('end').width < 1 && w('start').width > rr.width - 40, 'right to left collapses too');
        const v = t.stage('<pk-splitter orientation="vertical" size="50" collapsible collapsed><div slot="start">A</div><div slot="end">B</div></pk-splitter>'); await t.load(v); await t.settle(); await wait();
        const ve = v.firstElementChild; t.ok(ve.part('end').getBoundingClientRect().height < 1, 'stacked: the end pane has no height');
        t.ok(ve.part('start').getBoundingClientRect().height > 150, 'stacked: the start pane fills the height');
        const vt = ve.part('toggle').getBoundingClientRect(), vh = ve.part('handle').getBoundingClientRect(); t.ok(vt.top + vt.height / 2 > vh.top - 1 && vt.top + vt.height / 2 < vh.bottom + 1, 'stacked: the toggle sits on the separator line');
    }],

    ['splitter: persist-key saves the committed size and collapsed, restores them (re-clamped) on the next one, loses to host attributes, and a failing storage is logged, not thrown', async t => {
        const wait = () => new Promise(r => setTimeout(r, 400));
        const key = 'pk-test-' + Math.random().toString(36).slice(2), area = 'pk-splitter:' + key + '.state';
        const mk = attrs => { const h = t.stage('<pk-splitter collapsible min="20" max="60" ' + attrs + '><div slot="start">A</div><div slot="end">B</div></pk-splitter>'); h.style.inlineSize = '600px'; return h; };
        try {
            const h1 = mk('size="40" persist-key="' + key + '"'); await t.load(h1); await t.settle(); await wait();
            const a = h1.firstElementChild; a.part('handle').dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true, composed: true, cancelable: true }));
            await t.settle(); a.part('toggle').click(); await t.settle();
            t.eq(JSON.stringify(JSON.parse(localStorage.getItem(area)).data), '{"size":60,"collapsed":true}', 'the committed state is stored');
            const h2 = mk('persist-key="' + key + '"'); await t.load(h2); await t.settle(); await wait(); await t.settle();
            const b = h2.firstElementChild; t.eq(b.size, 60, 'size restored'); t.ok(b.collapsed, 'collapsed restored'); t.ok(b.part('end').getBoundingClientRect().width < 1, 'restored collapsed state is laid out');
            localStorage.setItem(area, JSON.stringify({ v: 1, data: { size: 95, collapsed: false } }));
            const h3 = mk('persist-key="' + key + '"'); await t.load(h3); await t.settle(); await wait(); await t.settle();
            t.eq(h3.firstElementChild.size, 60, 'a stored size beyond max is re-clamped'); t.eq(h3.firstElementChild.part('handle').getAttribute('aria-valuenow'), '60');
            const h4 = mk('size="30" persist-key="' + key + '"'); await t.load(h4); await t.settle(); await wait(); await t.settle();
            t.eq(h4.firstElementChild.size, 30, 'a host size wins'); t.ok(!h4.firstElementChild.collapsed);
            const set = Storage.prototype.setItem; Storage.prototype.setItem = () => { throw new Error('quota'); };
            try {
                const h5 = mk('size="40" persist-key="' + key + 'x"'); await t.load(h5); await t.settle(); await wait();
                h5.firstElementChild.part('toggle').click(); await t.settle();
                t.ok(h5.firstElementChild.collapsed, 'the splitter still works when storage fails');
            } finally { Storage.prototype.setItem = set; }
        } finally { localStorage.removeItem(area); localStorage.removeItem('pk-splitter:' + key + 'x.state'); }
    }],

    ['sortable: role=list, a pointer drag on the handle raises pk-reorder, Alt+arrows reorder by keyboard, and an external drop is accepted', async t => {
        const same = (a, b, msg) => t.eq(JSON.stringify(a), JSON.stringify(b), msg);
        const host = t.stage('<pk-sortable label="Steps" accept-external><pk-sortable-item value="a">Mix</pk-sortable-item><pk-sortable-item value="b">Bake</pk-sortable-item><pk-sortable-item value="c">Cool</pk-sortable-item></pk-sortable>');
        await t.load(host); await t.settle();
        const el = host.firstElementChild; const [a, b, c] = el.querySelectorAll('pk-sortable-item');
        t.eq(el.internals.role, 'list'); t.eq(a.internals.role, 'listitem'); t.eq(a.internals.ariaRoleDescription, 'Draggable item');
        t.eq(a.tabIndex, 0, 'the first row starts the one tab stop'); t.eq(b.tabIndex, -1); t.eq(c.tabIndex, -1);

        const seen = []; el.addEventListener('pk-reorder', e => seen.push(e.detail));
        const ha = a.part('handle'); const ra = ha.getBoundingClientRect(); const rb = b.getBoundingClientRect(); const rc = c.getBoundingClientRect();
        const cx = ra.left + ra.width / 2;
        const ptr = (type, x, y) => ha.dispatchEvent(new PointerEvent(type, { pointerId: 11, clientX: x, clientY: y, button: 0, bubbles: true, composed: true }));
        ptr('pointerdown', cx, ra.top + ra.height / 2);
        t.ok(a.hasAttribute('dragging') && el.hasAttribute('dragging'), 'dragging is pushed onto the grabbed row and the list');
        ptr('pointermove', cx, rc.bottom - 2); await t.settle();
        t.eq(c.getAttribute('drop-indicator'), 'after', 'the drop line sits after the last row the pointer passed');
        ptr('pointerup', cx, rc.bottom - 2); await t.settle();
        t.eq(seen.length, 1);
        same(seen[0], { order: ['b', 'c', 'a'], item: 'a', from: 0, to: 2, external: false }, 'a drop past the last row moves it to the end');
        t.ok(!a.hasAttribute('dragging') && !el.hasAttribute('dragging'), 'dragging is cleared on drop');
        t.eq(c.getAttribute('drop-indicator'), 'none');
        t.eq([...el.children].map(x => x.value).join(), 'a,b,c', 'pk-sortable never reorders its own children: the DOM order is unchanged, only pk-reorder carries the new one');

        b.focus();
        b.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', altKey: true, bubbles: true, composed: true, cancelable: true }));
        t.eq(seen.length, 2);
        same(seen[1], { order: ['b', 'a', 'c'], item: 'b', from: 1, to: 0, external: false }, 'Alt+Up moves the focused row earlier (from the unchanged DOM order: pk-sortable never applied the previous pk-reorder itself)');

        el.beginExternalDrag({ tag: 'pk-badge' });
        t.ok(el.externalDragOver(rb.left + rb.width / 2, rb.top + 2), 'externalDragOver reports a valid drop when accept-external is set');
        const at = el.endExternalDrag(true);
        t.eq(typeof at, 'number');
        t.eq(seen.length, 3); t.eq(seen[2].external, true); t.eq(seen[2].payload.tag, 'pk-badge'); t.eq(seen[2].order, null);

        const off = t.stage('<pk-sortable label="Off"><pk-sortable-item value="x">X</pk-sortable-item></pk-sortable>');
        await t.load(off); const elOff = off.firstElementChild;
        elOff.beginExternalDrag('y');
        t.eq(elOff.externalDragOver(0, 0), false, 'without accept-external the drop is refused');
        t.eq(elOff.endExternalDrag(true), null);
    }],

    ['sortable: the handle is a 44px touch target on a phone or a coarse pointer, and plain arrows skip a disabled row', async t => {
        const el = await t.mount('<pk-sortable label="Rows"><pk-sortable-item value="a">A</pk-sortable-item><pk-sortable-item value="b" disabled>B</pk-sortable-item><pk-sortable-item value="c">C</pk-sortable-item></pk-sortable>');
        const [a, b, c] = el.querySelectorAll('pk-sortable-item');
        const r = a.part('handle').getBoundingClientRect();
        t.ok((r.height >= 43.5 && r.width >= 43.5) || innerWidth > 640, 'the handle is 44px on a phone or a coarse pointer');
        t.eq(b.internals.ariaDisabled, 'true');
        a.focus();
        t.key(a, 'ArrowDown');
        t.eq(el.shadowRoot.activeElement, null); // focus lands on the light-DOM row, not in pk-sortable's own shadow tree
        t.eq(document.activeElement, c, 'ArrowDown from the first row skips the disabled second row and lands on the third');
        const seen = []; el.addEventListener('pk-reorder', e => seen.push(e.detail));
        b.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', altKey: true, bubbles: true, composed: true, cancelable: true }));
        t.eq(seen.length, 0, 'a disabled row does not reorder even when a script focuses it directly');
    }],

    ['detail-layout: two columns above the 48rem container width, one column (sidebar static, not sticky) below it, by the container\'s own width not the viewport', async t => {
        const el = await t.mount('<pk-detail-layout><p>Main</p><div slot="sidebar"><p>Card</p></div></pk-detail-layout>');
        const cols = () => getComputedStyle(el.part('grid')).gridTemplateColumns.trim().split(' ').length;
        size(el, rem(60)); await t.settle();
        t.eq(cols(), 2, 'wide container: two columns'); t.eq(getComputedStyle(el.part('sidebar')).position, 'sticky');
        size(el, rem(30)); await t.settle();
        t.eq(cols(), 1, 'narrow container: one column'); t.eq(getComputedStyle(el.part('sidebar')).position, 'static');
    }],

    ['detail-layout: a sidebar taller than the viewport sticks by its bottom edge (negative top), a short one by its top (issue 281)', async t => {
        const el = await t.mount('<pk-detail-layout><p>Main</p><div slot="sidebar"><div id="h">Tall</div></div></pk-detail-layout>');
        el.querySelector('#h').style.height = '4000px'; size(el, rem(60)); await t.settle(); await new Promise(r => requestAnimationFrame(() => setTimeout(r, 50)));
        const side = el.part('sidebar'); const top = () => parseFloat(getComputedStyle(side).top);
        t.ok(top() < 0, 'taller than the viewport: top is negative so the bottom edge docks: ' + top());
        el.querySelector('#h').style.height = '40px'; await t.settle(); await new Promise(r => requestAnimationFrame(() => setTimeout(r, 50)));
        t.ok(top() > 0, 'shorter than the viewport: sticks by its top: ' + top());
        t.eq(Math.round(side.getBoundingClientRect().right), Math.round(el.part('grid').getBoundingClientRect().right), 'flush with the right edge of the content area');
    }],

    ['detail-layout: data-pk-section groups cards into tabs only once collapsed, with Next, a commit event and reveal-on-invalid (issue 272)', async t => {
        const el = await t.mount('<pk-detail-layout><div><pk-card heading="A" data-pk-section="details">a</pk-card><pk-card heading="B" data-pk-section="pricing" data-pk-section-label="Prices"><input required></pk-card></div><div slot="sidebar"><pk-card heading="C" data-pk-section="pricing">c</pk-card></div></pk-detail-layout>');
        const [a, b, c] = el.querySelectorAll('pk-card'); const shown = x => getComputedStyle(x).display !== 'none';
        const settle = async () => { await t.settle(); await new Promise(r => requestAnimationFrame(() => setTimeout(r, 50))); };
        size(el, rem(60)); await settle();
        t.ok(shown(a) && shown(b) && shown(c), 'wide: every card shows'); t.ok(getComputedStyle(el.part('tabs')).display === 'none', 'wide: no strip');
        size(el, rem(30)); await settle();
        t.ok(shown(a) && !shown(b) && !shown(c), 'collapsed: only the first section shows');
        const tabs = [...el.part('tabs').querySelectorAll('pk-tab')]; t.eq(tabs.map(x => x.textContent).join(), 'Details,Prices', 'tabs come from the cards, labelled from data-pk-section-label');
        const seen = []; el.addEventListener('pk-section-change', e => seen.push(e.detail.section));
        el.part('next').click(); await settle();
        t.ok(!shown(a) && shown(b) && shown(c), 'Next selects the next section'); t.eq(seen.join(), 'pricing'); t.eq(el.section, 'pricing');
        el.section = 'details'; await settle(); t.eq(seen.length, 1, 'a host change raises no event'); t.ok(shown(a) && !shown(b));
        el.querySelector('input').dispatchEvent(new Event('invalid')); await settle();
        t.ok(shown(b), 'an invalid control in a hidden section reveals it');
        size(el, rem(60)); await settle(); t.ok(shown(a) && shown(b) && shown(c) && !b.hasAttribute('data-pk-section-hidden'), 'widening shows everything again');
    }],

    ['detail-layout: a pk-card inside a [data-pk-section] wrapper is in that section and gets no "no data-pk-section" warning; a bare card still does (#1806)', async t => {
        const log = await import('../../js/log.js'); log.clearLogBuffer();
        const nosection = () => log.getLogBuffer().filter(e => e.level === 'warn' && /has no data-pk-section/.test(e.message)).length;
        await t.mount('<pk-detail-layout><div data-pk-section="details"><pk-card heading="A">a</pk-card></div><pk-card heading="B" data-pk-section="pricing">b</pk-card></pk-detail-layout>'); await t.settle(); await t.settle();
        t.eq(nosection(), 0, 'a card inside a section wrapper does not warn');
        await t.mount('<pk-detail-layout><pk-card heading="A" data-pk-section="details">a</pk-card><pk-card heading="B" data-pk-section="pricing">b</pk-card><pk-card heading="Loose">c</pk-card></pk-detail-layout>'); await t.settle(); await t.settle();
        t.eq(nosection(), 1, 'a card with no section around it still warns');
    }],

    ['detail-layout: the collapsed strip tabs are defined and styled (tap height), and choosing the second tab swaps the main and sidebar cards (#316)', async t => {
        const el = await t.mount('<pk-detail-layout><pk-card id="a" heading="A" data-pk-section="details">a</pk-card><pk-card id="b" heading="B" data-pk-section="pricing">b</pk-card><div slot="sidebar"><pk-card id="c" heading="C" data-pk-section="details">c</pk-card><pk-card id="d" heading="D" data-pk-section="pricing">d</pk-card></div></pk-detail-layout>');
        const shown = x => getComputedStyle(x).display !== 'none'; const q = id => el.querySelector('#' + id);
        size(el, rem(30)); await t.settle(); await new Promise(r => requestAnimationFrame(() => setTimeout(r, 50)));
        const tabs = [...el.part('tabs').querySelectorAll('pk-tab')];
        t.ok(customElements.get('pk-tab') && tabs.length === 2, 'pk-tab is defined and the strip has two tabs');
        t.ok(tabs[0].getBoundingClientRect().height >= 30, 'a tab is at least 30px tall, so it is styled and tappable');
        t.ok(shown(q('a')) && shown(q('c')) && !shown(q('b')) && !shown(q('d')), 'the first section shows while the first tab is selected');
        tabs[1].click(); await t.settle(); await new Promise(r => requestAnimationFrame(() => setTimeout(r, 50)));
        t.ok(shown(q('b')) && shown(q('d')) && !shown(q('a')) && !shown(q('c')), 'choosing the second tab swaps the main cards and the sidebar cards');
    }],
    ['detail-layout: data-pk-section-order sorts the tab strip across main and sidebar, data-pk-section-count is the badge and both update live (#1471)', async t => {
        const el = await t.mount('<pk-detail-layout><pk-card id="a" heading="A" data-pk-section="details" data-pk-section-order="1">a</pk-card><pk-card id="b" heading="B" data-pk-section="notes" data-pk-section-order="3">b</pk-card><div slot="sidebar"><pk-card id="c" heading="C" data-pk-section="history" data-pk-section-order="2" data-pk-section-count="7">c</pk-card></div></pk-detail-layout>');
        const settle = async () => { await t.settle(); await new Promise(r => requestAnimationFrame(() => setTimeout(r, 50))); };
        const tabs = () => [...el.part('tabs').querySelectorAll('pk-tab')];
        size(el, rem(30)); await settle();
        t.eq(tabs().map(x => x.value).join(), 'details,history,notes', 'order interleaves the sidebar section');
        t.eq(tabs()[1].getAttribute('count'), '7', 'count reaches the tab'); t.ok(!tabs()[0].hasAttribute('count'), 'no count, no badge');
        t.ok(/7/.test(tabs()[1].shadowRoot?.textContent || tabs()[1].textContent || ''), 'badge text rendered');
        el.querySelector('#c').setAttribute('data-pk-section-count', '9'); el.querySelector('#c').setAttribute('data-pk-section-order', '5'); await settle();
        t.eq(tabs().map(x => x.value).join(), 'details,notes,history', 'a changed order re-sorts live'); t.eq(tabs()[2].getAttribute('count'), '9', 'a changed count updates live');
        el.querySelectorAll('[data-pk-section-order],[data-pk-section-count]').forEach(x => { x.removeAttribute('data-pk-section-order'); x.removeAttribute('data-pk-section-count'); }); await settle();
        t.eq(tabs().map(x => x.value).join(), 'details,notes,history', 'absent attributes: document order, main then sidebar'); t.ok(tabs().every(x => !x.hasAttribute('count')), 'no badges');
    }],

    ['detail-layout: tabs-from=always shows the strip and one section at a time in the two-column layout; tabs-from=phone shows every section on a wide viewport (#342)', async t => {
        const el = await t.mount('<pk-detail-layout tabs-from="always"><pk-card id="a" heading="A" data-pk-section="details">a</pk-card><pk-card id="b" heading="B" data-pk-section="pricing">b</pk-card><div slot="sidebar"><pk-card id="c" heading="C" data-pk-section="pricing">c</pk-card></div></pk-detail-layout>');
        const shown = id => getComputedStyle(el.querySelector('#' + id)).display !== 'none';
        const settle = async () => { await t.settle(); await new Promise(r => requestAnimationFrame(() => setTimeout(r, 50))); };
        size(el, rem(60)); await settle();
        t.ok(getComputedStyle(el.part('tabs')).display !== 'none', 'wide: the strip shows');
        t.ok(shown('a') && !shown('b') && !shown('c'), 'wide: only the first section shows');
        t.ok(el.part('sidebar').getBoundingClientRect().left >= el.part('main').getBoundingClientRect().right, 'wide: the two-column layout is kept');
        t.ok(getComputedStyle(el.part('next')).display !== 'none', 'wide: Next moves on');
        el.part('next').click(); await settle();
        t.ok(!shown('a') && shown('b') && shown('c'), 'Next selects the pricing section, sidebar card included');
        el.tabsFrom = 'phone'; await settle();
        t.ok(shown('a') && shown('b') && shown('c') && getComputedStyle(el.part('tabs')).display === 'none', 'tabs-from=phone: a wide viewport shows every section and no strip');
    }],

    ['detail-layout: hide-tabs draws no strip of its own and shows one section at a time from a pk-page-header strip on a wide layout (#1241)', async t => {
        const root = await t.mount('<div><pk-page-header heading="Item" tabs-from="always"></pk-page-header><pk-detail-layout hide-tabs tabs-from="always"><pk-card id="a" heading="A" data-pk-section="details">a</pk-card><pk-card id="b" heading="B" data-pk-section="pricing">b</pk-card></pk-detail-layout></div>');
        const head = root.querySelector('pk-page-header'), el = root.querySelector('pk-detail-layout');
        head.tabs = [{ value: 'details', label: 'Details' }, { value: 'pricing', label: 'Pricing' }];
        head.addEventListener('pk-tab-change', e => { el.section = e.detail.value; });
        const shown = id => getComputedStyle(el.querySelector('#' + id)).display !== 'none';
        const settle = async () => { await t.settle(); await new Promise(r => requestAnimationFrame(() => setTimeout(r, 50))); };
        size(el, rem(60)); await settle();
        t.ok(getComputedStyle(el.part('tabs')).display === 'none', 'the layout draws no strip');
        t.ok(shown('a') && !shown('b'), 'only the first section shows, though the layout is two-column wide');
        head.part('strip').querySelector('pk-tab[value="pricing"]').click(); await settle();
        t.ok(!shown('a') && shown('b'), 'choosing a tab on the header shows that section');
    }],

    ['detail-layout: sections-above set before the first connect throws nothing (#1681)', async t => {
        const errors = [], on = e => errors.push(e.message);
        window.addEventListener('error', on);
        try {
            const root = await t.mount('<div><pk-card id="top" heading="Top" data-pk-section="a">t</pk-card><pk-detail-layout sections-above tabs-from="phone"><pk-card heading="A" data-pk-section="a">a</pk-card><pk-card heading="B" data-pk-section="b">b</pk-card></pk-detail-layout></div>');
            await t.settle();
            t.ok(!!root.querySelector('pk-detail-layout'), 'mounted');
        } finally { window.removeEventListener('error', on); }
        t.eq(errors.join('|'), '', 'no error was reported on first render');
    }],

    ['detail-layout: hide-tabs collapses to one section only where tabs-from says the strip applies, not at every width (#1680)', async t => {
        const root = await t.mount('<div><pk-detail-layout hide-tabs tabs-from="phone"><pk-card id="a" heading="A" data-pk-section="a">a</pk-card><pk-card id="b" heading="B" data-pk-section="b">b</pk-card><pk-card id="c" slot="sidebar" heading="C" data-pk-section="c">c</pk-card></pk-detail-layout><pk-detail-layout id="d" hide-tabs><pk-card id="d1" heading="A" data-pk-section="a">a</pk-card><pk-card id="d2" heading="B" data-pk-section="b">b</pk-card></pk-detail-layout></div>');
        const el = root.querySelector('pk-detail-layout'), dflt = root.querySelector('#d');
        const shown = (host, id) => getComputedStyle(host.querySelector('#' + id)).display !== 'none';
        const settle = async () => { await t.settle(); await new Promise(r => requestAnimationFrame(() => setTimeout(r, 50))); };
        size(el, rem(60)); size(dflt, rem(60)); await settle();
        t.ok(shown(el, 'a') && shown(el, 'b') && shown(el, 'c'), 'wide: every section shows, hide-tabs hides no more than the strip');
        t.ok(shown(dflt, 'd1') && shown(dflt, 'd2'), 'wide, default tabs-from: both columns show');
        size(dflt, rem(30)); await settle();
        t.ok(shown(dflt, 'd1') && !shown(dflt, 'd2'), 'collapsed layout, default tabs-from: one section at a time, driven by the host');
        dflt.section = 'b'; await settle();
        t.ok(!shown(dflt, 'd1') && shown(dflt, 'd2'), 'the host chooses the section with section=');
        el.tabsFrom = 'always'; await settle();
        t.ok(shown(el, 'a') && !shown(el, 'b') && !shown(el, 'c'), 'tabs-from=always: one section at a time at every width');
    }],

    ['detail-layout: hide-next removes the Next button after the main column; without it the button shows in the collapsed layout (#1433)', async t => {
        const root = await t.mount('<div><pk-detail-layout id="a"><pk-card heading="A" data-pk-section="details">a</pk-card><pk-card heading="B" data-pk-section="pricing">b</pk-card></pk-detail-layout><pk-detail-layout id="b" hide-next><pk-card heading="A" data-pk-section="details">a</pk-card><pk-card heading="B" data-pk-section="pricing">b</pk-card></pk-detail-layout></div>');
        const [on, off] = [root.querySelector('#a'), root.querySelector('#b')];
        size(on, rem(30)); size(off, rem(30)); await t.settle(); await new Promise(r => requestAnimationFrame(() => setTimeout(r, 50)));
        const box = el => el.part('next').getBoundingClientRect();
        t.ok(getComputedStyle(on.part('next')).display !== 'none' && box(on).width > 0 && on.part('next').textContent.startsWith('Next: '), 'the Next button shows by default');
        t.ok(getComputedStyle(off.part('next')).display === 'none' && box(off).width === 0, 'hide-next draws no Next button');
        t.ok(getComputedStyle(off.part('tabs')).display !== 'none', 'the tab strip is unaffected');
        off.removeAttribute('hide-next'); await t.settle(); await new Promise(r => requestAnimationFrame(() => setTimeout(r, 50)));
        t.ok(box(off).width > 0, 'removing hide-next brings the button back');
    }],

    ['detail-layout: sections-above hides and shows a tagged sibling before the layout with the section (#1241)', async t => {
        const root = await t.mount('<div><pk-card id="top" heading="Top" data-pk-section="details">t</pk-card><pk-detail-layout sections-above tabs-from="always"><pk-card id="a" heading="A" data-pk-section="details">a</pk-card><pk-card id="b" heading="B" data-pk-section="pricing">b</pk-card></pk-detail-layout></div>');
        const el = root.querySelector('pk-detail-layout');
        const shown = id => getComputedStyle(root.querySelector('#' + id)).display !== 'none';
        await t.settle();
        t.ok(shown("top") && shown("a") && !shown("b"), "the first section shows the tagged sibling above with it");
        el.section = 'pricing'; await t.settle();
        t.ok(!shown("top") && !shown("a") && shown("b"), "choosing pricing hides the sibling above too");
    }],

    ['detail-layout: tab-param opens on the section the query names and writes a change with replaceState (other parameters and hash kept, history length unchanged) (#1241)', async t => {
        const html = '<pk-detail-layout tabs-from="always" tab-param="tab"><pk-card id="a" heading="A" data-pk-section="details">a</pk-card><pk-card id="b" heading="B" data-pk-section="pricing">b</pk-card></pk-detail-layout>';
        const before = location.href, len = history.length;
        const shown = (el, id) => getComputedStyle(el.querySelector('#' + id)).display !== 'none';
        try {
            history.replaceState(null, '', '?x=1#h');
            const el = await t.mount(html); await t.settle();
            t.ok(shown(el, 'a') && !shown(el, 'b'), 'no parameter: the first section');
            t.eq(location.search, '?x=1', 'nothing is written on load');
            el.part('tabs').querySelector('pk-tab[value="pricing"]').click(); await t.settle();
            t.eq(location.search, '?x=1&tab=pricing', 'the chosen section is written, other parameters kept'); t.eq(location.hash, '#h', 'the hash is kept'); t.eq(history.length, len, 'no history entry is added');
            const again = await t.mount(html); await t.settle();
            t.ok(!shown(again, 'a') && shown(again, 'b'), 'a link carrying the parameter opens on that section');
            history.replaceState(null, '', '?tab=nope');
            const bad = await t.mount(html); await t.settle();
            t.ok(shown(bad, 'a'), 'a value matching no section is ignored');
        } finally { history.replaceState(null, '', before); }
    }],

    ['detail-layout: sidebarFirst reorders the sidebar before the main content once collapsed; sidebarTwoUp lays its own cards two per row', async t => {
        const el = await t.mount('<pk-detail-layout sidebar-first sidebar-two-up><p>Main</p><div slot="sidebar"><p>A</p><p>B</p></div></pk-detail-layout>');
        size(el, rem(30)); await t.settle();
        t.ok(el.part('main').getBoundingClientRect().top > el.part('sidebar').getBoundingClientRect().top, 'sidebarFirst: the sidebar sits above the main content once stacked');
        t.eq(getComputedStyle(el.part('sidebar')).gridTemplateColumns.trim().split(' ').length, 2, 'sidebarTwoUp: two columns of cards inside the collapsed sidebar');
    }],
    ['detail-layout: stacked (collapsed), the vertical gaps between its children differ by no more than the scorecard\'s 6px, the main and the sidebar stacks alike (#402)', async t => {
        const el = await t.mount('<pk-detail-layout><pk-page-header heading="Order 1042"></pk-page-header><p>Line items go here.</p><pk-card slot="sidebar"><h3>Status</h3><p>Shipped</p></pk-card><pk-card slot="sidebar"><h3>Customer</h3><p>Ada</p></pk-card></pk-detail-layout>');
        for (const w of [30, 60]) {
            size(el, rem(w)); await t.settle();
            const kids = [...el.children].filter(k => { const r = k.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
            const gaps = [];
            for (let i = 1; i < kids.length; i++) { const a = kids[i - 1].getBoundingClientRect(), b = kids[i].getBoundingClientRect(); if (b.top >= a.bottom - 1) gaps.push(Math.round((b.top - a.bottom) * 10) / 10); }
            t.ok(gaps.length < 3 || Math.max(...gaps) - Math.min(...gaps) <= 6, `${w}rem wide: gaps differ by no more than 6px (${kids.map(k => k.localName).join(' | ')}: ${gaps.join(', ')})`);
        }
    }],
    ['text: a block paragraph by default, a run inside a line when inline, with the paragraph role only as a block', async t => {
        const host = t.stage('<pk-text>Para</pk-text><p>After</p><pk-text inline>Run</pk-text>');
        await t.load(host);
        const [block, , run] = host.children;
        t.eq(getComputedStyle(block).display, 'block'); t.eq(getComputedStyle(run).display, 'inline');
        t.eq(block.internals?.role, 'paragraph', 'a block is a paragraph'); t.eq(run.internals?.role ?? null, null, 'an inline run has no role');
        run.inline = false; await t.settle();
        t.eq(run.internals?.role, 'paragraph', 'turning inline off makes it a paragraph');
    }],

    ['text: a heading variant matches the native heading beside it; size, tone, weight and font come from the tokens and override the variant', async t => {
        const host = t.stage('<h2>Real</h2><pk-text variant="h2">Look</pk-text><h6>Six</h6><pk-text variant="eyebrow">Label</pk-text>');
        await t.load(host); await t.settle();
        const [h2, look, h6, eyebrow] = host.children; const cs = el => getComputedStyle(el);
        t.eq(cs(look).fontSize, cs(h2).fontSize, 'variant h2 is the size of a native h2'); t.eq(cs(look).fontWeight, cs(h2).fontWeight, 'and its weight');
        t.ok(px(cs(h6).fontSize) >= px(token(host, '--text-meta')) - 0.5, 'a native h6 is not below the meta floor');
        t.eq(cs(eyebrow).textTransform, 'uppercase');
        look.size = 'meta'; look.tone = 'muted'; look.weight = 'regular'; look.font = 'mono'; await t.settle();
        const probe = document.createElement('span'); probe.className = 'muted small'; host.append(probe);
        t.eq(cs(look).fontSize, cs(probe).fontSize, 'size overrides the variant (--text-meta, as .small)'); t.eq(cs(look).color, cs(probe).color, 'tone muted is --color-muted');
        t.eq(cs(look).fontWeight, '400', 'weight overrides the variant'); t.ok(/monospace/.test(cs(look).fontFamily), 'font mono');
    }],

    ['text: truncate keeps a long text on one line with an ellipsis, as a block and inline', async t => {
        const host = t.stage('<pk-text truncate>A very long line of text that cannot fit in a narrow column at all</pk-text><pk-text inline truncate>Another very long run of text that cannot fit either</pk-text>');
        host.style.inlineSize = '120px'; await t.load(host); await t.settle();
        for (const el of host.children) {
            t.eq(getComputedStyle(el).textOverflow, 'ellipsis'); t.eq(getComputedStyle(el).whiteSpace, 'nowrap');
            t.ok(el.scrollWidth > el.clientWidth, `${el.inline ? 'inline' : 'block'}: the text overflows its box`); t.ok(el.getBoundingClientRect().width <= 121, 'and the box stays in the column');
        }
    }],
    ['text white-space (#1538): pre-wrap keeps line breaks and runs of spaces, nowrap stays on one line, the default collapses them', async t => {
        const host = t.stage('<pk-text id="a">one\ntwo   three</pk-text><pk-text id="b" white-space="pre-wrap">one\ntwo   three</pk-text><pk-text id="c" white-space="nowrap">one two three four five six seven eight nine ten</pk-text>');
        host.style.inlineSize = '120px'; await t.load(host); await t.settle();
        const a = host.querySelector('#a'), b = host.querySelector('#b'), c = host.querySelector('#c');
        t.eq(getComputedStyle(a).whiteSpace, 'normal'); t.eq(getComputedStyle(b).whiteSpace, 'pre-wrap'); t.eq(getComputedStyle(c).whiteSpace, 'nowrap');
        t.ok(b.getBoundingClientRect().height > a.getBoundingClientRect().height + 5, 'pre-wrap shows the second line the default collapses');
        t.ok(c.scrollWidth > c.clientWidth && c.getBoundingClientRect().height < b.getBoundingClientRect().height, 'nowrap keeps one line');
        b.setAttribute('truncate', ''); await t.settle(); t.eq(getComputedStyle(b).whiteSpace, 'nowrap', 'truncate still wins');
    }],
    // Pointer events are synthesized on the card's handle (the same way the sortable case does): a real drag needs a live pointer, but the element only reads the handle's own events and their coordinates.
    ['kanban (#332): dragging near a column edge scrolls the column, near the board edge scrolls the board, the loop stops on drop, and 100 abandoned drags leave no frame callback behind', async t => {
        const wait = ms => new Promise(r => setTimeout(r, ms));
        const cards = n => Array.from({ length: n }, (_, i) => `<pk-sortable-item value="c${i}"><pk-card heading="Task ${i + 1}" level="3">Something to do.</pk-card></pk-sortable-item>`).join('');
        const html = `<div style="inline-size:420px"><pk-kanban label="Board"><pk-kanban-column value="a" label="A">${cards(12)}</pk-kanban-column><pk-kanban-column value="b" label="B">${cards(1)}</pk-kanban-column><pk-kanban-column value="c" label="C"></pk-kanban-column></pk-kanban></div>`;
        const host = t.stage(html); await t.load(host); await t.settle();
        const el = host.querySelector('pk-kanban'), col = el.querySelector('pk-kanban-column'), card = col.querySelector('pk-sortable-item');
        const board = el.part('board'), list = col.part('list');
        t.ok(board.scrollWidth > board.clientWidth + 50, 'the board is wider than its box, so it can scroll sideways');
        t.ok(list.scrollHeight > list.clientHeight + 50, 'the long column can scroll inside itself');
        const h = card.part('handle'), hr = h.getBoundingClientRect();
        const ptr = (type, x, y) => h.dispatchEvent(new PointerEvent(type, { pointerId: 21, clientX: x, clientY: y, button: 0, bubbles: true, composed: true }));
        ptr('pointerdown', hr.left + hr.width / 2, hr.top + hr.height / 2);
        t.ok(el.hasAttribute('dragging'), 'the drag started');
        const lr = list.getBoundingClientRect(), cx = lr.left + lr.width / 2;
        ptr('pointermove', cx, lr.top + lr.height / 2); await wait(150);
        t.eq(list.scrollTop, 0, 'a pointer in the middle of the column scrolls nothing');
        ptr('pointermove', cx, lr.bottom - 4); await wait(400);
        t.ok(list.scrollTop > 20, `the column scrolled down while the pointer sat near its bottom edge (scrollTop ${Math.round(list.scrollTop)})`);
        const br = board.getBoundingClientRect();
        ptr('pointermove', br.right - 4, lr.top + lr.height / 2); await wait(400);
        t.ok(board.scrollLeft > 20, `the board scrolled sideways while the pointer sat near its right edge (scrollLeft ${Math.round(board.scrollLeft)})`);
        ptr('pointerup', br.right - 4, lr.top + lr.height / 2); await t.settle();
        const rest = [list.scrollTop, board.scrollLeft]; await wait(250);
        t.ok(!el.hasAttribute('dragging') && list.scrollTop === rest[0] && board.scrollLeft === rest[1], 'after the drop nothing scrolls any more');

        // Mount, start a drag near an edge and remove the board mid-drag, 100 times: no animation frame callback may stay pending.
        const live = new Set(), raf = window.requestAnimationFrame, caf = window.cancelAnimationFrame;
        window.requestAnimationFrame = fn => { const id = raf(ts => { live.delete(id); fn(ts); }); live.add(id); return id; };
        window.cancelAnimationFrame = id => { live.delete(id); caf(id); };
        try {
            for (let i = 0; i < 100; i++) {
                const box = t.stage(html); await t.load(box);
                const k = box.querySelector('pk-kanban'), hh = k.querySelector('pk-sortable-item').part('handle'), r = hh.getBoundingClientRect(), b = k.part('board').getBoundingClientRect();
                hh.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 22, clientX: r.left + 5, clientY: r.top + 5, button: 0, bubbles: true, composed: true }));
                hh.dispatchEvent(new PointerEvent('pointermove', { pointerId: 22, clientX: b.right - 4, clientY: r.top + 5, bubbles: true, composed: true }));
                box.remove();
            }
            await wait(100);
        } finally { window.requestAnimationFrame = raf; window.cancelAnimationFrame = caf; }
        t.eq(live.size, 0, '100 boards removed mid-drag left no pending animation frame');
    }],
    // The page itself scrolls while dragging (#332): a drag near the top or bottom edge of the nearest scrolling ancestor (here a 300px box) or of the window scrolls it, in the shared js/drag-scroll.js.
    ['drag auto-scroll (#332): pk-sortable and pk-kanban scroll the nearest scrolling ancestor, and pk-sortable the window, when the pointer nears its edge; the row under a still pointer is recomputed; a drop stops it', async t => {
        const wait = ms => new Promise(r => setTimeout(r, ms));
        const rows = n => Array.from({ length: n }, (_, i) => `<pk-sortable-item value="r${i}">Row ${i + 1}</pk-sortable-item>`).join('');
        const drag = (h, id) => (type, x, y) => h.dispatchEvent(new PointerEvent(type, { pointerId: id, clientX: x, clientY: y, button: 0, bubbles: true, composed: true }));

        // pk-sortable inside a scrolling box.
        let host = t.stage(`<div style="block-size:300px;overflow:auto"><pk-sortable label="Rows">${rows(30)}</pk-sortable></div>`); await t.load(host); await t.settle();
        let box = host.firstElementChild, el = box.firstElementChild; const seen = []; el.addEventListener('pk-reorder', e => seen.push(e.detail));
        t.ok(box.scrollHeight > box.clientHeight + 200, 'the box can scroll');
        let h = el.querySelector('pk-sortable-item').part('handle'), hr = h.getBoundingClientRect(), br = box.getBoundingClientRect(), p = drag(h, 31);
        p('pointerdown', hr.left + 5, hr.top + 5);
        p('pointermove', hr.left + 5, br.top + br.height / 2); await wait(150);
        t.eq(box.scrollTop, 0, 'the pointer in the middle of the box scrolls nothing');
        p('pointermove', hr.left + 5, br.bottom - 4); await wait(500);
        t.ok(box.scrollTop > 40, `the box scrolled down while the pointer sat near its bottom edge (scrollTop ${Math.round(box.scrollTop)})`);
        p('pointerup', hr.left + 5, br.bottom - 4); await t.settle();
        t.ok(seen.length === 1 && seen[0].to > 3, `the drop landed on a row that scrolled under the pointer (to ${seen[0]?.to})`);
        const rest = box.scrollTop; await wait(200);
        t.eq(box.scrollTop, rest, 'after the drop nothing scrolls any more');

        // pk-sortable in the page: the window scrolls down near its bottom edge and back up near its top edge.
        host = t.stage(`<pk-sortable label="Rows">${rows(80)}</pk-sortable>`); await t.load(host); await t.settle();
        el = host.firstElementChild; window.scrollTo(0, 0);
        // The harness stage sits at left:-10000px, and Chrome leaves content wholly off the start edge out of the scrollable overflow, so the page only scrolled when the long results list above it did (#1163). Bring the stage into the page for this part, so the case behaves the same alone and in the full suite.
        const stageBox = host.parentElement, stageLeft = stageBox.style.left; stageBox.style.left = '0';
        try {
            t.ok(document.scrollingElement.scrollHeight > innerHeight + 300, 'the page is taller than the window');
            h = el.querySelector('pk-sortable-item').part('handle'); hr = h.getBoundingClientRect(); p = drag(h, 32);
            p('pointerdown', hr.left + 5, hr.top + 5);
            p('pointermove', hr.left + 5, innerHeight - 4); await wait(500);
            const down = window.scrollY;
            t.ok(down > 40, `the window scrolled down while the pointer sat near the bottom of the window (scrollY ${Math.round(down)})`);
            p('pointermove', hr.left + 5, 4); await wait(400);
            t.ok(window.scrollY < down, `and back up near the top edge (scrollY ${Math.round(window.scrollY)})`);
            p('pointerup', hr.left + 5, 4); await t.settle();
            const y = window.scrollY; await wait(200);
            t.eq(window.scrollY, y, 'after the drop the window stays put');
        } finally { stageBox.style.left = stageLeft; window.scrollTo(0, 0); }

        // pk-kanban inside a scrolling box: the column is taller than the box, so the box scrolls.
        const cards = n => Array.from({ length: n }, (_, i) => `<pk-sortable-item value="c${i}"><pk-card heading="Task ${i + 1}" level="3">Something to do.</pk-card></pk-sortable-item>`).join('');
        host = t.stage(`<div style="block-size:300px;overflow:auto"><pk-kanban label="Board"><pk-kanban-column value="a" label="A">${cards(8)}</pk-kanban-column><pk-kanban-column value="b" label="B"></pk-kanban-column></pk-kanban></div>`); await t.load(host); await t.settle();
        box = host.firstElementChild; el = box.firstElementChild;
        t.ok(box.scrollHeight > box.clientHeight + 100, 'the box around the board can scroll');
        h = el.querySelector('pk-sortable-item').part('handle'); hr = h.getBoundingClientRect(); br = box.getBoundingClientRect(); p = drag(h, 33);
        p('pointerdown', hr.left + 5, hr.top + 5);
        p('pointermove', hr.left + 5, br.bottom - 4); await wait(500);
        t.ok(box.scrollTop > 40, `the box around the board scrolled while the pointer sat near its bottom edge (scrollTop ${Math.round(box.scrollTop)})`);
        p('pointerup', hr.left + 5, br.bottom - 4); await t.settle();
        const kept = box.scrollTop; await wait(200);
        t.eq(box.scrollTop, kept, 'after the drop the box stays put');
    }],
    // #1675 phase 1: pk-app-shell `contain`. The shell is given a definite height through CSSOM (the strict CSP forbids style attributes).
    ['app-shell contain (#1675): any single slotted child fills the body height, without it the child keeps its own height, and flush composes', async t => {
        const shell = async (attrs, w) => { const host = t.stage(`<pk-app-shell ${attrs}><div>short</div></pk-app-shell>`); host.style.inlineSize = `${w}px`; await t.load(host); const el = host.firstElementChild; el.style.blockSize = '600px'; await t.settle(); return el; };
        for (const w of [1280, 375]) {
            const body = el => el.shadowRoot.querySelector('[part=body]'), content = el => { const b = body(el).getBoundingClientRect(), cs = getComputedStyle(body(el)); return b.bottom - px(cs.paddingBottom); };
            const on = await shell('contain', w), kid = on.firstElementChild;
            t.ok(Math.abs(kid.getBoundingClientRect().bottom - content(on)) <= 1, `${w}px: the child's bottom meets the body's content bottom (${kid.getBoundingClientRect().bottom} vs ${content(on)})`);
            t.ok(body(on).scrollHeight <= body(on).clientHeight, `${w}px: the body does not scroll`);
            const off = await shell('', w);
            t.ok(off.firstElementChild.getBoundingClientRect().height < 60, `${w}px: without contain the child keeps its natural height (${off.firstElementChild.getBoundingClientRect().height})`);
            const fl = await shell('contain flush', w), fk = fl.firstElementChild;
            t.ok(Math.abs(fk.getBoundingClientRect().bottom - body(fl).getBoundingClientRect().bottom) <= 1 && fk.getBoundingClientRect().height > 400, `${w}px: contain with flush fills edge to edge`);
        }
    }],
    ['app-shell contain (#1675): the body is the container named page, @container page answers to the body width and not the viewport, and the name is a hook', async t => {
        const host = t.stage('<pk-app-shell contain><div class="probe">x</div></pk-app-shell>'); host.style.inlineSize = '300px'; await t.load(host);
        const el = host.firstElementChild, body = el.shadowRoot.querySelector('[part=body]'), probe = el.firstElementChild, cs = getComputedStyle(body);
        t.eq(cs.containerType, 'inline-size'); t.eq(cs.containerName, 'page'); t.ok(['hidden', 'clip'].includes(cs.overflowX), `sideways overflow is clipped, not scrollable or visible (overflow-x ${cs.overflowX}; clip beside a scrolling y computes to hidden or stays clip, by browser)`);
        const sheet = new CSSStyleSheet(); sheet.replaceSync('@container page (min-width: 900px) { .probe { margin-left: 11px; } } @container page (max-width: 600px) { .probe { margin-right: 7px; } }');
        document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
        try {
            await t.settle();
            const m = getComputedStyle(probe);
            t.eq(m.marginRight, '7px', 'the narrow body matches max-width: 600px'); t.eq(m.marginLeft, '0px', 'the wide query does not match: the body is 300px wide, the viewport is wider');
            el.style.setProperty('--pk-app-shell-container', 'main'); await t.settle();
            t.eq(getComputedStyle(body).containerName, 'main', '--pk-app-shell-container renames it');
        } finally { document.adoptedStyleSheets = document.adoptedStyleSheets.filter(s => s !== sheet); }
        const plain = t.stage('<pk-app-shell><div>x</div></pk-app-shell>'); await t.load(plain);
        t.eq(getComputedStyle(plain.firstElementChild.shadowRoot.querySelector('[part=body]')).containerType, 'normal', 'without contain the body is no container');
    }],
];

// Issue 837: the actions of a card header (a PkCardMenu button) stay on the header row at the inline end when the heading is long and wraps.
const LONG = 'Quarterly orders and fulfilment overview for every regional warehouse and distribution partner in the network';
layoutCases.push(
    ['card: a long heading wraps beside the header actions, which stay at the inline end of the first row (LTR and RTL, desktop and phone widths)', async t => {
        for (const dir of ['ltr', 'rtl']) for (const width of [600, 375]) {
            const host = t.stage(`<div dir="${dir}"><pk-card heading="${LONG}"><span slot="actions" class="u-contents"><pk-dropdown placement="bottom-end"><span slot="trigger" class="u-contents"><pk-button variant="ghost" size="mini" icon icon-name="more" label="Orders actions"></pk-button></span><pk-menu-item>Export</pk-menu-item></pk-dropdown></span><p>Body</p></pk-card></div>`);
            host.style.inlineSize = `${width}px`; await t.load(host);
            const card = host.querySelector('pk-card'); const title = card.part('title').getBoundingClientRect(); const header = card.part('header').getBoundingClientRect();
            const btn = host.querySelector('pk-button').getBoundingClientRect(); const c = card.getBoundingClientRect(); const at = `${dir} ${width}px`;
            t.ok(title.height > btn.height * 1.5, `${at}: the heading wraps onto several lines (${Math.round(title.height)}px tall)`);
            t.ok(btn.top < title.top + title.height / 2 && btn.bottom > title.top, `${at}: the button shares the heading's first row (button ${Math.round(btn.top)}-${Math.round(btn.bottom)}, heading ${Math.round(title.top)}-${Math.round(title.bottom)})`);
            t.ok(btn.bottom <= header.bottom, `${at}: the button is inside the header`);
            const dist = dir === 'ltr' ? c.right - btn.right : btn.left - c.left;
            const pad = parseFloat(getComputedStyle(card.part('content')).paddingInlineEnd);
            t.ok(Math.abs(dist - pad - 1) <= 2, `${at}: the button sits at the inline end, ${Math.round(dist)}px from the card edge (padding ${Math.round(pad)}px)`);
            t.ok(dir === 'ltr' ? title.right <= btn.left + 1 : title.left >= btn.right - 1, `${at}: the heading does not run under the button`);
            t.ok(c.width <= width + 1, `${at}: no horizontal overflow`);
        }
    }],
);

// Issue 728: pk-card-menu in the actions slot of a pk-card header. Same expectations as the hand-assembled dropdown above, and the open menu stays inside the viewport.
layoutCases.push(
    ['card-menu: in the card actions slot with a long heading, the button stays on the first row at the inline end, and the open menu is inside the viewport (LTR and RTL, desktop and phone widths)', async t => {
        for (const dir of ['ltr', 'rtl']) for (const width of [600, 375]) {
            const host = t.stage(`<div dir="${dir}"><pk-card heading="${LONG}"><pk-card-menu slot="actions" label="Orders actions"><pk-menu-item value="export">Export</pk-menu-item><pk-menu-item value="archive">Archive</pk-menu-item></pk-card-menu><p>Body</p></pk-card></div>`);
            host.style.inlineSize = `${width}px`; await t.load(host);
            const card = host.querySelector('pk-card'), cm = host.querySelector('pk-card-menu'); const title = card.part('title').getBoundingClientRect(); const header = card.part('header').getBoundingClientRect();
            const btn = cm.part('button').getBoundingClientRect(); const c = card.getBoundingClientRect(); const at = `${dir} ${width}px`;
            t.ok(title.height > btn.height * 1.5, `${at}: the heading wraps onto several lines (${Math.round(title.height)}px tall)`);
            t.ok(btn.top < title.top + title.height / 2 && btn.bottom > title.top, `${at}: the button shares the heading's first row (button ${Math.round(btn.top)}-${Math.round(btn.bottom)}, heading ${Math.round(title.top)}-${Math.round(title.bottom)})`);
            t.ok(btn.bottom <= header.bottom, `${at}: the button is inside the header`);
            const dist = dir === 'ltr' ? c.right - btn.right : btn.left - c.left;
            const pad = parseFloat(getComputedStyle(card.part('content')).paddingInlineEnd);
            t.ok(Math.abs(dist - pad - 1) <= 2, `${at}: the button sits at the inline end, ${Math.round(dist)}px from the card edge (padding ${Math.round(pad)}px)`);
            t.ok(dir === 'ltr' ? title.right <= btn.left + 1 : title.left >= btn.right - 1, `${at}: the heading does not run under the button`);
            // The stage sits at left -10000px and a menu is kept inside the viewport: bring it on screen so the menu is placed against its button, not clamped.
            const stage = document.getElementById('stage'), was = stage.style.left; stage.style.left = '0';
            try {
            cm.open = true; await new Promise(r => setTimeout(r, 150));
            const menu = cm.part('menu').part('menu').getBoundingClientRect(), b2 = cm.part('button').getBoundingClientRect();
            t.ok(menu.width > 0 && menu.left >= -1 && menu.right <= innerWidth + 1 && menu.top >= -1 && menu.bottom <= innerHeight + 1, `${at}: the open menu is inside the viewport (${Math.round(menu.left)}-${Math.round(menu.right)} of ${innerWidth})`);
            t.ok(dir === 'ltr' ? Math.abs(menu.right - b2.right) <= 2 : Math.abs(menu.left - b2.left) <= 2, `${at}: the menu is aligned to the button's inline end (menu ${Math.round(menu.left)}-${Math.round(menu.right)}, button ${Math.round(b2.left)}-${Math.round(b2.right)})`);
            cm.open = false;
            } finally { stage.style.left = was; }
        }
    }],
);

// Issue 889: on a phone the table's search box, the rows of a clickable table and the row checkboxes are at least the touch target (44px). The fixture page opens in an iframe of the width under test, so the phone media query answers to it.
layoutCases.push(
    ['data-table on a phone: the search box, clickable rows and row checkboxes are 44px tall at least (and the checkboxes 44px wide); on desktop the rows stay compact (issue 889)', async t => {
        for (const width of [375, 1280]) {
            const host = t.stage(''), fr = document.createElement('iframe');
            fr.title = `data table at ${width}px`; fr.style.cssText = `width:${width}px;height:600px;border:0;display:block`;
            fr.src = new URL('./table-frame.html', import.meta.url).href;
            await new Promise(resolve => { fr.addEventListener('load', resolve, { once: true }); host.append(fr); });
            const win = fr.contentWindow, d = win.document, wait = ms => new Promise(r => setTimeout(r, ms));
            await Promise.all(['pk-data-table', 'pk-table', 'pk-table-filters'].map(tag => win.customElements.whenDefined(tag)));
            const dt = d.querySelector('pk-data-table');
            for (let i = 0; i < 100 && !dt.part('table')?.shadowRoot?.querySelector('tr[data-clickable]'); i++) await wait(40);
            const inner = dt.part('table').shadowRoot, h = el => el.getBoundingClientRect(), at = `${width}px`;
            const search = dt.part('filters').shadowRoot.querySelector('[part="search"]'), rows = [...inner.querySelectorAll('tr[data-clickable]')], boxes = [...inner.querySelectorAll('[data-select], [data-select-all]')];
            t.ok(search && rows.length === 3 && boxes.length === 4, `${at}: the search box, three rows and four checkboxes are there`);
            const phone = width < 600, min = phone ? 43.5 : 0;
            t.ok(h(search).height >= min && h(search).height > 0, `${at}: the search box is ${Math.round(h(search).height)}px tall`);
            for (const r of rows) t.ok(h(r).height >= min, `${at}: a clickable row is ${Math.round(h(r).height)}px tall`);
            for (const b of boxes) t.ok(h(b).height >= min && h(b).width >= min, `${at}: a checkbox is ${Math.round(h(b).width)}x${Math.round(h(b).height)}px`);
            if (!phone) t.ok(h(rows[0]).height < 44, `${at}: desktop rows stay compact (${Math.round(h(rows[0]).height)}px)`);
            fr.remove();
        }
    }],
);

// Issue 1019: a data-driven row carries a tone (and an indent) from the row object; the tint and the leading rule show on the desktop row and on the phone card.
layoutCases.push(
    ['table row tone: a row with tone has a tint and a leading rule, and indent moves its first cell in, on desktop and as a phone card (issue 1019)', async t => {
        for (const width of [1280, 375]) {
            const host = t.stage(''), fr = document.createElement('iframe');
            fr.title = `table row tone at ${width}px`; fr.style.cssText = `width:${width}px;height:600px;border:0;display:block`;
            fr.src = new URL('./table-frame.html', import.meta.url).href;
            await new Promise(resolve => { fr.addEventListener('load', resolve, { once: true }); host.append(fr); });
            const win = fr.contentWindow, d = win.document, wait = ms => new Promise(r => setTimeout(r, ms));
            await win.customElements.whenDefined('pk-table');
            const tb = d.createElement('pk-table');
            tb.setAttribute('cards', ''); tb.setAttribute('row-key', 'id');
            tb.columns = [{ key: 'name', label: 'Name' }, { key: 'sku', label: 'SKU' }];
            tb.rows = [{ id: 'a', name: 'Plain', sku: '1' }, { id: 'b', name: 'Late', sku: '2', tone: 'warning' }, { id: 'c', name: 'Child', sku: '3', tone: 'accent', indent: 1 }, { id: 'd', name: 'Done', sku: '4', tone: 'positive' }];
            d.body.append(tb);
            for (let i = 0; i < 100 && !tb.shadowRoot?.querySelector('tbody tr:nth-child(4)'); i++) await wait(40);
            const trs = [...tb.shadowRoot.querySelectorAll('tbody tr')], at = `${width}px`, cs = el => win.getComputedStyle(el);
            const alpha = c => { if (c.startsWith('color(')) return c.includes('/') ? Number(c.split('/')[1].replace(')', '')) : 1; const m = /rgba?\(([^)]+)\)/.exec(c)?.[1].split(/[ ,\/]+/).filter(Boolean); return m ? (m.length > 3 ? Number(m[3]) : 1) : 0; };
            const rule = tr => cs(tr).boxShadow + ' ' + cs(tr.firstElementChild).boxShadow;
            t.ok(trs.length === 4 && trs[1].dataset.tone === 'warning' && trs[0].dataset.tone === undefined, `${at}: tone reaches the row as data-tone`);
            t.ok(alpha(cs(trs[0]).backgroundColor) === 0 && alpha(cs(trs[1]).backgroundColor) > 0, `${at}: a toned row is tinted, a plain one is not`);
            t.ok(/inset/.test(rule(trs[1])) && !/inset/.test(rule(trs[0])), `${at}: only the toned row has the leading rule`);
            t.ok(rule(trs[1]) !== rule(trs[3]), `${at}: tones differ in colour`);
            const left = tr => { if (width < 640) return tr.getBoundingClientRect().left; const r = d.createRange(); r.selectNodeContents(tr.firstElementChild); return r.getBoundingClientRect().left; };
            t.ok(left(trs[2]) - left(trs[0]) >= 8, `${at}: indent moves the row in (${Math.round(left(trs[2]) - left(trs[0]))}px)`);
            fr.remove();
        }
    }],
);

// Issue 1674: pk-label-sheet cells have physical sizes. 1 CSS inch is 96px, 1mm is 96/25.4px, 1pt is 96/72px (the suite measures screen scale).
layoutCases.push(
    ['label-sheet: a cell is cell-width x cell-height in mm, in and pt, within half a pixel', async t => {
        for (const [w, h, pw, ph] of [['50mm', '25mm', 50 * 96 / 25.4, 25 * 96 / 25.4], ['2in', '1in', 192, 96], ['150pt', '60pt', 200, 80]]) {
            const s = await t.mount(`<pk-label-sheet cell-width="${w}" cell-height="${h}"><div>a</div></pk-label-sheet>`);
            await t.settle();
            const r = s.children[0].getBoundingClientRect();
            t.ok(Math.abs(r.width - pw) < 0.5 && Math.abs(r.height - ph) < 0.5, `${w} x ${h} measures ${r.width} x ${r.height}, wanted ${pw} x ${ph}`);
            s.remove();
        }
    }],
    ['label-sheet: columns=3 puts three cells on a row, the fourth on the next, and the gap is the distance between them', async t => {
        const s = await t.mount('<pk-label-sheet cell-width="20mm" cell-height="10mm" columns="3" gap="2mm">' + '<div>x</div>'.repeat(4) + '</pk-label-sheet>');
        await t.settle();
        const r = [...s.children].map(c => c.getBoundingClientRect()), mm = 96 / 25.4;
        t.ok(r[0].top === r[1].top && r[1].top === r[2].top, 'three share a row');
        t.ok(r[3].top > r[0].top && Math.abs(r[3].left - r[0].left) < 0.5, 'the fourth starts a new row at the left');
        t.ok(Math.abs(r[1].left - r[0].right - 2 * mm) < 0.5, 'the column gap is 2mm');
        t.ok(Math.abs(r[3].top - r[0].bottom - 2 * mm) < 0.5, 'the row gap is 2mm');
        s.remove();
    }],
    ['label-sheet: columns=0 fits floor((W+gap)/(cell+gap)) cells, and offset-x moves the origin', async t => {
        const s = await t.mount('<pk-label-sheet cell-width="30mm" cell-height="10mm" gap="2mm" offset-x="5mm">' + '<div>x</div>'.repeat(8) + '</pk-label-sheet>');
        await t.settle();
        const mm = 96 / 25.4, kids = [...s.children].map(c => c.getBoundingClientRect()), box = s.getBoundingClientRect();
        const perRow = kids.filter(k => k.top === kids[0].top).length;
        t.eq(perRow, Math.min(8, Math.max(1, Math.floor((box.width + 2 * mm) / (32 * mm)))), 'cells per row');
        t.ok(Math.abs(kids[0].left - box.left) < 0.5, 'the first cell starts at the host edge (the offset is the host margin)');
        t.ok(Math.abs(box.left - s.parentElement.getBoundingClientRect().left - 5 * mm) < 0.5 || getComputedStyle(s).marginInlineStart !== '0px', 'offset-x is applied as the start margin');
        s.remove();
    }],
    ['label-sheet: every cell keeps break-inside avoid, an oversize child is clipped and marked, a bad length falls back', async t => {
        const s = await t.mount('<pk-label-sheet cell-width="bad" cell-height="10mm"><div>' + 'wide '.repeat(200) + '</div></pk-label-sheet>');
        await t.settle();
        const c = s.children[0];
        t.eq(getComputedStyle(c).breakInside, 'avoid', 'break-inside');
        t.ok(Math.abs(c.getBoundingClientRect().width - 50 * 96 / 25.4) < 0.5, 'the bad width fell back to 50mm');
        t.ok(c.hasAttribute('data-clipped'), 'the oversize child is marked data-clipped');
        s.remove();
    }],
);

// Full-height list page: pk-app-shell[contain] + pk-list-page (pinned header, title bar, before-list alert, selectable table with a bulk bar, 50 rows, pager), plain and inside <pk-loading-overlay fill> (#1705).
// Only the rows scroll; everything else keeps its rect. The fixture (list-fill-frame.html) opens in an iframe of the width under test.
// Shapes: the page alone, inside a busy overlay, and inside the overlay under the <main> the Blazor PkApp draws (#1716).
for (const shape of [{}, { overlay: 1 }, { overlay: 1, wrap: 'main' }]) layoutCases.push(
    [`full-height list page${shape.overlay ? ' inside a busy loading-overlay fill' : ''}${shape.wrap ? ' under a <' + shape.wrap + '>' : ''}: the document does not scroll, the table's scroll part is the only scroller, the pinned parts keep their rects while the rows scroll, the pager is flush with the shell body (1280 and 375)`, async t => {
        for (const width of [1280, 375]) {
            const host = t.stage(''), fr = document.createElement('iframe'), at = `${width}px${shape.overlay ? ' busy' : ''}${shape.wrap ? ' ' + shape.wrap : ''}`, overlay = !!shape.overlay;
            fr.title = `list page at ${width}px`; fr.style.cssText = `width:${width}px;height:700px;border:0;display:block`;
            fr.src = new URL('./list-fill-frame.html', import.meta.url).href + '?' + new URLSearchParams(Object.fromEntries(Object.entries(shape).map(([k, v]) => [k, v === 1 ? '' : v]))).toString();
            await new Promise(resolve => { fr.addEventListener('load', resolve, { once: true }); host.append(fr); });
            const win = fr.contentWindow, d = win.document, wait = ms => new Promise(r => setTimeout(r, ms)), r = el => { const b = el.getBoundingClientRect(); return `${Math.round(b.x * 10) / 10},${Math.round(b.y * 10) / 10},${Math.round(b.width * 10) / 10},${Math.round(b.height * 10) / 10}`; };
            await Promise.all(['pk-app-shell', 'pk-list-page', 'pk-data-table', 'pk-table', 'pk-page-shell', 'pk-pagination', ...(overlay ? ['pk-loading-overlay'] : [])].map(tag => win.customElements.whenDefined(tag)));
            const shell = d.querySelector('pk-app-shell'), list = d.querySelector('pk-list-page'), dt = list.part('table');
            let tbl = null;
            for (let i = 0; i < 150 && !(tbl = dt.part('table')) ; i++) await wait(40);
            for (let i = 0; i < 150 && !tbl.shadowRoot?.querySelector('[part=body] tr[data-key], [part=body] tr'); i++) await wait(40);
            await wait(300);
            const scroll = tbl.part('scroll'), box = tbl.part('bulk');
            // select a row so the bulk bar shows
            const cb = tbl.shadowRoot.querySelector('[data-select]') ?? scroll.querySelector('[data-select]');
            cb?.click(); await wait(200);
            t.ok(!box.hidden, `${at}: the bulk bar is shown after a row is selected`);
            const pager = dt.shadowRoot.querySelector('pk-pagination'), head = tbl.shadowRoot.querySelector('thead th'), alert = list.querySelector('[slot=before-list]'), title = list.part('header').part('header') ?? list.part('header');
            t.ok(!!pager && !!head && !!title, `${at}: pager, column header and title bar are there`);
            const pinned = { title, alert, head, box, pager }, before = Object.fromEntries(Object.entries(pinned).map(([k, el]) => [k, r(el)]));
            const body = shell.shadowRoot.querySelector('[part=body]'), bcs = win.getComputedStyle(body);
            const firstRow = tbl.shadowRoot.querySelector('tbody tr'), rowTop = firstRow.getBoundingClientRect().top;
            t.ok(scroll.scrollHeight > scroll.clientHeight + 100, `${at}: the rows overflow the scroll part (${scroll.scrollHeight} vs ${scroll.clientHeight})`);
            scroll.scrollTop = 400; await wait(200);
            t.ok(scroll.scrollTop > 300, `${at}: the scroll part scrolled (${scroll.scrollTop})`);
            for (const [k, el] of Object.entries(pinned)) t.eq(r(el), before[k], `${at}: the ${k} keeps its rect while the rows scroll`);
            t.ok(Math.abs(firstRow.getBoundingClientRect().top - rowTop) > 300, `${at}: only the row positions change`);
            const de = d.documentElement;
            t.ok(de.scrollHeight <= de.clientHeight && d.body.scrollHeight <= d.body.clientHeight && win.scrollY === 0, `${at}: the document and body do not scroll (${de.scrollHeight}/${de.clientHeight})`);
            t.ok(body.scrollHeight <= body.clientHeight + 1, `${at}: the shell body does not scroll (${body.scrollHeight}/${body.clientHeight})`);
            const content = body.getBoundingClientRect().bottom - parseFloat(bcs.paddingBottom), pb = tbl.part('footer').getBoundingClientRect().bottom; // the footer bar (the pager plus its padding) is what ends flush (#1724)
            const gap = content - pb;
            t.ok(gap <= 1 && gap >= -1, `${at}: the pager bar's bottom (${pb}) is ${gap}px from the shell body's content bottom (${content}); it must be flush`);
            const scrollers = [];
            const walk = root => { for (const el of root.querySelectorAll('*')) { if (el.shadowRoot) walk(el.shadowRoot); const cs = win.getComputedStyle(el); if (/(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 1) scrollers.push(el.localName + (el.getAttribute('part') ? `[${el.getAttribute('part')}]` : '')); } };
            walk(d);
            t.eq(scrollers.join('|'), 'div[scroll]', `${at}: the table's scroll part is the only element that overflows vertically`);
            fr.remove();
        }
    }],
);

// #1723: config.toolbarInHeader puts the breadcrumb and heading in the data table's toolbar row, so the title bar, the search box, Filters and the actions share one row on a wide window and wrap
// (nothing clipped, nothing scrolling sideways) on a phone; the page-shell header is gone.
layoutCases.push(
    ['list page toolbarInHeader: the breadcrumb, heading, search box, Filters and the action share one row at 1280, wrap without clipping at 375, and the page-shell header is not drawn', async t => {
        for (const width of [1280, 375]) {
            const host = t.stage(''), fr = document.createElement('iframe'), at = `${width}px`;
            fr.title = `toolbar in header at ${width}px`; fr.style.cssText = `width:${width}px;height:700px;border:0;display:block`;
            fr.src = new URL('./list-fill-frame.html', import.meta.url).href + '?bar=1';
            await new Promise(resolve => { fr.addEventListener('load', resolve, { once: true }); host.append(fr); });
            const win = fr.contentWindow, d = win.document, wait = ms => new Promise(r => setTimeout(r, ms));
            await Promise.all(['pk-list-page', 'pk-data-table', 'pk-table', 'pk-breadcrumb', 'pk-heading', 'pk-table-filters'].map(tag => win.customElements.whenDefined(tag)));
            const list = d.querySelector('pk-list-page'), dt = list.part('table');
            for (let i = 0; i < 150 && !dt.part('table')?.shadowRoot?.querySelector('[part=body] tr'); i++) await wait(40);
            await wait(300);
            const rect = el => el.getBoundingClientRect(), crumb = dt.querySelector('pk-breadcrumb'), head = dt.querySelector('slot[name=title] pk-heading, pk-heading'), filters = dt.part('filters'), search = filters.shadowRoot.querySelector('[part=search]'), act = list.part('actions').firstElementChild ?? dt.part('actions') ;
            const header = list.part('header'), newBtn = d.querySelector('pk-list-page') && dt.part('actions').querySelector('pk-button, slot') ? dt.part('actions') : act;
            t.ok(!!crumb && !!head && !!search, `${at}: the breadcrumb, the heading and the search box are there`);
            t.ok(getComputedStyle(header).display === 'none' || header.getAttribute('data-bare') === 'true' || rect(header).height < 2, `${at}: the page-shell header is not drawn (${Math.round(rect(header).height)}px)`);
            const c = rect(crumb), h = rect(head), s = rect(search), a = rect(dt.part('actions'));
            if (width === 1280) {
                const mid = r => r.y + r.height / 2;
                t.ok(Math.abs(mid(c) - mid(s)) < 24 && Math.abs(mid(h) - mid(s)) < 24, `${at}: crumb (${Math.round(mid(c))}), heading (${Math.round(mid(h))}) and search (${Math.round(mid(s))}) share a row`);
                t.ok(c.right <= s.left + 1, `${at}: the title is left of the search box`);
                t.ok(a.right >= s.right && a.left >= s.left, `${at}: the action sits at the end of the row`);
            } else t.ok(s.top >= Math.min(c.bottom, h.bottom) - 1, `${at}: the search box wraps under the title`);
            for (const [k, r] of Object.entries({ crumb: c, heading: h, search: s, actions: a })) t.ok(r.left >= -1 && r.right <= width + 1 && r.width > 0, `${at}: the ${k} is inside the window (${Math.round(r.left)}-${Math.round(r.right)})`);
            t.ok(d.documentElement.scrollWidth <= width, `${at}: the page does not scroll sideways`);
            fr.remove();
        }
    }],
);

// #1726: a before-list region much taller than the window must not squeeze the rows to zero: it gives way (caps and scrolls) and the table keeps a usable height, the pager stays in view.
layoutCases.push(
    ['full-height list page with a tall before-list region (the Blazor u-contents wrapper): the rows keep a usable height, the before region caps and scrolls, the pager stays in view and the page does not collapse the rows (1280x700 and 375x600)', async t => {
        for (const [width, height] of [[1280, 700], [375, 600]]) {
            const host = t.stage(''), fr = document.createElement('iframe'), at = `${width}x${height}`;
            fr.title = `tall before-list at ${at}`; fr.style.cssText = `width:${width}px;height:${height}px;border:0;display:block`;
            fr.src = new URL('./list-fill-frame.html', import.meta.url).href + '?tall=1';
            await new Promise(resolve => { fr.addEventListener('load', resolve, { once: true }); host.append(fr); });
            const win = fr.contentWindow, d = win.document, wait = ms => new Promise(r => setTimeout(r, ms));
            await Promise.all(['pk-app-shell', 'pk-list-page', 'pk-data-table', 'pk-table', 'pk-page-shell', 'pk-pagination'].map(tag => win.customElements.whenDefined(tag)));
            const list = d.querySelector('pk-list-page'), dt = list.part('table');
            let tbl = null;
            for (let i = 0; i < 150 && !(tbl = dt.part('table')); i++) await wait(40);
            for (let i = 0; i < 150 && !tbl.shadowRoot?.querySelector('[part=body] tr'); i++) await wait(40);
            await wait(300);
            const scroll = tbl.part('scroll'), pager = dt.shadowRoot.querySelector('pk-pagination'), before = list.shadowRoot.querySelector('[part=before]'), tall = d.getElementById('tall');
            t.ok(!!before, `${at}: the before-list region is a part of the page`);
            const sh = scroll.getBoundingClientRect(), br = before.getBoundingClientRect(), pr = pager.getBoundingClientRect(), tr = tall.getBoundingClientRect();
            t.ok(sh.height >= 120, `${at}: the rows get ${Math.round(sh.height)}px (at least three rows, not zero)`);
            t.ok(br.height < tr.height - 50 || tall.scrollHeight <= before.clientHeight, `${at}: the before region (${Math.round(br.height)}px) gives way to its ${Math.round(tall.scrollHeight)}px of content`);
            t.ok(before.scrollHeight > before.clientHeight, `${at}: the capped before region scrolls (${before.scrollHeight} vs ${before.clientHeight})`);
            t.ok(pr.bottom <= height + 1 && pr.top >= 0, `${at}: the pager (${Math.round(pr.top)}-${Math.round(pr.bottom)}) is inside the ${height}px window`);
            t.ok(br.bottom <= sh.top + 1, `${at}: the before region ends above the rows`);
            fr.remove();
        }
    }],
);

// #1724: the pager footer of a list page is a bar of its own: padded and ruled off from the rows, centred, its page buttons have a resting surface and a boundary of at least 3:1 against the page in both themes,
// and the footer, the pager parts and the tokens are reachable from the page host.
layoutCases.push(
    ['list page pager footer: a ruled bar with block padding on both sides, page buttons with a visible resting boundary (3:1) in light and dark, footer and pager parts reachable with ::part from the page host, the tokens tune it', async t => {
        const lum = rgb => { const [r, g, b] = rgb.match(/[\d.]+/g).slice(0, 3).map(Number).map(v => { v /= rgb.startsWith('color(') ? 1 : 255; /* a color-mix result reads color(srgb 0-1 ...) */ return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
        const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
        for (const theme of ['light', 'dark']) {
            const host = t.stage(''), fr = document.createElement('iframe'), at = theme;
            fr.title = `pager footer ${theme}`; fr.style.cssText = 'width:900px;height:700px;border:0;display:block';
            fr.src = new URL('./list-fill-frame.html', import.meta.url).href + '?theme=' + theme;
            await new Promise(resolve => { fr.addEventListener('load', resolve, { once: true }); host.append(fr); });
            const win = fr.contentWindow, d = win.document, wait = ms => new Promise(r => setTimeout(r, ms));
            await Promise.all(['pk-app-shell', 'pk-list-page', 'pk-data-table', 'pk-table', 'pk-pagination'].map(tag => win.customElements.whenDefined(tag)));
            const list = d.querySelector('pk-list-page'), dt = list.part('table');
            let tbl = null;
            for (let i = 0; i < 150 && !(tbl = dt.part('table')); i++) await wait(40);
            for (let i = 0; i < 150 && !tbl.shadowRoot?.querySelector('[part=body] tr'); i++) await wait(40);
            await wait(400);
            const footer = tbl.part('footer'), pager = dt.shadowRoot.querySelector('pk-pagination'), cs = e => win.getComputedStyle(e);
            const fr0 = footer.getBoundingClientRect(), pr = pager.getBoundingClientRect(), sc = tbl.part('scroll').getBoundingClientRect();
            t.ok(parseFloat(cs(footer).borderTopWidth) >= 1, `${at}: the footer has a top rule (${cs(footer).borderTopWidth})`);
            t.ok(pr.top - fr0.top >= 8, `${at}: the pager is ${Math.round(pr.top - fr0.top)}px below the footer's top edge`);
            t.ok(fr0.bottom - pr.bottom >= 8, `${at}: the pager is ${Math.round(fr0.bottom - pr.bottom)}px above the footer's bottom edge`);
            t.ok(fr0.top >= sc.bottom - 1, `${at}: the footer starts where the rows end`);
            const btn = pager.shadowRoot.querySelector('[part=numbers] button:not([aria-current])') ?? pager.shadowRoot.querySelector('[part=next]'), bs = cs(btn);
            const page = cs(d.body).backgroundColor === 'rgba(0, 0, 0, 0)' ? cs(d.documentElement).backgroundColor : cs(d.body).backgroundColor;
            t.ok(bs.backgroundColor !== 'rgba(0, 0, 0, 0)', `${at}: the page buttons have a resting surface (${bs.backgroundColor})`);
            t.ok(ratio(bs.borderTopColor, page) >= 3, `${at}: the page button boundary ${bs.borderTopColor} is ${ratio(bs.borderTopColor, page).toFixed(2)}:1 against the page ${page} (needs 3:1)`);
            // reachable: the exported parts take a host rule, and the token tunes the padding
            const sheet = new win.CSSStyleSheet(); sheet.replaceSync('pk-list-page::part(footer) { margin-block-start: 31px; } pk-list-page::part(pager-prev) { outline-offset: 7px; } pk-list-page { --pk-table-footer-padding: 19px; }');
            d.adoptedStyleSheets = [sheet]; await wait(100);
            t.eq(cs(footer).marginTop, '31px', `${at}: pk-list-page::part(footer) reaches the table footer`);
            t.eq(cs(pager.shadowRoot.querySelector('[part=prev]')).outlineOffset, '7px', `${at}: pk-list-page::part(pager-prev) reaches the previous button`);
            t.eq(cs(footer).paddingTop, '19px', `${at}: --pk-table-footer-padding tunes the footer`);
            fr.remove();
        }
    }],
);

// #1736: Chrome maps the legacy presentational `align="center"` attribute to `text-align: center` on any element; `align` here is cross-axis alignment only, text stays inherited.
layoutCases.push(['align="center" on cluster, stack, field-row, container and form-actions never changes text-align (it stays inherited)', async t => {
    for (const tag of ['pk-cluster', 'pk-stack', 'pk-field-row', 'pk-container', 'pk-form-actions']) {
        for (const [parent, want] of [['start', 'start'], ['right', 'right']]) {
            const host = t.stage(`<${tag} align="center"><div>a label long enough to wrap</div></${tag}>`);
            host.style.textAlign = parent;
            await t.load(host);
            await t.settle();
            t.eq(getComputedStyle(host.firstElementChild).textAlign, want, `${tag} align="center" under a text-align:${parent} parent keeps ${want}`);
        }
    }
}]);

// Issues 1718 and 1722: the pk-grid tablet step, fill and rows, and the data-show-above / data-hide-above helper, in an iframe of the width and height under test (the media queries answer to the frame).
async function gridFrame(t, v, width, height = 600) {
    const host = t.stage(''), fr = document.createElement('iframe');
    fr.title = `grid ${v} at ${width}px`; fr.style.cssText = `width:${width}px;height:${height}px;border:0;display:block`;
    fr.src = new URL(`./grid-frame.html?v=${v}`, import.meta.url).href;
    await new Promise(resolve => { fr.addEventListener('load', resolve, { once: true }); host.append(fr); });
    const win = fr.contentWindow; if (v !== 'show') await win.customElements.whenDefined('pk-grid'); await new Promise(r => setTimeout(r, 80));
    return { fr, d: win.document, win, cols: () => win.getComputedStyle(win.document.getElementById('g')).gridTemplateColumns.split(' ').length, rect: el => el.getBoundingClientRect() };
}
layoutCases.push(
    ['grid: tablet-tracks halves a 12-track grid and its spans at 1024 and 768, leaves it at 1280, and a phone stacks (#1718)', async t => {
        for (const [width, cols] of [[1280, 12], [1024, 6], [768, 6], [375, 1]]) {
            const f = await gridFrame(t, 'tablet', width), g = f.d.getElementById('g'), [a, b] = [...g.children], at = `${width}px`;
            t.eq(f.cols(), cols, `${at}: ${cols} column track(s)`);
            if (width === 1024 || width === 768) t.ok(Math.abs(f.rect(a).width - f.rect(g).width / 2) < 2 && f.rect(b).left > f.rect(a).left, `${at}: span 6 halves to span 3 of 6, so two cells share the row`);
            if (width === 1280) t.ok(Math.abs(f.rect(a).width - f.rect(g).width / 2) < 2, `${at}: span 6 of 12 is half`);
            if (width === 375) t.ok(f.rect(b).top >= f.rect(a).bottom - 1, `${at}: children stack`);
            f.fr.remove();
        }
    }],
    ['grid: stack-below="tablet" stacks at 1024 and 768 and not at 1280 (#1718)', async t => {
        for (const [width, stacked] of [[1280, false], [1024, true], [768, true], [375, true]]) {
            const f = await gridFrame(t, 'stack', width), [a, b] = [...f.d.getElementById('g').children];
            t.eq(f.rect(b).top >= f.rect(a).bottom - 1, stacked, `${width}px: ${stacked ? 'stacked' : 'side by side'}`);
            f.fr.remove();
        }
    }],
    ['grid: fill takes the remaining height under a header and rows share it by weight; a phone drops both (#1722)', async t => {
        for (const width of [1280, 375]) {
            const f = await gridFrame(t, 'fill', width, 600), g = f.d.getElementById('g'), bar = f.d.getElementById('bar'), cells = [...g.children];
            if (width === 1280) {
                t.ok(Math.abs(f.rect(g).bottom - 600) < 2 && Math.abs(f.rect(g).top - f.rect(bar).bottom) < 2, 'the grid ends at the bottom of the frame, right under the header');
                const h1 = f.rect(cells[0]).height, h2 = f.rect(cells[2]).height;
                t.ok(Math.abs(h2 - 3 * h1) < 2, `rows 1fr and 3fr share the height (${Math.round(h1)}px and ${Math.round(h2)}px)`);
                t.ok(f.d.documentElement.scrollHeight <= 600, 'no page scroll');
            } else t.ok(f.rect(g).height < 400 && f.rect(cells[1]).top >= f.rect(cells[0]).bottom - 1, '375px: sized to content and stacked');
            f.fr.remove();
        }
    }],
    ['fill-column: the fixed region is the fixed height, the rest ends at the column bottom and scrolls on its own, the fixed region does not move; with nothing fixed the rest takes it all (#1675)', async t => {
        const host = t.stage('<pk-fill-column fixed="120px" gap="none"><div slot="fixed" id="fc-preview">Preview</div><div id="fc-list">List</div></pk-fill-column>');
        host.style.blockSize = '400px'; host.style.inlineSize = '300px';
        await t.load(host);
        const el = host.querySelector('pk-fill-column'), preview = host.querySelector('#fc-preview');
        host.querySelector('#fc-list').style.blockSize = '2000px';
        await t.settle();
        const fixed = el.shadowRoot.querySelector('[part="fixed"]'), rest = el.shadowRoot.querySelector('[part="rest"]'), r = x => x.getBoundingClientRect();
        t.ok(Math.abs(r(el).height - 400) <= 1, `the column takes its parent's height (${Math.round(r(el).height)}px)`);
        t.ok(Math.abs(r(fixed).height - 120) <= 1, `the fixed region is 120px (${Math.round(r(fixed).height)}px)`);
        t.ok(Math.abs(r(rest).top - r(fixed).bottom) <= 1 && Math.abs(r(rest).bottom - r(el).bottom) <= 1, 'the rest starts under the fixed region and ends at the column bottom');
        const top = r(preview).top; rest.scrollTop = 500; await t.settle();
        t.ok(rest.scrollTop > 0, 'the rest scrolls on its own');
        t.ok(Math.abs(r(preview).top - top) <= 1, 'the fixed region does not move');
        preview.remove(); await t.settle();
        t.ok(fixed.hidden && Math.abs(r(rest).height - 400) <= 1, 'with nothing in the fixed slot the region is hidden and the rest takes the whole height');
    }],
    ['data-show-above and data-hide-above show and hide content at the named breakpoints (#1722)', async t => {
        for (const [width, shown] of [[1280, ['above-tablet', 'above-phone']], [768, ['below-tablet', 'above-phone']], [375, ['below-tablet', 'phone-only']]]) {
            const f = await gridFrame(t, 'show', width);
            for (const id of ['above-tablet', 'below-tablet', 'above-phone', 'phone-only']) t.eq(f.win.getComputedStyle(f.d.getElementById(id)).display !== 'none', shown.includes(id), `${width}px: ${id}`);
            f.fr.remove();
        }
    }],
    ['grid: sticky-first keeps the first child in view 1rem from the top after an 800px scroll, mirrors in RTL, and a phone stacks it so it scrolls away (#1675)', async t => {
        for (const [width, dir] of [[1280, 'ltr'], [1280, 'rtl'], [375, 'ltr']]) {
            const f = await gridFrame(t, 'sticky', width, 600), g = f.d.getElementById('g'), nav = f.d.getElementById('nav'), art = f.d.getElementById('art'), at = `${width}px ${dir}`;
            g.setAttribute('dir', dir); f.win.scrollTo(0, 800); await new Promise(r => f.win.requestAnimationFrame(() => f.win.requestAnimationFrame(r)));
            const top = parseFloat(f.win.getComputedStyle(f.d.documentElement).fontSize);
            if (width === 1280) {
                t.ok(Math.abs(f.rect(nav).top - top) <= 1, `${at}: the nav top is ${Math.round(f.rect(nav).top)}px, expected ${top}px (the sticky offset)`);
                t.ok(Math.abs(f.rect(nav).height - 120) <= 1, `${at}: the nav keeps its own height (align-self start), not the row height`);
                t.ok(dir === 'rtl' ? f.rect(nav).left >= f.rect(art).right - 1 : f.rect(nav).right <= f.rect(art).left + 1, `${at}: the nav is on the start side of the article`);
            } else t.ok(f.rect(nav).bottom < 0, `${at}: stacked, the nav scrolled away with the page (bottom ${Math.round(f.rect(nav).bottom)}px)`);
            f.fr.remove();
        }
    }],
);
