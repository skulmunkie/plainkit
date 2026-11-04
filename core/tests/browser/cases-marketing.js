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

const bandFrame = async (t, w, hold) => {
    const host = t.stage(''), f = document.createElement('iframe');
    f.title = 'cta band fixture';
    f.style.cssText = `width:${w}px;height:600px;border:0;display:block`;
    f.src = new URL(`./cta-band-frame.html${hold ? '?hold=pk-cta-band' : ''}`, import.meta.url).href;
    await new Promise(resolve => { f.addEventListener('load', resolve, { once: true }); host.append(f); });
    await wait(400);
    return f.contentWindow;
};
const BAND = '<h2 slot="heading">Ready to start?</h2><p>Free for 30 days.</p><span slot="actions"><pk-button id="b1">Start free</pk-button><pk-button id="b2">Book a demo</pk-button></span>';

export const marketingCases = [
    ['cta-band: the heading, text and actions stack in the band; under 640px the actions are full width and 44px high, above they sit side by side', async t => {
        for (const w of [375, 1280]) {
            const win = await bandFrame(t, w, false), host = win.document;
            await win.customElements.whenDefined('pk-cta-band'); await win.customElements.whenDefined('pk-button'); await wait(200);
            const c = host.querySelector('#b1'), h = c.querySelector('h2'), p = c.querySelector('p'), a = c.querySelector('[slot=actions]');
            const extra = host.createElement('pk-button'); extra.setAttribute('block', ''); extra.textContent = 'Book a demo'; a.append(extra); await win.customElements.whenDefined('pk-button'); await wait(200);
            const [b1, b2] = c.querySelectorAll('pk-button');
            t.ok(box(p).top >= box(h).bottom - 0.5 && box(a).top >= box(p).bottom - 0.5, `at ${w}px the heading, the text and the actions stack in that order`);
            t.ok(box(c).width <= w + 0.5 && c.scrollWidth <= c.clientWidth + 1, `at ${w}px nothing overflows the band`);
            if (w < 640) {
                t.ok(Math.abs(box(b1).width - box(b2).width) < 1 && box(b1).width > w * 0.7 && box(b2).top >= box(b1).bottom - 0.5, `at ${w}px the two actions are full width, one under the other (${box(b1).width.toFixed(0)} wide)`);
                t.ok(box(b1.shadowRoot.querySelector('[part=control]')).width > w * 0.7, `at ${w}px the button itself, not only its host, is full width`);
                t.ok(box(b1).height >= 43.5, `at ${w}px an action is ${box(b1).height.toFixed(1)} high, the touch target is 44`);
            } else t.ok(Math.abs(box(b1).top - box(b2).top) < 2 && box(b2).left > box(b1).right - 0.5, `at ${w}px the actions sit side by side`);
            t.ok(getComputedStyle(c).backgroundColor !== 'rgba(0, 0, 0, 0)', `at ${w}px tone brand draws a surface`);
        }
    }],
    ['cta-band: align center centres the text and actions; bleed reaches both viewport edges inside a padded column; bleed adds no horizontal scroll', async t => {
        const win = await bandFrame(t, 375, false), d = win.document;
        await win.customElements.whenDefined('pk-cta-band'); await win.customElements.whenDefined('pk-button'); await wait(200);
        const n = d.querySelector('#b1'), h = n.querySelector('h2'), band = box(n);
        t.ok(Math.abs((box(h).left + box(h).right) / 2 - (band.left + band.right) / 2) < 40 || getComputedStyle(h).textAlign === 'center', 'align center centres the heading');
        t.eq(getComputedStyle(n.querySelector('p')).textAlign, 'center', 'align center centres the text');
        const e = box(d.querySelector('#b2'));
        t.ok(e.left <= 0.5 && Math.abs(e.right - d.documentElement.clientWidth) <= 1, `bleed reaches both viewport edges from inside a padded column (${e.left.toFixed(1)} to ${e.right.toFixed(1)} of ${d.documentElement.clientWidth})`);
        t.ok(d.documentElement.scrollWidth <= d.documentElement.clientWidth + 1, 'bleed adds no horizontal scroll');
    }],
    ['cta-band: with the element not defined (no JavaScript yet) the heading, text and links are visible; defining it keeps the author nodes and moves nothing by 1.5px or more, at 375 and 1280 (#1838)', async t => {
        for (const w of [375, 1280]) {
            const win = await bandFrame(t, w, true), d = win.document;
            t.ok(!win.customElements.get('pk-cta-band'), 'pk-cta-band is not defined');
            const q = d.querySelector('#b1'), h = q.querySelector('h2'), after = d.querySelector('#after');
            t.ok(box(h).height > 0 && getComputedStyle(h).visibility === 'visible' && box(q.querySelector('a, pk-button')).height > 0, `at ${w}px the heading and the actions are visible`);
            const html = q.innerHTML, qb = box(q), hb = box(h), top = box(after).top;
            win.release(); await Promise.race([win.customElements.whenDefined('pk-cta-band'), wait(5000)]); await wait(300);
            t.ok(!!win.customElements.get('pk-cta-band'), 'pk-cta-band is defined now');
            t.eq(q.innerHTML, html, `at ${w}px defining the element left the author children unchanged`);
            const qa = box(q), ha = box(h);
            t.ok(Math.abs(qa.height - qb.height) < 1.5 && Math.abs(qa.width - qb.width) < 1.5, `at ${w}px the band went from ${qb.width.toFixed(1)}x${qb.height.toFixed(1)} to ${qa.width.toFixed(1)}x${qa.height.toFixed(1)}, expected the same. FIX: reserve the box with pk-cta-band:not(:defined) in base.css`);
            t.ok(Math.abs(ha.top - hb.top) < 1.5, `at ${w}px the heading moved ${(ha.top - hb.top).toFixed(1)}px`);
            t.ok(Math.abs(box(after).top - top) < 1.5, `at ${w}px the content under the band moved ${(box(after).top - top).toFixed(1)}px when it upgraded`);
        }
    }],
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
    ['quote: the cite prop renders one source link in the caption, an unsafe URL renders none, and bleed adds no horizontal scroll', async t => {
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
    ['logo strip recipe (pk-grid of links around pk-media): every logo has a size, the links are at least 44px high and nothing overflows, at 375 and 1280 (#1838)', async t => {
        for (const w of [375, 1280]) {
            const host = t.stage(''), f = document.createElement('iframe');
            f.title = 'logo strip fixture'; f.style.cssText = `width:${w}px;height:400px;border:0;display:block`;
            f.src = new URL('./logo-strip-frame.html', import.meta.url).href;
            await new Promise(resolve => { f.addEventListener('load', resolve, { once: true }); host.append(f); });
            const win = f.contentWindow, d = win.document;
            await win.customElements.whenDefined('pk-media'); await wait(300);
            const links = [...d.querySelectorAll('#strip > a')], hs = links.map(a => box(a).height);
            for (const a of links) {
                const b = box(a), m = box(a.querySelector('pk-media')), s = box(a.querySelector('svg'));
                t.ok(b.width > 40 && b.height >= 44, `at ${w}px the ${a.getAttribute('aria-label')} link is ${b.width.toFixed(0)}x${b.height.toFixed(0)}, expected at least 44px high`);
                t.ok(m.width > 0 && m.height > 0 && s.width > 0 && s.height > 0, `at ${w}px the ${a.getAttribute('aria-label')} logo has a size (${s.width.toFixed(0)}x${s.height.toFixed(0)})`);
            }
            t.ok(Math.max(...hs) - Math.min(...hs) < 1, `at ${w}px the logos are equal height`);
            const rows = new Set(links.map(a => Math.round(box(a).top))).size;
            t.ok(w < 600 ? rows >= 2 : rows === 1 && links.every(a => box(a).width <= 161), `at ${w}px the five logos sit in ${rows} row(s) at ${box(links[0]).width.toFixed(0)}px wide, expected one row of at most 160px at 1280 and a wrapped strip on a phone`);
            const strip = box(d.querySelector('#strip'));
            t.ok(strip.width <= w + 0.5 && links.every(a => box(a).right <= w + 0.5) && d.documentElement.scrollWidth <= w, `at ${w}px the strip does not overflow`);
        }
    }],
];
