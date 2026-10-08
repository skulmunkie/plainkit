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

    ['detail-layout: sidebarFirst reorders the sidebar before the main content once collapsed; sidebarTwoUp lays its own cards two per row', async t => {
        const el = await t.mount('<pk-detail-layout sidebar-first sidebar-two-up><p>Main</p><div slot="sidebar"><p>A</p><p>B</p></div></pk-detail-layout>');
        size(el, rem(30)); await t.settle();
        t.ok(el.part('main').getBoundingClientRect().top > el.part('sidebar').getBoundingClientRect().top, 'sidebarFirst: the sidebar sits above the main content once stacked');
        t.eq(getComputedStyle(el.part('sidebar')).gridTemplateColumns.trim().split(' ').length, 2, 'sidebarTwoUp: two columns of cards inside the collapsed sidebar');
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
        } finally { window.scrollTo(0, 0); }

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
