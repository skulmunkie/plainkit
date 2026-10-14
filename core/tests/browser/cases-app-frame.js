// pk-app-frame (#364): the module list on a phone. Same contract as cases.js: [name, async (t) => void]. The fixture opens in an iframe of the width under test.
const wait = ms => new Promise(r => setTimeout(r, ms));

async function open(t, width) {
    const host = t.stage(''), f = document.createElement('iframe');
    f.title = `app frame at ${width}px`;
    f.style.cssText = `width:${width}px;height:700px;border:0;display:block`;
    f.src = new URL('./app-frame-frame.html', import.meta.url).href;
    await new Promise(resolve => { f.addEventListener('load', resolve, { once: true }); host.append(f); });
    const win = f.contentWindow;
    await Promise.all(['pk-app-frame', 'pk-app-shell', 'pk-side-nav', 'pk-nav-item'].map(tag => Promise.race([win.customElements.whenDefined(tag), wait(5000)])));
    await wait(300);
    const frame = win.document.querySelector('pk-app-frame'), q = sel => frame.shadowRoot.querySelector(sel);
    return { frame, q };
}

export const appFrameCases = [
    ['app-frame on a phone (#364): the drawer lists the modules as its first row, the active one current', async t => {
        const { q } = await open(t, 375);
        const rows = [...q('pk-side-nav').querySelectorAll('pk-nav-item[data-module]')];
        t.ok(rows.map(r => r.getAttribute('data-module')).join() === 'sales,support', `the drawer lists the modules, got ${rows.map(r => r.getAttribute('data-module'))}`);
        t.ok(rows.find(r => r.hasAttribute('current'))?.getAttribute('data-module') === 'support', 'the active module is marked current');
        t.ok(rows.every(r => r.getAttribute('href')), 'each module row is a link');
        const first = q('pk-side-nav').firstElementChild;
        t.ok(!first.hasAttribute('href') && first.textContent.startsWith('Support') && first.contains(rows[0]), 'the first row is the module branch titled with the active module');
    }],
    ['app-frame on a desktop (#364): the picker is in the bar and the side nav has no module rows', async t => {
        const { q } = await open(t, 1280);
        t.ok(q('pk-side-nav').querySelectorAll('pk-nav-item[data-module]').length === 0, 'no module rows in the side nav');
        t.ok(!q('[part="picker"]').hidden, 'the picker is in the bar');
    }],
];
