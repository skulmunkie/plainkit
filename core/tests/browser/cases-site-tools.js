// The Theme editor and the Layout builder as lazy modules of the site app (#355, step 6b): core/app.html#/theme and #/layout-builder. Each layout expectation is a measurement:
// the tool fills the content area beside or under the bar, never wider than it, never clipped, and the page does not scroll sideways.
const wait = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, what, tries = 200) => { for (let i = 0; i < tries; i++) { const v = fn(); if (v) return v; await wait(50); } throw new Error(`timed out waiting for ${what}`); };

async function openApp(t, hash, width, ready) {
    const host = t.stage(''), f = document.createElement('iframe');
    f.title = 'Site app'; f.style.cssText = `width:${width}px;height:800px;border:0;display:block`;
    const loaded = new Promise(r => f.addEventListener('load', r, { once: true }));
    f.src = new URL(`../../app.html?theme=dark${hash}`, import.meta.url).href; host.append(f); await loaded;
    const d = f.contentDocument;
    const tool = await until(() => d.querySelector(ready), `the tool for ${hash}`);
    await t.settle(); await wait(500);
    return { d, win: f.contentWindow, main: d.querySelector('#pk-main'), tool };
}
const fits = (t, p, what, width) => {
    const m = p.main.getBoundingClientRect(), r = p.tool.getBoundingClientRect();
    t.ok(r.width >= m.width * 0.95 && r.left >= m.left - 1 && r.right <= m.right + 1, `${width}: ${what} fills the content area without leaving it (${Math.round(r.left)}..${Math.round(r.right)} in ${Math.round(m.left)}..${Math.round(m.right)})`);
    t.ok(p.d.documentElement.scrollWidth <= width + 1, `${width}: the page does not scroll sideways (${p.d.documentElement.scrollWidth})`);
    t.ok(r.top >= m.top - 1, `${width}: ${what} starts at the top of the content area`);
};

export const siteToolCases = [
    ['theme module (app, 1280px and 375px): the editor mounts in the content area with its tokens listed, and the page does not scroll sideways', async t => {
        for (const width of [1280, 375]) {
            const p = await openApp(t, '#/theme', width, '#pk-main pk-tabs');
            fits(t, p, 'the editor', width);
            t.ok(p.main.querySelectorAll('pk-input, pk-select').length > 3, `${width}: the filter and the token inputs are drawn`);
            t.ok(p.d.querySelector('pk-nav-item[current], pk-tab[aria-current], [aria-current="page"]'), `${width}: the bar marks the Theme editor as current`);
        }
    }],
    ['layout builder module (app, 1280px and 375px): the builder fills the content area with its palette, canvas and properties, and the page does not scroll sideways', async t => {
        for (const width of [1280, 375]) {
            const p = await openApp(t, '#/layout-builder', width, '#pk-main pk-dock');
            fits(t, p, 'the builder', width);
            const r = p.tool.getBoundingClientRect();
            t.ok(r.height >= 400, `${width}: the dock is tall enough to work in (${Math.round(r.height)}px)`);
            t.ok(p.d.querySelector('#pk-main pk-design-surface'), `${width}: the canvas is drawn`);
            t.ok(r.bottom <= 800 + 1, `${width}: the dock ends inside the screen (${Math.round(r.bottom)})`);
        }
    }],
];
