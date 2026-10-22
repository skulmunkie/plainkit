// Loader and extras (#1656): a tag that lives in an extra which is not in the folder says which artifact to add, once, instead of the generic "could not load".
// Same contract as cases.js: [name, async (t) => void]. The fixture (extras-frame.html) simulates a core-only dist folder with a registry that has no modules beside it.
import { until } from './wait.js';

export const extrasCases = [
    ['loader extras (#1656): <pk-canvas> and <pk-markdown> on a core-only folder log one actionable message each, naming the extra and the zip', async t => {
        const host = t.stage(''), f = document.createElement('iframe');
        f.title = 'a core-only folder';
        f.style.cssText = 'width:375px;height:300px;border:0;display:block';
        f.src = new URL('./extras-frame.html', import.meta.url).href;
        await new Promise(resolve => { f.addEventListener('load', resolve, { once: true }); host.append(f); });
        const win = f.contentWindow;
        await until(() => win.ready, 'the extras fixture to load', { tries: 100 });
        const text = win.logs.map(l => l.text);
        const canvas = text.filter(x => x.includes('<pk-canvas>')), md = text.filter(x => x.includes('<pk-markdown>'));
        t.ok(canvas.length === 1, `<pk-canvas> twice on the page logs one message, got ${canvas.length}: ${canvas.join(' | ')}`);
        t.ok(/plainkit\.canvas-[\d.]+\.zip/.test(canvas[0] ?? '') && (canvas[0] ?? '').includes('packages/plainkit.canvas/'), `the canvas message names the zip and the Pages path: ${canvas[0]}`);
        t.ok(md.length === 1 && md[0].includes('plainkit.markdown'), `<pk-markdown> logs one message naming plainkit.markdown: ${md.join(' | ')}`);
        t.ok(!text.some(x => x.includes('could not load <pk-canvas>') || x.includes('could not load <pk-markdown>')), 'the generic "could not load" line is replaced, not added to');
        t.ok(text.some(x => x.includes('<pk-nosuchthing> is not a Plainkit element')), 'a real typo still gets the spelling message');
        t.ok(!win.customElements.get('pk-canvas'), 'the canvas tag stays inert (not defined), nothing throws');
    }],
];
