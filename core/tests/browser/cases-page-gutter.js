// Page gutter (#2038): content inside the app shell is inset from the viewport edge by the page gutter on a phone, in both directions, and a focus ring on the first control is not clipped.
const wait = ms => new Promise(r => setTimeout(r, ms));

async function open(t, width, dir) {
    const host = t.stage(''), f = document.createElement('iframe');
    f.title = `page gutter at ${width}px ${dir}`;
    f.style.cssText = `width:${width}px;height:700px;border:0;display:block`;
    f.src = new URL('./app-frame-frame.html', import.meta.url).href;
    await new Promise(resolve => { f.addEventListener('load', resolve, { once: true }); host.append(f); });
    const win = f.contentWindow, d = win.document;
    d.documentElement.dir = dir;
    const main = d.querySelector('#pk-main');
    main.replaceChildren();
    main.insertAdjacentHTML('beforeend', '<pk-sections-page id="sp"><pk-card id="c" slot="section-details" heading="Details"><pk-button id="b">Edit</pk-button></pk-card></pk-sections-page>');
    d.querySelector('#sp').config = { heading: 'Mug', sections: [{ id: 'details', label: 'Details' }], actions: [{ key: 'edit', label: 'Edit' }] };
    await Promise.all(['pk-sections-page', 'pk-card', 'pk-button'].map(tag => Promise.race([win.customElements.whenDefined(tag), wait(5000)])));
    await wait(600);
    return { win, d };
}

export const pageGutterCases = [
    ['page gutter (#2038): at 375 px a page card is inset from both viewport edges by at least the page gutter, left-to-right and right-to-left', async t => {
        for (const dir of ['ltr', 'rtl']) {
            const { win, d } = await open(t, 375, dir), gutter = parseFloat(win.getComputedStyle(d.documentElement).getPropertyValue('--pad-page')) || 16;
            const r = d.querySelector('#c').getBoundingClientRect(), w = win.innerWidth;
            t.ok(r.left >= gutter - 0.5, `${dir}: the card starts ${r.left}px from the left edge (gutter ${gutter}). FIX: the page gets its inline gutter from the shell body, --pad-page`);
            t.ok(w - r.right >= gutter - 0.5, `${dir}: the card ends ${w - r.right}px from the right edge (gutter ${gutter})`);
        }
    }],
    ['page gutter (#2038): at 375 px in right-to-left a focused button keeps its whole focus ring inside the viewport', async t => {
        const { win, d } = await open(t, 375, 'rtl');
        const b = d.querySelector('#b'); b.focus(); await wait(100);
        const r = b.getBoundingClientRect();
        t.ok(r.left >= 3 && win.innerWidth - r.right >= 3, `the button is ${r.left}px from the left and ${win.innerWidth - r.right}px from the right edge, enough for the ring`);
    }],
];
