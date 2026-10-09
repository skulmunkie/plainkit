// Browser cases for pk-tray (issue: pk-tray for the tool dock, spec 2026-10-08). Same contract as cases.js: [name, async (t) => void].
// Every layout expectation is a measurement in a sample frame (the same srcdoc the gallery uses): the viewport the tray pins to is the frame's.
const wait = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, what) => { for (let i = 0; i < 100; i++) { const v = fn(); if (v) return v; await wait(50); } throw new Error(`timed out waiting for ${what}`); };

async function frame(t, html, width, height = 600, dir = '') {
    const { sampleDoc } = await import('../../site/gallery/frame.js');
    const host = t.stage('');
    const f = document.createElement('iframe');
    f.title = 'sample'; f.style.width = `${width}px`; f.style.height = `${height}px`; f.style.border = '0';
    const loaded = new Promise(r => f.addEventListener('load', r, { once: true }));
    host.append(f); f.srcdoc = sampleDoc(dir ? `<div dir="${dir}">${html}</div>` : html); await loaded;
    const win = f.contentWindow;
    await until(() => win.customElements.get('pk-tray') && win.customElements.get('pk-button'), 'the tray elements to be defined in the frame');
    await t.settle(); await wait(60);
    const doc = f.contentDocument;
    await landed(doc);
    return { doc, win, tray: doc.querySelector('pk-tray'), launcher: () => doc.querySelector('pk-tray').part('launcher'), panel: () => doc.querySelector('pk-tray').part('panel') };
}
// The entry slide is a CSS animation: a rectangle is read once every animation in the frame has finished.
const landed = async doc => { for (const el of doc.querySelectorAll('pk-tray')) await Promise.all(el.part('panel').getAnimations().map(a => a.finished.catch(() => {}))); await wait(30); };
const rect = e => e.getBoundingClientRect();
const near = (a, b, tol = 1.5) => Math.abs(a - b) <= tol;
const press = (win, doc, init) => doc.dispatchEvent(new win.KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }));

const PAGE = '<button id="page-btn">Page button</button><div id="tall" data-tall></div>';
const TRAY = (attrs = '', body = '<p id="row1">First row</p>') => `<pk-tray label="Tools" launcher-label="Open tools" ${attrs}>${body}</pk-tray>`;

