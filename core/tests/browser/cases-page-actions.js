// Browser cases for the shared title bar's action list (#1943, phase 1; js/page-actions.js), drawn here by pk-tool-page: icon-only per actionsCollapse at each width,
// the accessible name and tooltip, newAction first and primary, one pk-action event, focus order, rtl. A viewport is only a phone when the frame is, so each case renders in a frame of the width under test.
// Same contract as cases.js: [name, async (t) => void].
import { until } from './wait.js';
const rect = el => el.getBoundingClientRect();
const ACTIONS = [{ key: 'export', label: 'Export', icon: 'download', variant: 'ghost' }, { key: 'share', label: 'Share', icon: 'share' }, { key: 'plain', label: 'Plain words' }];
const NEW = { key: 'new', label: 'New order', icon: 'plus' };

async function frame(t, width, config, dir = 'ltr') {
    const { sampleDoc } = await import('../../site/gallery/frame.js');
    const host = t.stage(''), f = document.createElement('iframe');
    f.title = 'sample'; f.style.cssText = `width:${width}px;height:420px;border:0`;
    const loaded = new Promise(r => f.addEventListener('load', r, { once: true }));
    host.append(f); f.srcdoc = sampleDoc('<pk-tool-page></pk-tool-page>'); await loaded;
    const win = f.contentWindow;
    await until(() => win.customElements.get('pk-tool-page'), 'pk-tool-page in the frame');
    const doc = f.contentDocument; doc.documentElement.dir = dir;
    const page = doc.querySelector('pk-tool-page');
    page.config = { heading: 'Orders', actions: ACTIONS, newAction: NEW, ...config };
    await until(() => page.part('header').querySelectorAll('pk-button').length >= 3 && win.customElements.get('pk-button') && win.customElements.get('pk-page-header'), 'the title bar actions');
    await t.settle(); await new Promise(r => setTimeout(r, 200));
    const buttons = () => [...page.part('header').querySelectorAll('pk-button[slot=actions]')];
    return { win, doc, page, buttons };
}
const square = b => rect(b).width <= 48; // the touch-target minimum: a folded button is one control wide, not a label wide
const name = b => (b.label || b.textContent).trim();

export const pageActionsCases = [
    ['tool-page actions (page-header title bar): newAction is first, primary, and first in DOM and focus order; the list follows in array order', async t => {
        const { buttons } = await frame(t, 1280, { actionsCollapse: 'none' });
        const b = buttons();
        t.eq(b.map(x => x.textContent.trim()).join(), 'New order,Export,Share,Plain words', 'newAction then the list');
        t.eq(b[0].variant, 'primary', 'newAction is the primary');
        t.ok(rect(b[0]).left < rect(b[1]).left && rect(b[1]).left < rect(b[2]).left, 'visual order equals DOM order in ltr');
        t.ok(b.every(x => rect(x).width > rect(x).height * 1.5), 'actionsCollapse none: every button keeps its words');
    }],
    ['tool-page actions (page-header title bar): actionsCollapse always is icon-only at 1280, the label stays the accessible name, an item without an icon keeps its words', async t => {
        const { buttons } = await frame(t, 1280, { actionsCollapse: 'always' });
        const b = buttons();
        for (const x of b.slice(0, 3)) { t.ok(x.hasAttribute('collapsed'), `${name(x)} is collapsed`); t.ok(square(x), `${name(x)} is icon-only (${rect(x).width} x ${rect(x).height})`); }
        t.eq(b.slice(0, 3).map(name).join(), 'New order,Export,Share', 'the label is the name of each folded button');
        const control = b[0].shadowRoot.querySelector('[part=control]');
        t.ok((control.getAttribute('aria-label') || control.title || '').includes('New order'), 'the control names itself from the label (name or native tooltip)');
        t.ok(!b[3].hasAttribute('collapsed') && rect(b[3]).width > rect(b[3]).height * 1.5, 'no icon: never collapsed');
    }],
    ['tool-page actions (page-header title bar): actionsCollapse phone (the default) folds at 390 and not at 800 or 1280; tablet folds at 800; none never folds', async t => {
        const folded = async (w, c) => (await frame(t, w, c ? { actionsCollapse: c } : {})).buttons()[0].hasAttribute('collapsed');
        t.eq(await folded(390), true, 'default at 390');
        t.eq(await folded(800), false, 'default at 800');
        t.eq(await folded(1280), false, 'default at 1280');
        t.eq(await folded(800, 'tablet'), true, 'tablet at 800');
        t.eq(await folded(1280, 'tablet'), false, 'tablet at 1280');
        t.eq(await folded(390, 'none'), false, 'none at 390');
    }],
    ['tool-page actions (page-header title bar): a hint is a tooltip around the button, one press raises one pk-action with the key, disabled and busy raise nothing, an href item raises nothing', async t => {
        const { page, buttons } = await frame(t, 1280, { actionsCollapse: 'none', newAction: undefined, actions: [{ key: 'a', label: 'A', hint: 'Does A' }, { key: 'd', label: 'D', disabled: true }, { key: 'b', label: 'B', busy: true }, { key: 'l', label: 'L', href: '#l' }] });
        const keys = []; page.addEventListener('pk-action', e => keys.push(e.detail.key));
        const bs = buttons().concat([...page.part('header').querySelectorAll('pk-tooltip pk-button')]);
        t.ok(page.part('header').querySelector('pk-tooltip[slot=actions]'), 'the hint draws a tooltip');
        for (const b of bs) b.click();
        await new Promise(r => setTimeout(r, 100));
        t.eq(keys.join(), 'a', 'only the plain key item raised pk-action, once');
        t.ok(bs.some(b => b.disabled) && bs.some(b => b.busy), 'disabled and busy are set on their buttons');
    }],
    ['tool-page actions (page-header title bar): in rtl newAction is the rightmost button (first in DOM order, so first in focus order)', async t => {
        const { buttons } = await frame(t, 1280, { actionsCollapse: 'none' }, 'rtl');
        const b = buttons();
        t.ok(rect(b[0]).left > rect(b[1]).left && rect(b[1]).left > rect(b[2]).left, 'visual order is mirrored, DOM order unchanged');
        t.eq(b[0].variant, 'primary', 'still the primary');
    }],
];
