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
];