export const trayCases = [
    ['tray: defaults; closed it draws only the launcher, at the bottom end of the viewport', async t => {
        const { tray, win, launcher, panel } = await frame(t, TRAY(), 800, 600);
        t.eq(tray.open, false); t.eq(tray.size, 'medium'); t.eq(tray.edge, 'bottom'); t.eq(tray.sizes, false);
        t.eq(getComputedStyle(panel()).display, 'none', 'the panel is not drawn while closed');
        const l = rect(launcher());
        t.ok(l.width > 0 && l.right <= win.innerWidth + 1 && l.bottom <= win.innerHeight + 1, 'the launcher is on screen');
        t.ok(near(l.right, win.innerWidth - 12, 6) && near(l.bottom, win.innerHeight - 12, 6), 'bottom end corner');
        t.eq(launcher().shadowRoot.querySelector('button').getAttribute('aria-pressed'), 'false');
        t.eq(panel().getAttribute('aria-label'), 'Tools');
    }],

    ['tray: bottom edge, the three sizes are 25, 40 and 65 percent of the viewport height and the panel spans the width, flush with the bottom', async t => {
        const { tray, win, panel } = await frame(t, TRAY('open'), 800, 600);
        for (const [size, share] of [['small', 0.25], ['medium', 0.4], ['large', 0.65]]) {
            tray.size = size; await t.settle(); await wait(260);
            const r = rect(panel());
            t.ok(near(r.height, win.innerHeight * share, 2), `${size}: height ${r.height} is ${share} of ${win.innerHeight}`);
            t.ok(near(r.left, 0) && near(r.right, win.innerWidth) && near(r.bottom, win.innerHeight), `${size}: full width, flush bottom`);
            t.eq(tray.getAttribute('size'), size, 'size is reflected');
        }
    }],

    ['tray: it stays pinned to the viewport after the page scrolls, and the page behind is not inert: a page button under no part of the tray is clickable', async t => {
        const { doc, win, tray, panel } = await frame(t, `${PAGE}${TRAY('open')}`, 800, 600);
        doc.querySelector('#tall').style.height = '3000px';
        let clicks = 0; doc.querySelector('#page-btn').addEventListener('click', () => clicks++);
        win.scrollTo(0, 800); await t.settle(); await wait(60);
        t.ok(win.scrollY > 700, 'the page scrolled');
        t.ok(near(rect(panel()).bottom, win.innerHeight), 'the panel is still at the bottom of the viewport');
        t.ok(!tray.hasAttribute('inert') && !doc.body.hasAttribute('inert') && !doc.querySelector('#page-btn').closest('[inert]'), 'nothing is inert');
        win.scrollTo(0, 0); await t.settle();
        const b = rect(doc.querySelector('#page-btn'));
        t.eq(doc.elementFromPoint(b.left + 5, b.top + 5), doc.querySelector('#page-btn'), 'the page button is reachable above the panel');
        doc.querySelector('#page-btn').click();
        t.eq(clicks, 1, 'and clickable');
    }],

    ['tray: top, start and end edges pin to their side; end is the left side in a right-to-left page', async t => {
        const top = await frame(t, TRAY('open edge="top"'), 800, 600);
        let r = rect(top.panel());
        t.ok(near(r.top, 0) && near(r.left, 0) && near(r.right, 800) && near(r.height, 240, 2), `top: ${JSON.stringify(r)}`);
        const end = await frame(t, TRAY('open edge="end" size="small"'), 800, 600);
        r = rect(end.panel());
        t.ok(near(r.right, 800) && near(r.top, 0) && near(r.bottom, 600), 'end (ltr): right side, full height');
        const rem = parseFloat(getComputedStyle(end.doc.documentElement).fontSize) || 16;
        t.ok(near(r.width, 20 * rem, 2), `small width is 20rem (${20 * rem}), got ${r.width}`);
        const start = await frame(t, TRAY('open edge="start"'), 800, 600);
        r = rect(start.panel());
        t.ok(near(r.left, 0) && near(r.top, 0) && near(r.bottom, 600), 'start (ltr): left side');
        t.ok(near(r.width, 28 * rem, 2), `medium width is 28rem (${28 * rem}), got ${r.width}`);
        const rtl = await frame(t, TRAY('open edge="start"'), 800, 600, 'rtl');
        r = rect(rtl.panel());
        t.ok(near(r.right, 800), 'start (rtl): the right side');
        t.ok(rect(rtl.launcher()).left < 100 || rect(rtl.launcher()).right > 700, 'the launcher is in a corner');
    }],

    ['tray: the launcher floats above the open panel and the content scrolls clear of it', async t => {
        const rows = Array.from({ length: 60 }, (_, i) => `<p class="row">Row ${i}</p>`).join('');
        const { doc, tray, panel, launcher } = await frame(t, TRAY('open', rows), 800, 600);
        const l = rect(launcher()), p = rect(panel());
        t.ok(l.top >= p.top && l.bottom <= p.bottom && l.right <= p.right, 'the launcher sits inside the panel box, at its bottom end');
        const hit = doc.elementFromPoint(l.left + l.width / 2, l.top + l.height / 2);
        t.eq(hit, tray, 'and it is the top element there (the tray host, retargeted)');
        const body = tray.part('body');
        t.ok(body.scrollHeight > body.clientHeight + 50, 'long content scrolls inside the panel');
        body.scrollTop = body.scrollHeight; await t.settle();
        const last = rect(tray.querySelector('.row:last-child'));
        t.ok(last.bottom <= l.top + 0.5, `the last row (bottom ${last.bottom}) ends above the launcher (top ${l.top})`);
    }],

    ['tray: the launcher opens it and focus moves into the panel; Close and Escape return focus to the launcher; pk-open and pk-close carry the reason', async t => {
        const { doc, win, tray, launcher } = await frame(t, `${PAGE}${TRAY('sizes')}`, 800, 600);
        const seen = []; tray.addEventListener('pk-open', e => seen.push(['open', e.detail.reason])); tray.addEventListener('pk-close', e => seen.push(['close', e.detail.reason]));
        launcher().click(); await t.settle();
        t.eq(tray.open, true); t.ok(tray.hasAttribute('open'), 'open is reflected');
        t.eq(launcher().shadowRoot.querySelector('button').getAttribute('aria-pressed'), 'true');
        t.ok(tray.shadowRoot.activeElement && tray.part('header').contains(tray.shadowRoot.activeElement), 'focus moved to the first control in the panel');
        tray.part('close').click(); await t.settle();
        t.eq(tray.open, false); t.eq(tray.shadowRoot.activeElement, launcher(), 'Close returns focus to the launcher');
        launcher().click(); await t.settle();
        tray.part('close').focus();
        tray.part('panel').dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true, cancelable: true })); await t.settle();
        t.eq(tray.open, false, 'Escape inside closes'); t.eq(tray.shadowRoot.activeElement, launcher(), 'and focus returns to the launcher');
        t.eq(JSON.stringify(seen), JSON.stringify([['open', 'launcher'], ['close', 'close'], ['open', 'launcher'], ['close', 'escape']]));
    }],

    ['tray: Escape outside the panel is not taken; a page keydown handler still sees it', async t => {
        const { doc, win, tray } = await frame(t, `${PAGE}${TRAY('open')}`, 800, 600);
        const seen = []; doc.addEventListener('keydown', e => seen.push(e.key));
        const btn = doc.querySelector('#page-btn'); btn.focus();
        btn.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true, cancelable: true })); await t.settle();
        t.eq(tray.open, true, 'a page-level Escape leaves the tray open'); t.eq(seen.length, 1);
    }],

    ['tray: pk-close is cancelable, the tray stays open and the launcher reads open again', async t => {
        const { tray, launcher } = await frame(t, TRAY('open'), 800, 600);
        tray.addEventListener('pk-close', e => e.preventDefault());
        launcher().click(); await t.settle();
        t.eq(tray.open, true, 'a vetoed close keeps it open');
        t.eq(launcher().shadowRoot.querySelector('button').getAttribute('aria-pressed'), 'true', 'the launcher did not stay flipped');
    }],

    ['tray: the hotkey toggles it from anywhere and leaves focus where it was; no hotkey, no toggle; removing the tray removes the listener', async t => {
        const { doc, win, tray } = await frame(t, `${PAGE}${TRAY('hotkey="Ctrl+`"')}`, 800, 600);
        const btn = doc.querySelector('#page-btn'); btn.focus();
        press(win, doc, { key: '`', ctrlKey: true }); await t.settle();
        t.eq(tray.open, true, 'opened'); t.eq(doc.activeElement, btn, 'focus stayed on the page button');
        press(win, doc, { key: '`', ctrlKey: true }); await t.settle();
        t.eq(tray.open, false, 'closed'); t.eq(doc.activeElement, btn);
        press(win, doc, { key: '`' }); await t.settle();
        t.eq(tray.open, false, 'the modifier is required');
        t.ok(/Ctrl\+`/.test(tray.part('launcher').getAttribute('title')), 'the launcher names the chord');
        tray.hotkey = ''; press(win, doc, { key: '`', ctrlKey: true }); await t.settle();
        t.eq(tray.open, false, 'an empty hotkey is off');
        tray.hotkey = 'Ctrl+`'; tray.remove(); press(win, doc, { key: '`', ctrlKey: true }); await t.settle();
        t.eq(tray.open, false, 'a removed tray ignores it');
    }],

    ['tray: the built-in size choice shows the size, changing it fires pk-size-change and resizes the panel; the choice is hidden unless sizes is set', async t => {
        const { tray, win, panel } = await frame(t, TRAY('open sizes'), 800, 600);
        const sizes = tray.part('sizes');
        t.ok(rect(sizes).width > 0, 'the size choice is drawn');
        const buttons = [...sizes.querySelectorAll('pk-button')];
        t.eq(buttons.map(b => b.pressed).join(), 'false,true,false', 'medium is pressed');
        let got = null; tray.addEventListener('pk-size-change', e => { got = e.detail.size; });
        let leaked = 0; tray.addEventListener('pk-toggle', () => leaked++);
        buttons[2].click(); await t.settle(); await wait(260);
        t.eq(got, 'large'); t.eq(tray.size, 'large');
        t.ok(near(rect(panel()).height, win.innerHeight * 0.65, 2), 'the panel grew');
        t.eq(leaked, 0, 'the internal pk-toggle does not leave the element');
        tray.sizes = false; await t.settle();
        t.eq(rect(sizes).width, 0, 'hidden when sizes is off');
    }],

    ['tray: on a phone the bottom panel leaves the launcher reachable and the end panel fills the width above it', async t => {
        const a = await frame(t, TRAY('open size="large"'), 375, 667);
        let r = rect(a.panel());
        t.ok(near(r.width, 375) && near(r.bottom, 667), 'bottom: full width');
        t.ok(r.top >= 0 && r.height <= 667 - 44 - 24 + 1, `bottom: leaves room (height ${r.height})`);
        const b = await frame(t, TRAY('open edge="end"'), 375, 667);
        r = rect(b.panel());
        const l = rect(b.launcher());
        t.ok(near(r.width, 375) && near(r.left, 0), `end: fills the width (${r.left}, ${r.width}; inner ${b.win.innerWidth})`);
        t.ok(r.bottom <= l.top + 0.5, `end: the panel (bottom ${r.bottom}) stops above the launcher (top ${l.top})`);
        t.ok(l.width >= 44 || rect(b.launcher()).height >= 24, 'the launcher is a real target');
    }],

    ['tray: a custom height overrides the size, and the header title, trailing slot and Close share one row', async t => {
        const { tray, panel } = await frame(t, TRAY('open sizes', '<p>x</p>').replace('<p>x</p>', '<button slot="trailing" id="extra">Extra</button><p>x</p>'), 800, 600);
        tray.style.setProperty('--pk-tray-height', '100px');
        await t.settle();
        t.ok(near(rect(panel()).height, 100, 1), 'height follows --pk-tray-height');
        const h = tray.part('header');
        const title = rect(tray.part('title')), extra = rect(tray.querySelector('#extra')), close = rect(tray.part('close'));
        t.ok(near(title.top + title.height / 2, close.top + close.height / 2, 6) && near(extra.top + extra.height / 2, close.top + close.height / 2, 6), 'one row');
        t.ok(extra.right <= close.left + 1 && rect(tray.part('sizes')).right <= close.left + 1, 'Close is last');
        t.ok(h.getBoundingClientRect().height < 60, 'the header is compact');
    }],
];
