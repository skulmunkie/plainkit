// Browser cases for the marketing blocks (#1838, spec docs/superpowers/specs/2026-11-03-marketing-blocks-design.md). Same contract as cases.js: [name, async (t) => void].
const wait = ms => new Promise(r => setTimeout(r, ms));
const box = el => el.getBoundingClientRect();
const frame = async (t, w, hold) => {
    const host = t.stage(''), f = document.createElement('iframe');
    f.title = 'quote fixture';
    f.style.cssText = `width:${w}px;height:500px;border:0;display:block`;
    f.src = new URL(`./quote-frame.html${hold ? '?hold=pk-quote' : ''}`, import.meta.url).href;
    await new Promise(resolve => { f.addEventListener('load', resolve, { once: true }); host.append(f); });
    await wait(400);
    return f.contentWindow;
};

export const marketingCases = [
    ['quote: a shadow figure wraps the slotted blockquote; the portrait and the name share a row and the caption sits under the quote, with no overflow, at 375 and 1280', async t => {
        for (const w of [375, 1280]) {
            const host = t.stage(`<div style="width:${w}px"><pk-quote id="q"><blockquote><p>Fast delivery and the fit was perfect.</p></blockquote><span slot="portrait" id="pt" style="display:inline-block;width:40px;height:40px">P</span><span slot="name">Alex Roe</span><span slot="role">Customer since 2023</span></pk-quote></div>`);
            await t.load(host); await t.settle(); await wait(80);
            const q = host.querySelector('#q'), root = q.shadowRoot, fig = root.querySelector('figure[part="figure"]'), cap = root.querySelector('figcaption[part="caption"]');
            t.ok(!!fig && !!cap, `at ${w}px the shadow tree is a figure with a figcaption`);
            const bq = q.querySelector('blockquote'), name = q.querySelector('[slot="name"]'), pt = q.querySelector('#pt');
            t.ok(bq.assignedSlot === root.querySelector('slot:not([name])') && root.querySelector('slot:not([name])').closest('figure') === fig, `at ${w}px the author's blockquote is slotted inside the figure`);
            t.ok(Math.abs((box(pt).top + box(pt).height / 2) - (box(name).top + box(name).height / 2)) < box(pt).height, `at ${w}px the portrait and the name share a row`);
            t.ok(box(name).left >= box(pt).right - 0.5, `at ${w}px the name follows the portrait`);
            t.ok(box(cap).top >= box(bq).bottom - 0.5, `at ${w}px the caption is under the quote`);
            t.ok(box(q).width <= w + 0.5 && q.scrollWidth <= q.clientWidth + 1, `at ${w}px nothing overflows the quote (${q.scrollWidth} in ${q.clientWidth})`);
            t.eq(getComputedStyle(q).display, 'block', `at ${w}px the host is a block`);
        }
    }],
    ['quote: the cite prop renders one source link in the caption, an unsafe URL renders none, and the author markup is unchanged', async t => {
        const host = t.stage('<pk-quote id="a" cite="https://example.com/review/42"><blockquote><p>Good.</p></blockquote><span slot="name">A</span></pk-quote><pk-quote id="b" cite="data:text/html,x"><blockquote><p>Good.</p></blockquote></pk-quote>');
        const before = host.querySelector('#a').innerHTML;
        await t.load(host); await t.settle(); await wait(80);
        const link = id => host.querySelector(id).shadowRoot.querySelector('a[part="source"]');
        t.eq(link('#a')?.getAttribute('href'), 'https://example.com/review/42', 'a valid cite is the source link');
        t.ok(!link('#b').hasAttribute('href') && link('#b').hidden, 'an unsafe cite renders no visible link');
        t.eq(host.querySelector('#a').innerHTML, before, 'the host left the author children unchanged');
    }],
    ['quote: with the element not defined (no JavaScript yet) the blockquote and its caption text are visible; defining it keeps the author nodes and moves nothing by 1.5px or more, at 375 and 1280 (#1838)', async t => {
        for (const w of [375, 1280]) {
            const win = await frame(t, w, true), d = win.document;
            t.ok(!win.customElements.get('pk-quote'), 'pk-quote is not defined');
            const q = d.querySelector('#q1'), bq = q.querySelector('blockquote'), after = d.querySelector('#after');
            const r = box(bq);
            t.ok(r.width > 0 && r.height > 0 && getComputedStyle(bq).visibility === 'visible', `at ${w}px the plain blockquote is visible (${r.width.toFixed(0)}x${r.height.toFixed(0)})`);
            const html = q.innerHTML, qb = box(q), top = box(after).top, bqb = box(bq);
            win.release(); await Promise.race([win.customElements.whenDefined('pk-quote'), wait(5000)]); await wait(300);
            t.ok(!!win.customElements.get('pk-quote'), 'pk-quote is defined now');
            t.eq(q.innerHTML, html, `at ${w}px defining the element left the author children unchanged`);
            t.ok(q.querySelector('blockquote') === bq, 'it is the same blockquote node');
            const qa = box(q), bqa = box(bq);
            t.ok(Math.abs(qa.height - qb.height) < 1.5 && Math.abs(qa.width - qb.width) < 1.5, `at ${w}px the quote went from ${qb.width.toFixed(1)}x${qb.height.toFixed(1)} to ${qa.width.toFixed(1)}x${qa.height.toFixed(1)}, expected the same. FIX: reserve the box with pk-quote:not(:defined) in base.css`);
            t.ok(Math.abs(bqa.left - bqb.left) < 1.5 && Math.abs(bqa.top - bqb.top) < 1.5, `at ${w}px the blockquote moved ${(bqa.left - bqb.left).toFixed(1)}, ${(bqa.top - bqb.top).toFixed(1)}`);
            t.ok(Math.abs(box(after).top - top) < 1.5, `at ${w}px the content under the quote moved ${(box(after).top - top).toFixed(1)}px when it upgraded`);
        }
    }],
];
