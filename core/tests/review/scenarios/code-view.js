// pk-code-view (issue 393): many lines in a height-capped view with one highlighted line far down (it is scrolled into the middle of the view, not left
// below the fold), a line much longer than the box (the view scrolls sideways instead of wrapping) and a view that starts at line 120 (a wider gutter).
const BODY = '#v >>> [part=body]';
const HL = '#v >>> .row.hl';
const LONG = 'const message = "' + 'a very long line that must scroll sideways instead of wrapping '.repeat(6) + '";';
const LINES = Array.from({ length: 80 }, (_, i) => (i === 3 ? LONG : `line ${i + 1}: const value${i + 1} = compute(${i + 1});`)).join('\n');

export default {
    name: 'code-view',
    issue: [393, 1523],
    elements: ['code-view'],
    html: `<div id="stage" class="u-p-1r-1p25r">
<pk-code-view id="v" label="example.js" highlight="40" max-height="14rem">${LINES}</pk-code-view>
<pk-code-view id="w" label="slice.js" start="120" highlight="121-122" max-height="8rem" class="u-mt-1r">alpha();
beta();
gamma();
delta();</pk-code-view>
</div>
<div id="hbox" class="rv-bounded u-mt-1r"><pk-code-view id="h" fill header label="src/Orders/OrderService.cs" language="C#" highlight="3"><pk-badge slot="header-start">read-only</pk-badge><pk-button slot="actions" size="mini" variant="ghost">Outline</pk-button><pk-button slot="actions" size="mini" variant="ghost">Usages of Total</pk-button>${LINES}</pk-code-view></div>
<div id="box" class="rv-bounded u-mt-1r"><pk-code-view id="f" fill label="fill.js" max-height="4rem">${LINES}</pk-code-view></div>`,
    steps: [{ shot: 'highlight' }, { scroll: '#f >>> [part=body]', to: 400 }, { shot: 'fill-scrolled' }, { scroll: '#h >>> [part=body]', to: 300 }, { shot: 'header' }],
    expect(t) {
        t.visible(BODY, 'the scrolling body'); t.visible(HL, 'the highlighted line');
        t.ok(t.metric(BODY, 'scrollTop') > 0, 'the highlighted line was not scrolled into view: the body is still at the top');
        // Rows are as wide as their longest text, so only the vertical position says whether the line is in view.
        const hl = t.rect(HL), body = t.rect(BODY);
        if (hl && body) t.ok(hl.y >= body.y - 1 && hl.y + hl.height <= body.y + body.height + 1, `the highlighted line (y ${Math.round(hl.y)}, height ${Math.round(hl.height)}) is outside the body (y ${Math.round(body.y)}, height ${Math.round(body.height)})`);
        t.ok(t.metric(BODY, 'scrollWidth') > t.metric(BODY, 'clientWidth') + 1, 'a long line does not scroll sideways: the body is not wider than its box');
        t.visible('#w >>> .row.hl', 'the highlighted line of the slice');
        t.ok(t.text('#w >>> .row') === 'alpha();', 'the slice shows the code text');
        // Fill (#1523): the view is as tall as its bounded container (max-height ignored) and its body scrolls inside, the container does not.
        t.visible('#f >>> [part=body]', 'the fill view body');
        const box = t.rect('#box'), host = t.rect('#f');
        if (box && host) t.ok(Math.abs(host.height - box.height) <= 2 + 2, `the fill view (height ${Math.round(host.height)}) does not take its container's height (${Math.round(box.height)})`);
        t.ok(t.metric('#f >>> [part=body]', 'scrollHeight') > t.metric('#f >>> [part=body]', 'clientHeight') + 1, 'the fill view body does not scroll: the lines are not taller than the view');
        t.ok(t.metric('#box', 'scrollHeight') <= t.metric('#box', 'clientHeight') + 1, 'the container scrolls: the fill view grew past it');
        // Header (#1523): the title, language, count and both slots sit in one bar inside the host, which does not overflow.
        t.visible('#h >>> .header', 'the header'); t.visible('#h >>> .count', 'the line count'); t.visible('#h [slot=actions]', 'an action');
        t.within('#h [slot=actions]', '#h >>> .header'); t.within('#h [slot=header-start]', '#h >>> .header');
        t.ok(t.metric('#h >>> .header', 'scrollWidth') <= t.metric('#h >>> .header', 'clientWidth') + 1, 'the header overflows sideways');
        t.ok(t.text('#h >>> .count') === '80 lines', 'the line count is not derived from the lines');
        if (t.shot === 'fill-scrolled') t.ok(t.metric('#f >>> [part=body]', 'scrollTop') > 0, 'the fill view body did not scroll');
    },
};
