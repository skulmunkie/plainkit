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
    ['table media column: a header wider than the box does not stretch the box (the width stays the floor times the ratio)', async t => {
        const { td, img } = first(await mount(t, '{"label":"Cover image for the title"}'));
        t.ok(Math.abs(rect(td).width - 4.5 * rem()) < 1.5 && Math.abs(rect(td).height - 4.5 * rem()) < 1.5, 'a 1/1 box stays square under a long header, got ' + rect(td).width + 'x' + rect(td).height);
        t.ok(Math.abs(rect(img).width - rect(td).width) < 2, 'the img fills the box');
        const wide = first(await mount(t, '{"label":"Cover image for the title","ratio":"16/9","size":"sm"}'));
        t.ok(Math.abs(rect(wide.td).width - 3 * rem() * 16 / 9) < 1.5, 'a 16/9 box keeps its ratio width, got ' + rect(wide.td).width);
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

const phoneDoc = async (t, width, { media = true, dir = '', src = PIX } = {}) => {
    const { sampleDoc } = await import('../../site/gallery/frame.js');
    const cols = JSON.stringify([...(media ? [{ key: 'pic', label: 'Cover', type: 'media', ratio: '3/4' }] : []), { key: 'name', label: 'Name', title: true }, { key: 'by', label: 'By' }, { key: 'year', label: 'Year' }]);
    const rows = JSON.stringify([{ id: 1, pic: src, name: 'A fairly long book title that wraps over two lines', by: 'An Author', year: '2026' }]);
    const host = t.stage(''), f = document.createElement('iframe');
    f.title = 'sample'; f.style.width = `${width}px`; f.style.height = '480px'; f.style.border = '0';
    const loaded = new Promise(r => f.addEventListener('load', r, { once: true })); host.append(f);
    f.srcdoc = sampleDoc(`<pk-table cards label="Books" ${dir} columns='${cols}' rows='${rows}'></pk-table>`); await loaded;
    const sr = () => f.contentDocument.querySelector('pk-table')?.shadowRoot;
    await until(() => sr()?.querySelector('tbody td[data-key="name"]') && (!media || sr().querySelector('td[data-media] img')), 'the table'); await wait(150);
    const tr = sr().querySelector('tbody tr'), td = k => sr().querySelector(`tbody td[data-key="${k}"]`), w = f.contentWindow, wcs = w.getComputedStyle(tr);
    return { w, tr, td, pad: { l: parseFloat(wcs.paddingLeft), r: parseFloat(wcs.paddingRight), t: parseFloat(wcs.paddingTop), b: parseFloat(wcs.paddingBottom) }, doc: f.contentDocument.documentElement };
};
const R = e => e.getBoundingClientRect();
tableMediaCases.push(
    ['table media column in cards (phone 390): the image leads the card at the inline start, as tall as the card content, with the stacked cells beside it', async t => {
        const p = await phoneDoc(t, 390); t.eq(p.w.innerWidth, 390);
        const tr = R(p.tr), m = R(p.td('pic')), name = R(p.td('name')), by = R(p.td('by'));
        t.ok(Math.abs(m.left - (tr.left + p.pad.l)) < 1.5, 'media at the card inner start: ' + m.left + ' vs ' + (tr.left + p.pad.l));
        t.ok(Math.abs(m.height - (p.tr.clientHeight - p.pad.t - p.pad.b)) < 2, 'media as tall as the card content: ' + m.height + ' vs ' + tr.height);
        t.ok(name.left >= m.right - 0.5 && by.left >= m.right - 0.5, 'title and cells sit beside the media, not under it');
        t.ok(by.top >= name.bottom - 1, 'the other cells stack under the title');
        t.ok(p.doc.scrollWidth <= p.doc.clientWidth, 'no horizontal overflow');
    }],
    ['table media column in cards: the box is the same before and after the image loads, and when it fails', async t => {
        const a = await phoneDoc(t, 375, { src: '/__no_such_image__.png?' + Date.now() }), ma = R(a.td('pic')), ta = R(a.tr);
        const b = await phoneDoc(t, 375), mb = R(b.td('pic')), tb = R(b.tr);
        t.ok(Math.abs(ma.width - mb.width) < 1 && Math.abs(ma.height - mb.height) < 1 && Math.abs(ta.height - tb.height) < 1, 'same box: ' + [ma.width, ma.height, ta.height] + ' vs ' + [mb.width, mb.height, tb.height]);
    }],
    ['table media column in cards: right-to-left puts the image at the card inline start (the right)', async t => {
        const p = await phoneDoc(t, 390, { dir: 'dir="rtl"' }); p.doc.setAttribute('dir', 'rtl'); await wait(100);
        const tr = R(p.tr), m = R(p.td('pic')), name = R(p.td('name'));
        t.ok(Math.abs(m.right - (tr.right - p.pad.r)) < 1.5 && name.right <= m.left + 0.5, 'media at the right edge, title to its left');
    }],
    ['table cards without a media column are unchanged: the cells stay flex rows with their labels', async t => {
        const p = await phoneDoc(t, 390, { media: false }); const by = p.td('by');
        t.eq(p.w.getComputedStyle(by).display, 'flex', 'a labelled cell is a flex row'); t.ok(Math.abs(R(by).width - (p.tr.clientWidth - p.pad.l - p.pad.r)) < 1.5, 'it spans the card');
    }],
);
tableMediaCases.push(
    ['pk-list-page passes a media column (type, ratio, alt) through its config unchanged', async t => {
        const box = await t.mount('<div style="width:900px"><pk-list-page></pk-list-page></div>'), lp = box.querySelector('pk-list-page');
        const cols = [{ key: 'pic', label: 'Cover', type: 'media', ratio: '16/9', alt: 'name' }, { key: 'name', label: 'Name' }];
        await Promise.all(['pk-list-page', 'pk-data-table', 'pk-table'].map(n => customElements.whenDefined(n))); lp.load = () => ({ rows: [{ id: 1, pic: PIX, name: 'One' }], total: 1 }); lp.config = { heading: 'Books', columns: cols, density: 'compact' };
        const tbl = () => lp.shadowRoot?.querySelector('[part=table]')?.shadowRoot?.querySelector('[part=table]')?.shadowRoot;
        const td = await until(() => tbl()?.querySelector('tbody td[data-media] img')?.parentElement, 'the media cell'); await t.settle();
        t.eq(td.querySelector('img').alt, 'One', 'alt reads the row key'); t.ok(Math.abs(rect(td).width / rect(td).height - 16 / 9) < 0.05, 'the ratio reaches the box: ' + rect(td).width / rect(td).height);
    }],
);
