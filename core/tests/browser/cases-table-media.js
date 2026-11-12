// Browser cases for the pk-table media column (#1938): a `type: "media"` column draws a plain <img> in a box reserved before the image loads.
const wait = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, what) => { for (let i = 0; i < 100; i++) { const v = fn(); if (v) return v; await wait(50); } throw new Error(`timed out waiting for ${what}`); };
const PIX = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"><rect width="40" height="20" fill="gray"/></svg>');
const rem = () => parseFloat(getComputedStyle(document.documentElement).fontSize);
const mount = async (t, col = '', lines = 1, src = PIX) => {
    const columns = JSON.stringify([{ key: 'pic', label: 'Cover', type: 'media', ...(col ? JSON.parse(col) : {}) }, { key: 'name', label: 'Name' }]);
    const rows = JSON.stringify([{ id: 1, pic: src, name: 'word '.repeat(lines * 40), alt: 'Cover of one' }, { id: 2, pic: src, name: 'Two', alt: 'x' }]);
    const box = await t.mount(`<div style="width:900px"><pk-table label="Books" columns='${columns}' rows='${rows}'></pk-table></div>`);
    const el = box.querySelector('pk-table');
    await until(() => el.shadowRoot?.querySelector('tbody td[data-media] img'), 'the media cell'); await t.settle();
    return el;
};
const rect = e => e.getBoundingClientRect();
const first = el => { const td = el.shadowRoot.querySelector('tbody td[data-media]'); return { td, img: td.querySelector('img'), tr: td.parentElement }; };

export const tableMediaCases = [
    ['table media column: the box is the floor height (4.5rem by default) and the width follows the ratio; the img fills the box', async t => {
        const { td, img } = first(await mount(t));
        t.ok(Math.abs(rect(td).height - 4.5 * rem()) < 1.5, 'the box is the floor height, got ' + rect(td).height);
        t.ok(Math.abs(rect(td).width - rect(td).height) < 1.5, 'a 1/1 box is square, got ' + rect(td).width + 'x' + rect(td).height);
        t.ok(Math.abs(rect(img).width - rect(td).width) < 2 && Math.abs(rect(img).height - rect(td).height) < 2, 'the img fills the box');
        const wide = first(await mount(t, '{"ratio":"16/9","size":"sm"}'));
        t.ok(rect(wide.td).height >= 3 * rem() - 1.5, 'size sm is at least 3rem (a text row may be taller), got ' + rect(wide.td).height);
        t.ok(Math.abs(rect(wide.td).width - 3 * rem() * 16 / 9) < 1.5, 'width is the floor height times 16/9, got ' + rect(wide.td).width);
        t.ok(Math.abs(rect(first(await mount(t, '{"size":"lg"}')).td).height - 6 * rem()) < 1.5, 'size lg is 6rem');
    }],
    ['table media column: a taller row crops the image (the box fills the row height, the width does not follow)', async t => {
        const el = await mount(t, '{}', 6); const { td, img, tr } = first(el);
        t.ok(rect(tr).height > 4.5 * rem() + 10, 'the row grew with its text, got ' + rect(tr).height + ' text ' + el.shadowRoot.querySelector('tbody td[data-key=name]').textContent.length);
        t.ok(Math.abs(rect(td).height - rect(tr).height) < 1.5 && Math.abs(rect(img).height - rect(td).height) < 2, 'the box and the img fill the row height');
        t.ok(Math.abs(rect(td).width - 4.5 * rem()) < 1.5, 'the width stays the floor width, got ' + rect(td).width);
        t.eq(getComputedStyle(img).objectFit, 'cover', 'cover crops');
        t.eq(getComputedStyle(first(await mount(t, '{"fit":"contain"}')).img).objectFit, 'contain', 'fit contain');
    }],
    ['table media column: no layout shift, the box is the same size before the image loads, after it loads and when it fails', async t => {
        const slow = await mount(t, '{}', 1, '/__no_such_image__.png?' + Date.now()); const a = first(slow);
        const failed = [rect(a.td).width, rect(a.td).height, rect(a.tr).height];
        const ok = await mount(t); const b = first(ok);
        await until(() => b.img.complete, 'the image'); const done = [rect(b.td).width, rect(b.td).height, rect(b.tr).height];
        t.ok(failed.every((v, i) => Math.abs(v - done[i]) < 1), 'a failed image keeps the box: ' + failed + ' vs ' + done);
        b.img.src = PIX + '#2'; const now = rect(b.td); t.ok(Math.abs(now.width - done[0]) < 1 && Math.abs(now.height - done[1]) < 1, 'swapping the image keeps the box');
    }],
    ['table media column: decorative (empty alt) by default, alt names a row key, lazy and async', async t => {
        const el = await mount(t); const { img } = first(el);
        t.eq(img.getAttribute('alt'), '', 'empty alt by default'); t.eq(img.getAttribute('loading'), 'lazy', 'lazy');
        t.eq(first(await mount(t, '{"alt":"alt"}')).img.getAttribute('alt'), 'Cover of one', 'alt reads the row key');
    }],
    ['table media column: the media column sits at the inline-start edge in a right-to-left table', async t => {
        const el = await mount(t); el.setAttribute('dir', 'rtl'); await t.settle();
        const { td } = first(el), name = el.shadowRoot.querySelector('tbody td[data-key="name"]');
        t.ok(rect(td).left > rect(name).left, 'media is to the right of the name');
    }],
];
