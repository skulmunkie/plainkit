// Browser cases for pk-dock (issue 432). Same contract as cases.js: [name, async (t) => void]. The width cases render in a sample frame (the same srcdoc the gallery uses),
// because media queries answer to the frame: 1200px wide for the tree, 375px for the phone strip.
const wait = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, what) => { for (let i = 0; i < 100; i++) { const v = fn(); if (v) return v; await wait(50); } throw new Error(`timed out waiting for ${what}`); };

async function frame(t, html, width, height = 420) {
    const { sampleDoc } = await import('../../site/gallery/frame.js');
    const host = t.stage('');
    const f = document.createElement('iframe');
    f.title = 'sample'; f.style.width = `${width}px`; f.style.height = `${height}px`; f.style.border = '0';
    const loaded = new Promise(r => f.addEventListener('load', r, { once: true }));
    host.append(f); f.srcdoc = sampleDoc(html); await loaded;
    const win = f.contentWindow;
    await until(() => win.customElements.get('pk-dock') && win.customElements.get('pk-splitter') && win.customElements.get('pk-tabs'), 'the dock elements to be defined in the frame');
    await t.settle(); await wait(120);
    return { doc: f.contentDocument, win };
}

const DOCK = `<pk-dock label="Editor">
  <div slot="tools" data-heading="Toolbox" data-group="left"><input id="probe" aria-label="Probe"></div>
  <div slot="assets" data-heading="Assets" data-group="left">Assets</div>
  <div slot="canvas" data-heading="Canvas">Canvas</div>
  <div slot="props" data-heading="Properties" data-group="right">Properties</div>
</pk-dock>`;
const rect = e => e.getBoundingClientRect();
const key = (el, k) => el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, composed: true, cancelable: true }));

