// Marketing sections pattern (issue 1838): the logo strip must render visible, equal, tappable logos (it once rendered them at 0x0).
export default {
    name: 'marketing-sections',
    issue: [1838],
    elements: ['grid', 'media'],
    html: `<div class="u-p-1r-1p25r">
<pk-stack gap="sm">
<pk-text variant="eyebrow">Trusted by teams at</pk-text>
<pk-grid id="strip" min="9rem" gap="md">
<a href="#acme" aria-label="Acme"><pk-media ratio="3/1"><svg viewBox="0 0 3 1" role="img" aria-label="Acme logo"><rect width="3" height="1" fill="currentColor" opacity="0.15"></rect></svg></pk-media></a>
<a href="#globex" aria-label="Globex"><pk-media ratio="3/1"><svg viewBox="0 0 3 1" role="img" aria-label="Globex logo"><rect width="3" height="1" fill="currentColor" opacity="0.15"></rect></svg></pk-media></a>
<a href="#initech" aria-label="Initech"><pk-media ratio="3/1"><svg viewBox="0 0 3 1" role="img" aria-label="Initech logo"><rect width="3" height="1" fill="currentColor" opacity="0.15"></rect></svg></pk-media></a>
</pk-grid>
</pk-stack>
</div>`,
    steps: [{ shot: 'rest' }],
    expect(t) {
        for (const n of [1, 2, 3]) {
            const a = t.rect(`#strip > a:nth-child(${n})`), m = t.rect(`#strip > a:nth-child(${n}) pk-media`);
            t.ok(!!a && a.width > 40 && a.height >= 44, `logo link ${n} is at least 44px high (${a ? a.width.toFixed(0) + 'x' + a.height.toFixed(0) : 'missing'})`);
            t.ok(!!m && m.width > 0 && m.height > 0, `logo ${n} has a size`);
            t.inViewport(`#strip > a:nth-child(${n})`);
        }
    },
};
