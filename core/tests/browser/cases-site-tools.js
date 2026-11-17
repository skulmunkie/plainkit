// The Theme editor and the Layout builder as lazy modules of the site app (#355, step 6b): core/app.html#/theme, and the Layout builder as an app of its own (site/builder/, #1996). Each layout expectation is a measurement:
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
async function openBuilder(t, width) {
    const host = t.stage(''), f = document.createElement('iframe');
    f.title = 'Builder app'; f.style.cssText = `width:${width}px;height:800px;border:0;display:block`;
    const loaded = new Promise(r => f.addEventListener('load', r, { once: true }));
    f.src = new URL('../../site/builder/index.html?theme=dark', import.meta.url).href; host.append(f); await loaded;
    const d = f.contentDocument, dock = await until(() => d.querySelector('pk-dock'), `the builder dock at ${width}px`);
    await t.settle(); await wait(500);
    return { d, dock };
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
    ['layout builder app (own page, 1280px and 375px): the builder fills the viewport with no gallery chrome and no nested scroll frame, and the gallery keeps a link to it (#1996)', async t => {
        for (const width of [1280, 375]) {
            const { d, dock } = await openBuilder(t, width);
            const r = dock.getBoundingClientRect(), root = d.querySelector('.lb').getBoundingClientRect();
            t.ok(root.width >= width - 1 && root.left <= 1, `${width}: the builder spans the viewport width (${Math.round(root.left)}..${Math.round(root.right)})`);
            t.ok(Math.abs(root.bottom - 800) <= 1, `${width}: the builder ends at the bottom of the viewport (${Math.round(root.bottom)})`);
            t.ok(r.height >= 600, `${width}: the dock is tall (${Math.round(r.height)}px)`);
            t.ok(!d.querySelector('pk-app-shell, pk-app-frame, pk-breadcrumb, #pk-main, pk-toast-stack'), `${width}: no gallery shell, breadcrumb or toast around the builder`);
            t.ok(d.documentElement.scrollHeight <= 800 + 1 && d.documentElement.scrollWidth <= width + 1, `${width}: the page itself does not scroll (${d.documentElement.scrollHeight} x ${d.documentElement.scrollWidth})`);
            t.ok(d.querySelector('a[href*="app.html#/gallery"]'), `${width}: a link leads back to the gallery`);
        }
        const p = await openApp(t, '#/layout-builder', 1280, '#pk-main a[href*="site/builder/"]');
        t.ok(!p.main.querySelector('pk-dock'), 'the gallery module embeds no copy of the builder, only the link');
    }],
    ['files module (app): a deep link #/files?path=&line= opens that file at that line', async t => {
        const p = await openApp(t, '#/files?path=tokens/tokens.css&line=3', 1280, '#pk-main pk-code-explorer');
        t.ok(p.tool.getAttribute('initial-line') === '3', 'the explorer is asked to focus line 3');
        const tab = await until(() => p.tool.querySelector('pk-tab[selected]'), 'the opened file tab');
        t.ok(/tokens\.css/.test(tab.textContent + (tab.getAttribute('value') ?? '')), 'tokens.css is the open tab');
    }],
    ['layout builder app (own page): a saved draft under the legacy key is restored, not replaced by the sample page', async t => {
        const key = 'pk-layout-builder-draft', old = localStorage.getItem(key);
        localStorage.setItem(key, JSON.stringify({ version: 1, seq: 2, nodes: [{ id: 'n1', tag: 'h2', props: {}, slots: { '': ['Restored draft heading'] } }] }));
        try {
            const { d } = await openBuilder(t, 1280), text = d.querySelector('pk-design-surface')?.textContent ?? '';
            t.ok(text.includes('Restored draft heading'), 'the saved heading is on the canvas');
            t.ok(!text.includes('Team overview'), 'the sample page is not shown');
        } finally { if (old === null) localStorage.removeItem(key); else localStorage.setItem(key, old); }
    }],
];
