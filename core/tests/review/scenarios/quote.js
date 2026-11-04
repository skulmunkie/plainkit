// pk-quote (issue 1838): a grid of testimonials, the large size and a long name with a rating, light, dark, phone and right-to-left. The caption stays under its quote,
// inside the quote's box, and the large quote is bigger than the default one.
export default {
    name: 'quote',
    issue: [1838],
    elements: ['quote'],
    html: `<div id="stage" class="u-p-1r-1p25r">
<pk-grid min="16rem" gap="md">
<pk-quote id="q1"><blockquote><p>Fast delivery and the fit was perfect, and support answered the same day.</p></blockquote><pk-avatar slot="portrait" name="Alex Roe"></pk-avatar><span slot="name">Alex Roe</span><span slot="role">Customer since 2023</span><pk-rating slot="rating" readonly value="5" label="5 out of 5"></pk-rating></pk-quote>
<pk-quote id="q2" size="large" cite="https://example.com/review/42"><blockquote><p>The simplest setup we have shipped.</p></blockquote><span slot="name">Alexandra Montgomery-Whitfield</span><span slot="role">Head of Product, Example Industries International</span></pk-quote>
</pk-grid>
</div>`,
    steps: [
        { shot: 'ltr' },
        { set: '#stage', attr: 'dir', value: 'rtl' }, { shot: 'rtl' },
    ],
    expect(t) {
        for (const id of ['#q1', '#q2']) {
            t.visible(id, 'the quote');
            t.within(`${id} >>> [part=caption]`, id, 1);
            t.within(`${id} >>> [part=figure]`, id, 1);
        }
        const a = t.rect('#q1 blockquote'), b = t.rect('#q2 blockquote'), cap = t.rect('#q1 >>> [part=caption]');
        if (a && cap) t.ok(cap.y >= a.y + a.height - 1, 'the caption sits under its quote');
        const fs = id => parseFloat(t.style(id, 'font-size'));
        t.ok(fs('#q2 blockquote') > fs('#q1 blockquote') + 4, `the large quote text (${fs('#q2 blockquote')}px) is clearly bigger than the default (${fs('#q1 blockquote')}px)`);
        if (b) t.inViewport('#q2 blockquote');
    },
};
