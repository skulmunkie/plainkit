// The navbar in an app shell's header (the no-fold attribute): what the header measures at real window widths. Same contract as cases.js: [name, async (t) => void].
// Each case opens tests/browser/navbar-frame.html in an iframe of the width under test, so the phone and tablet media queries answer to that width.
const WIDTHS = [320, 375, 768, 1024, 1280];
const wait = ms => new Promise(r => setTimeout(r, ms));

async function open(t, width, search = '') {
    const host = t.stage(''), f = document.createElement('iframe');
    f.title = `navbar at ${width}px`;
    f.style.cssText = `width:${width}px;height:600px;border:0;display:block`;
    f.src = new URL(`./navbar-frame.html${search}`, import.meta.url).href;
    await new Promise(resolve => { f.addEventListener('load', resolve, { once: true }); host.append(f); });
    const win = f.contentWindow;
    await Promise.all(['pk-app-shell', 'pk-navbar', 'pk-side-nav', 'pk-app-bar-search', 'pk-button', 'pk-dropdown'].map(tag => Promise.race([win.customElements.whenDefined(tag), wait(5000)])));
    await wait(250);
    const d = win.document, box = el => el.getBoundingClientRect();
    const shell = d.querySelector('pk-app-shell'), bar = d.querySelector('pk-navbar'), header = shell.shadowRoot.querySelector('[part="header"]');
    const shown = el => { const cs = win.getComputedStyle(el); return el.getClientRects().length > 0 && cs.display !== 'none' && cs.visibility !== 'hidden'; };
    return {
        win, d, box, shown, shell, bar, header,
        toggles: () => [d.querySelector('[data-nav-toggle]'), bar.shadowRoot.querySelector('[part="toggle"]')].filter(shown),
        cluster: () => [d.querySelector('pk-app-bar-search'), d.querySelector('pk-dropdown')],
        innerRight: () => box(header).right - parseFloat(win.getComputedStyle(header).paddingRight),
    };
}

export const navbarCases = [
    ['navbar no-fold in an app shell: exactly one menu control is shown at every width (the shell\'s), never the bar\'s own hamburger too', async t => {
        for (const w of WIDTHS) {
            const s = await open(t, w);
            t.eq(s.toggles().length, 1, `visible menu toggles at ${w}px`);
            t.ok(s.toggles()[0].hasAttribute('data-nav-toggle'), `the one control at ${w}px is the shell's`);
            t.ok(!s.shown(s.d.querySelector('pk-navbar > a:not([slot])')) || w > 1024, `the bar's links stay hidden at ${w}px (the drawer holds them)`);
        }
    }],

    ['navbar no-fold in an app shell: the search and the settings menu end at the header\'s inner right edge at 320, 375, 768, 1024 and 1280', async t => {
        for (const w of WIDTHS) {
            const s = await open(t, w);
            const [search, menu] = s.cluster(), edge = s.innerRight();
            t.ok(Math.abs(s.box(menu).right - edge) <= 1, `at ${w}px the settings menu ends at ${s.box(menu).right.toFixed(1)}, the header's inner edge is ${edge.toFixed(1)}`);
            t.ok(s.box(search).right <= s.box(menu).left + 1, `at ${w}px the search is left of the settings menu`);
            t.ok(s.box(s.bar).right <= edge + 1, `at ${w}px the bar stays inside the header`);
        }
    }],

    ['navbar no-fold in an app shell: the bar is one row that never wraps, and the brand gives way before the actions', async t => {
        for (const w of WIDTHS) {
            const s = await open(t, w);
            const nav = s.bar.shadowRoot.querySelector('[part="nav"]'), brand = s.d.querySelector('a[slot="brand"]'), [search, menu] = s.cluster();
            t.ok(s.box(nav).height <= 57, `at ${w}px the bar is ${s.box(nav).height.toFixed(1)}px tall, one row is at most 56`);
            for (const el of [brand, search, menu]) t.ok(Math.abs((s.box(el).top + s.box(el).bottom) / 2 - (s.box(nav).top + s.box(nav).bottom) / 2) <= 6, `at ${w}px ${el.localName} sits on the bar's row`);
            t.ok(s.box(brand).right <= s.box(search).left + 1, `at ${w}px the brand ends before the search starts`);
            t.ok(s.box(menu).width >= 30 && s.box(search).width >= 30, `at ${w}px the actions keep their size`);
        }
    }],

    ['app-shell with nothing in its nav slot: the main column takes the whole width, at 1280 and at 1500 (it must not fall into the auto column of the nav)', async t => {
        for (const w of [1280, 1500]) {
            const s = await open(t, w, '?nonav');
            const main = s.shell.shadowRoot.querySelector('[part="main"]');
            t.ok(s.box(main).width >= w - 1, `at ${w}px the main column is ${s.box(main).width.toFixed(1)}px wide, the shell is ${s.box(s.shell).width.toFixed(1)}`);
            t.ok(Math.abs(s.box(s.bar).right - s.innerRight()) <= 1, `at ${w}px the bar ends at the header's inner edge`);
        }
    }],

    ['app-shell: a header or footer strip with nothing in it is not drawn, and one with content is', async t => {
        const strips = async search => { const s = await open(t, 1280, search), part = name => s.shell.shadowRoot.querySelector(`[part="${name}"]`); return { header: s.shown(part('header')), footer: s.shown(part('footer')), main: s.box(part('main')).height }; };
        const full = await strips(''), bare = await strips('?bare'), noFooter = await strips('?nofooter');
        t.ok(full.header && full.footer, 'a shell with a header and a footer draws both');
        t.ok(!bare.header && !bare.footer, 'a shell with neither draws neither strip');
        t.ok(noFooter.header && !noFooter.footer, 'a shell with only a header draws no footer strip');
        t.ok(bare.main >= 599, `the bare shell's main column is ${bare.main}px tall (the whole frame)`);
    }],

    ['navbar no-fold in an app shell: on a phone the menu control, the search and the settings menu are 44px touch targets', async t => {
        for (const w of [320, 375]) {
            const s = await open(t, w);
            const search = s.cluster()[0].shadowRoot.querySelector('[part="expand"]'), menuButton = s.d.querySelector('pk-dropdown pk-button'), toggle = s.d.querySelector('[data-nav-toggle]');
            for (const [name, el] of [['the menu control', toggle], ['the search button', search], ['the settings button', menuButton]]) {
                const r = s.box(el);
                t.ok(r.width >= 43.5 && r.height >= 43.5, `at ${w}px ${name} is ${r.width.toFixed(1)}x${r.height.toFixed(1)}, the touch target is 44`);
            }
        }
    }],
];
