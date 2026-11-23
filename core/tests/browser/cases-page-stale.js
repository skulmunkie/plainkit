// Stale results in the tool and doc pages (#1929 step 4): a run or load that was superseded, or whose page left the document, must never draw.
// Same contract as cases.js: [name, async (t) => void]. Each case renders the element in a frame, like cases-page-actions.js.
import { until } from './wait.js';

async function frame(t, tag) {
    const { sampleDoc } = await import('../../site/gallery/frame.js');
    const host = t.stage(''), f = document.createElement('iframe');
    f.title = 'sample'; f.style.cssText = 'width:900px;height:500px;border:0';
    const loaded = new Promise(r => f.addEventListener('load', r, { once: true }));
    host.append(f); f.srcdoc = sampleDoc(`<${tag}></${tag}>`); await loaded;
    const win = f.contentWindow;
    await until(() => win.customElements.get(tag), `${tag} in the frame`);
    return { doc: f.contentDocument, page: f.contentDocument.querySelector(tag) };
}
const gate = () => { let go; const p = new Promise(r => { go = r; }); return { p, go }; };
const tick = () => new Promise(r => setTimeout(r, 150));

export const pageStaleCases = [
    ['tool page (#1929): a slow first run answered after a newer run does not draw over the newer outcome', async t => {
        const { page } = await frame(t, 'pk-tool-page');
        const slow = gate(); let n = 0;
        page.config = { heading: 'T', input: [], outcome: 'text' };
        page.run = () => (++n === 1 ? slow.p : Promise.resolve('second'));
        page.runNow(); const again = page.runNow(); await again; await tick();
        slow.go('first'); await tick();
        const text = page.part('outcome').textContent.trim();
        t.ok(text === 'second', `the outcome shows "${text}", expected "second". FIX: route runNow through startRun (core/js/page-base.js) so a superseded run never settles`);
    }],
    ['tool page (#1929): a run answered after the page left the document draws nothing', async t => {
        const { page, doc } = await frame(t, 'pk-tool-page');
        const slow = gate();
        page.config = { heading: 'T', input: [], outcome: 'text' };
        page.run = () => slow.p;
        page.runNow(); await tick();
        page.remove(); slow.go('late'); await tick();
        t.ok(!page.part('outcome').textContent.includes('late'), 'a detached tool page drew a late result. FIX: end the runs in disconnected()');
        doc.body.append(page); await tick();
        t.ok(!page.part('outcome').textContent.includes('late'), 'the late result appeared after the page was put back');
    }],
    ['doc page (#1929): a slow load of an item answered after a newer load of the same item does not draw the older content', async t => {
        const { page } = await frame(t, 'pk-doc-page');
        const slow = gate(); let n = 0;
        page.loadItem = id => (id === 'a' && ++n === 1 ? slow.p : Promise.resolve({ title: `A v${n}`, summary: '', html: `<p>fresh${n}</p>` }));
        page.config = { items: [{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }], id: 'a' };
        await tick();
        page.config = { items: [{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }], id: 'b' }; await tick();
        page.config = { items: [{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }], id: 'a' }; await tick();
        slow.go({ title: 'A old', summary: '', html: '<p>old</p>' }); await tick();
        const text = (page.querySelector('.prose') ?? page.shadowRoot.querySelector('.prose')).textContent;
        t.ok(text.includes('fresh') && !text.includes('old'), `the page shows the superseded first load ("${text.replace(/\s+/g, ' ').slice(-60)}"). FIX: route load through startRun`);
    }],
    ['doc page (#1929): an item answered after the page left the document draws nothing', async t => {
        const { page } = await frame(t, 'pk-doc-page');
        const slow = gate();
        page.loadItem = () => slow.p;
        page.config = { items: [{ id: 'a', title: 'A' }], id: 'a' }; await tick();
        page.remove(); slow.go({ title: 'Late', summary: '', html: '<p>late</p>' }); await tick();
        t.ok(!page.shadowRoot.textContent.includes('late'), 'a detached doc page drew a late item. FIX: end the runs in disconnected()');
    }],
];