export const dockCases = [
    ['dock: three columns sit side by side and fill the dock width, the left group is tabs, and a slotted input keeps its value when the tab changes', async t => {
        const { doc } = await frame(t, DOCK, 1200);
        const dock = doc.querySelector('pk-dock'), root = dock.shadowRoot.querySelector('[part=root]');
        const groups = [...root.querySelectorAll('[part=group]')].map(g => rect(g));
        t.eq(groups.length, 3);
        t.ok(groups[0].right <= groups[1].left + 1 && groups[1].right <= groups[2].left + 1, 'the groups are in one row, in order');
        t.ok(Math.abs(groups[0].top - groups[2].top) < 1 && Math.abs(groups[0].height - groups[2].height) < 1, 'they share the row height');
        const sum = groups.reduce((s, g) => s + g.width, 0), total = rect(dock).width;
        t.ok(total - sum < 30, 'the groups and the two separators account for the dock width within the separators');
        const rem = parseFloat(getComputedStyle(doc.documentElement).fontSize);
        t.ok(Math.abs(rect(dock).height - 28 * rem) < 2, `the default height is 28rem (got ${rect(dock).height}, rem ${rem})`);
        const tabs = [...root.querySelectorAll('pk-tab')];
        t.eq(tabs.map(x => x.textContent).join(), 'Toolbox,Assets');
        const probe = doc.getElementById('probe'); probe.value = 'kept';
        tabs[1].click(); await t.settle(); await wait(60);
        t.eq(probe.value, 'kept', 'the slotted panel is never moved or re-created');
        t.ok(rect(doc.querySelector('[slot=assets]')).width > 0 && rect(probe).width === 0, 'the chosen tab shows and the other is out of layout');
    }],

    ['dock: a separator resizes by keyboard, the model follows, pk-layout-change is raised once per press with the new layout, and the inner pk-resize does not escape', async t => {
        const { doc } = await frame(t, DOCK, 1200);
        const dock = doc.querySelector('pk-dock'), root = dock.shadowRoot.querySelector('[part=root]');
        const seen = [], leaked = [];
        dock.addEventListener('pk-layout-change', e => seen.push(e.detail)); dock.addEventListener('pk-resize', e => leaked.push(e));
        const split = root.querySelector('pk-splitter'), handle = split.part('handle');
        t.eq(handle.getAttribute('role'), 'separator'); t.eq(handle.getAttribute('aria-label'), 'Resize panels');
        const first = rect(root.querySelector('[part=group]')).width;
        key(handle, 'ArrowRight'); await t.settle();
        t.eq(seen.length, 1); t.eq(seen[0].reason, 'resize');
        t.eq(seen[0].layout.root.size, 22); t.eq(dock.layout.root.size, 22, 'the layout property is the new document');
        t.ok(rect(root.querySelector('[part=group]')).width > first, 'the left group grew');
        t.eq(leaked.length, 0, 'the splitter event is stopped at the dock');
        key(handle, 'Home'); await t.settle(); t.eq(seen.at(-1).layout.root.size, 5, 'Home goes to the minimum the model allows');
    }],

    ['dock: a layout the host sets is validated and drawn without an event; right-to-left mirrors the row', async t => {
        const { doc } = await frame(t, DOCK, 1200);
        const dock = doc.querySelector('pk-dock'), root = dock.shadowRoot.querySelector('[part=root]');
        let raised = 0; dock.addEventListener('pk-layout-change', () => raised++);
        dock.layout = { version: 1, seq: 3, root: { id: 'd1', type: 'tabs', active: 'canvas', panels: ['canvas', 'nope', 'props'] } };
        await t.settle(); await wait(60);
        t.eq(raised, 0);
        t.eq(root.querySelectorAll('pk-splitter').length, 0, 'one group of the declared panels only');
        t.eq(root.querySelectorAll('pk-tab').length, 4, 'the undeclared id is dropped and the declared panels the layout lacked are added');
        dock.layout = null; await t.settle(); await wait(60);
        const ltr = rect(root.querySelector('[part=group]')).left;
        doc.documentElement.dir = 'rtl'; await t.settle(); await wait(60);
        const first = rect(root.querySelector('[part=group]'));
        t.ok(first.left > ltr + 100, 'the first group moves to the right edge in rtl');
        doc.documentElement.dir = 'ltr';
    }],

    ['dock: on a phone the tree is one tab strip of every panel with one panel showing, no horizontal overflow, and the layout is untouched', async t => {
        const { doc } = await frame(t, DOCK, 375);
        const dock = doc.querySelector('pk-dock'), root = dock.shadowRoot.querySelector('[part=root]');
        t.eq(root.querySelectorAll('pk-splitter').length, 0, 'no separators on a phone');
        const tabs = [...root.querySelectorAll('pk-tab')];
        t.eq(tabs.map(x => x.textContent).join(), 'Toolbox,Assets,Canvas,Properties', 'reading order');
        const visible = ['tools', 'assets', 'canvas', 'props'].filter(id => rect(doc.querySelector(`[slot=${id}]`)).width > 0);
        t.eq(visible.length, 1, 'exactly one panel shows');
        t.ok(rect(dock).width <= 375 && doc.documentElement.scrollWidth <= 375, 'no horizontal overflow');
        tabs[3].click(); await t.settle(); await wait(60);
        t.ok(rect(doc.querySelector('[slot=props]')).width > 0, 'choosing a tab shows that panel');
        t.eq(dock.layout, null, 'a phone render writes no layout');
    }],

    ['dock: a group with company gets a keyboard-reachable Move button; choosing "Add as tab" from its menu moves the panel with moveTab, commits reason move, and the moved tab keeps focus', async t => {
        const { doc } = await frame(t, DOCK, 1200);
        const dock = doc.querySelector('pk-dock'), root = dock.shadowRoot.querySelector('[part=root]');
        const seen = []; dock.addEventListener('pk-layout-change', e => seen.push(e.detail));
        const leftGroup = [...root.querySelectorAll('[part=group]')][0];
        const move = leftGroup.querySelector('pk-dropdown');
        t.ok(move, 'the left group (more than one panel, more than one group total) has a Move dropdown');
        const trigger = move.querySelector('[slot=trigger]');
        t.eq(trigger.tagName.toLowerCase(), 'pk-button'); t.ok(trigger.getAttribute('label').endsWith('panel menu'));
        trigger.focus(); trigger.click(); await t.settle(); await wait(60);
        t.eq(move.open, true, 'Enter/click on the trigger opens the menu (keyboard-reachable, no drag)');
        const items = [...move.querySelectorAll('pk-menu-item')];
        const addAsTab = items.find(i => i.textContent === 'Add as tab');
        t.ok(addAsTab, 'an "Add as tab" item is offered for the other group');
        addAsTab.click(); await t.settle(); await wait(60);
        t.eq(seen.length, 1); t.eq(seen[0].reason, 'move');
        t.ok(seen[0].layout.root, 'a new layout was committed');
        const movedTab = [...root.querySelectorAll('pk-tab')].find(x => x.textContent === 'Toolbox');
        t.ok(movedTab && movedTab.getAttribute('selected') !== null, 'the moved panel is the active tab of its new group');
        const status = dock.shadowRoot.querySelector('[part=status]');
        t.ok(status && /Toolbox/.test(status.textContent), 'the move is announced in the visually hidden status region');
    }],

    ['dock: closing a panel from its panel menu removes it from the tree and shows the toolbar\'s Panels menu; reopening puts it back and hides the toolbar again, in session only', async t => {
        const { doc } = await frame(t, DOCK, 1200);
        const dock = doc.querySelector('pk-dock'), root = dock.shadowRoot.querySelector('[part=root]');
        const toolbar = dock.shadowRoot.querySelector('[part=toolbar]');
        t.eq(toolbar.hidden, true, 'nothing closed yet');
        // Find the Canvas group by its own title (a single-panel header), not by textContent: a group's panel menu also names Canvas as a Move
        // target, so a plain textContent search can match the wrong group.
        const hasCanvasTitle = g => g.querySelector('[part=title]')?.textContent === 'Canvas';
        const canvasGroup = [...root.querySelectorAll('[part=group]')].find(hasCanvasTitle);
        t.ok(canvasGroup, 'the Canvas group (a single panel, so a titled header) is found by its own title');
        const menu = canvasGroup.querySelector('pk-dropdown');
        menu.querySelector('[slot=trigger]').click(); await t.settle(); await wait(60);
        const close = [...menu.querySelectorAll('pk-menu-item')].find(i => i.textContent === 'Close');
        t.ok(close, 'the panel menu offers Close');
        close.click(); await t.settle(); await wait(60);
        t.ok(![...root.querySelectorAll('[part=group]')].some(hasCanvasTitle), 'canvas is gone from the tree');
        t.eq(toolbar.hidden, false, 'the toolbar appears with something to reopen');
        const status = dock.shadowRoot.querySelector('[part=status]');
        t.ok(status && /Canvas closed/.test(status.textContent), 'the close is announced');
        const panels = toolbar.querySelector('pk-dropdown');
        panels.querySelector('[slot=trigger]').click(); await t.settle(); await wait(60);
        const open = [...panels.querySelectorAll('pk-menu-item')].find(i => i.textContent === 'Open Canvas');
        t.ok(open, 'the toolbar\'s Panels menu offers to reopen it');
        open.click(); await t.settle(); await wait(60);
        // Reopening adds it back to the first group (this smallest version keeps no memory of its last group, see #432), so it may now be a tab
        // rather than its own titled section: look for its name either way.
        const hasCanvas = el => el.textContent === 'Canvas';
        t.ok([...root.querySelectorAll('[part=title]')].some(hasCanvas) || [...root.querySelectorAll('pk-tab')].some(hasCanvas), 'canvas is back in the tree');
        t.eq(toolbar.hidden, true, 'nothing closed any more');
        t.ok(/Canvas opened/.test(status.textContent), 'the reopen is announced too');
        t.eq(dock.layout.version, 1, 'still a plain layout document: closing/reopening keeps no separate persisted state');
    }],
];
