// pk-code-view (issue 393): many lines in a height-capped view with one highlighted line far down (it is scrolled into the middle of the view, not left
// below the fold), a line much longer than the box (the view scrolls sideways instead of wrapping) and a view that starts at line 120 (a wider gutter).
const BODY = '#v >>> [part=body]';
const HL = '#v >>> .row.hl';
const LONG = 'const message = "' + 'a very long line that must scroll sideways instead of wrapping '.repeat(6) + '";';
const LINES = Array.from({ length: 80 }, (_, i) => (i === 3 ? LONG : `line ${i + 1}: const value${i + 1} = compute(${i + 1});`)).join('\n');

export default {
    name: 'code-view',
    issue: [393],
    elements: ['code-view'],
    html: `<div id="stage" class="u-p-1r-1p25r">
<pk-code-view id="v" label="example.js" highlight="40" max-height="14rem">${LINES}</pk-code-view>
<pk-code-view id="w" label="slice.js" start="120" highlight="121-122" max-height="8rem" class="u-mt-1r">alpha();
beta();
gamma();
delta();</pk-code-view>
</div>`,
    steps: [{ wait: 200 }, { shot: 'highlight' }],
    expect(t) {
        t.visible(BODY, 'the scrolling body'); t.visible(HL, 'the highlighted line');
        t.ok(t.metric(BODY, 'scrollTop') > 0, 'the highlighted line was not scrolled into view: the body is still at the top');
        // Rows are as wide as their longest text, so only the vertical position says whether the line is in view.
        const hl = t.rect(HL), body = t.rect(BODY);
        if (hl && body) t.ok(hl.y >= body.y - 1 && hl.y + hl.height <= body.y + body.height + 1, `the highlighted line (y ${Math.round(hl.y)}, height ${Math.round(hl.height)}) is outside the body (y ${Math.round(body.y)}, height ${Math.round(body.height)})`);
        t.ok(t.metric(BODY, 'scrollWidth') > t.metric(BODY, 'clientWidth') + 1, 'a long line does not scroll sideways: the body is not wider than its box');
        t.visible('#w >>> .row.hl', 'the highlighted line of the slice');
        t.ok(t.text('#w >>> .row') === 'alpha();', 'the slice shows the code text');
    },
};
