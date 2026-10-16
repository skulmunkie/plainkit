// Browser cases for the landing-page template and the markdown-editor pattern (#329, #1476). Same contract as cases.js: [name, async (t) => void].
const wait = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, what) => { for (let i = 0; i < 100; i++) { const v = fn(); if (v) return v; await wait(50); } throw new Error(`timed out waiting for ${what}`); };

async function landing(t, w, h = 900) {
    const host = t.stage(''), f = document.createElement('iframe');
    f.title = 'landing'; f.style.cssText = `width:${w}px;height:${h}px;border:0;display:block`;
    const loaded = new Promise(r => f.addEventListener('load', r, { once: true }));
    f.src = new URL('../../samples/templates/landing/landing.html', import.meta.url).href; host.append(f); await loaded;
    const d = f.contentDocument, win = f.contentWindow;
    await until(() => ['pk-button', 'pk-card', 'pk-grid', 'pk-heading'].every(n => win.customElements.get(n)), 'the landing elements');
    await until(() => d.querySelector('pk-button')?.shadowRoot?.querySelector('[part="control"]'), 'the buttons to render');
    await t.settle(); await wait(200);
    return { d, win };
}
const rows = els => [...new Set(els.map(e => Math.round(e.getBoundingClientRect().top)))];
const grids = d => [...d.querySelectorAll('pk-grid')];

export const landingCases = [
    ['landing template (1280px): three feature columns on one row, three equal-height pricing cards on one row, exactly one h1', async t => {
        const { d } = await landing(t, 1280);
        const [feat, price] = grids(d);
        t.eq(feat.children.length, 3, 'three features');
        t.eq(rows([...feat.children]).length, 1, 'the three features share one row');
        t.eq(rows([...price.children]).length, 1, 'the three pricing cards share one row');
        const hs = [...price.children].map(c => Math.round(c.getBoundingClientRect().height));
        t.ok(Math.max(...hs) - Math.min(...hs) <= 1, `pricing cards have equal height, got ${hs.join(', ')}`);
        const h1 = [...d.querySelectorAll('pk-heading')].filter(h => h.getAttribute('level') === '1').length + d.querySelectorAll('h1').length;
        t.eq(h1, 1, 'exactly one level-1 heading');
    }],
    ['landing template (375px): features and pricing stack to one column, no horizontal scroll, hero buttons at least 44px high', async t => {
        const { d } = await landing(t, 375, 812);
        for (const g of grids(d)) {
            const kids = [...g.children];
            t.eq(new Set(kids.map(k => Math.round(k.getBoundingClientRect().left))).size, 1, 'one column');
            t.eq(rows(kids).length, kids.length, 'each card on its own row');
        }
        t.ok(d.documentElement.scrollWidth <= 375, `no horizontal scroll, scrollWidth ${d.documentElement.scrollWidth}`);
        for (const b of d.querySelectorAll('pk-cluster pk-button')) {
            const h = b.shadowRoot.querySelector('[part="control"]').getBoundingClientRect().height;
            t.ok(h >= 43.5, `hero button "${b.textContent.trim()}" control is at least 44px high, got ${h}`);
        }
    }],
    ['markdown-editor pattern: Write shows the source, Preview draws headings, a list and bold with DOM nodes, edits show on the next Preview, and markup typed stays text', async t => {
        const { sampleDoc } = await import('../../site/gallery/frame.js');
        const html = await (await fetch(new URL('../../samples/patterns/markdown-editor/markdown-editor.html', import.meta.url))).text();
        const host = t.stage(''), f = document.createElement('iframe');
        f.title = 'sample'; f.style.cssText = 'width:700px;height:600px;border:0';
        const loaded = new Promise(r => f.addEventListener('load', r, { once: true }));
        host.append(f); f.srcdoc = sampleDoc(html, { pattern: 'markdown-editor/markdown-editor.js' }); await loaded;
        await until(() => f.contentDocument.querySelector('[data-source]'), 'the sample markup');
        const d = f.contentDocument, win = f.contentWindow;
        await until(() => ['pk-tabs', 'pk-textarea', 'pk-tab'].every(n => win.customElements.get(n)), 'tabs and textarea');
        await t.settle(); await wait(200);
        await wait(300);
        const h = { destroy() {} };
        const tabs = d.querySelector('pk-tabs'), src = d.querySelector('[data-source]'), prev = d.querySelector('[data-preview]');
        t.ok(src && prev && tabs, `elements found: ${!!src} ${!!prev} ${!!tabs} body=${d.body.innerHTML.slice(0, 200)}`);
        const vis = el => el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0;
        t.ok(vis(src), 'Write shows the textarea');
        t.ok(!vis(prev), 'Preview is hidden while writing');
        const pick = v => d.querySelector(`pk-tab[value="${v}"]`).click();
        pick('preview');
        await wait(500); t.ok(prev.children.length, `preview drawn; tabs.value=${tabs.value} boot=${d.documentElement.dataset.pattern} src=${src.value?.length}`);
        await until(() => prev.children.length, 'the preview');
        t.ok(vis(prev), 'Preview is shown'); t.ok(!vis(src), 'the textarea is hidden in Preview');
        t.eq(prev.querySelectorAll('li').length, 2, 'two list items');
        t.eq(prev.querySelector('li strong')?.textContent, 'New', 'bold drawn as strong');
        t.ok(/What changed/.test(prev.firstElementChild.textContent), 'the heading is drawn');
        src.value = '# Hi <img src=x onerror=alert(1)>';
        pick('write'); await t.settle(); pick('preview');
        await until(() => prev.textContent.includes('Hi'), 'the edit in the preview');
        t.eq(prev.querySelector('img'), null, 'typed markup stays text');
        h.destroy();
    }],
];
