// Browser cases for the overlays, feedback and navigation elements. Same contract as cases.js: [name, async (t) => void].
import { mediaBelow } from '../../js/breakpoints.js';
const wait = ms => new Promise(r => setTimeout(r, ms));
const focus = (el, t) => { el.focus(); return t.settle(); };
// Waits for the entry animation of a panel to finish, so a position is read after the transition and not in the middle of it.
const arrived = async (panel, t) => { await t.settle(); await Promise.all(panel.getAnimations().map(a => a.finished.catch(() => {}))); await wait(30); };
const near = (a, b, tol = 1) => Math.abs(a - b) <= tol;

export const overlaysCases = [
    ['tooltip: focus shows it, the target gets aria-description and no node is added, Escape hides it', async t => {
        const el = await t.mount('<pk-tooltip text="Saves the draft"><button>Save</button></pk-tooltip>');
        const b = el.querySelector('button');
        b.dispatchEvent(new FocusEvent('focusin', { bubbles: true, composed: true })); await wait(30);
        t.ok(el.hasAttribute('shown'), 'shown on focus');
        t.eq(b.getAttribute('aria-description'), 'Saves the draft'); t.ok(!b.hasAttribute('aria-describedby') && el.children.length === 1, 'nothing is added to the light DOM');
        t.eq(el.part('tip').textContent, 'Saves the draft');
        t.ok(getComputedStyle(el.part('tip')).display !== 'none', 'visible');
        t.key(b, 'Escape'); await t.settle();
        t.ok(!el.hasAttribute('shown'), 'Escape hides it');
    }],

    ['tooltip: a hint card draws its own help button, a touch tap toggles it, and its links live in the panel', async t => {
        const el = await t.mount('<pk-tooltip help interactive heading="Wave account" text="Where this posts."><a slot="links" href="#docs">Docs</a></pk-tooltip>');
        const help = el.part('help');
        t.ok(help && help.getAttribute('aria-label') === 'Help', 'built-in button is labelled');
        help.dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'touch', bubbles: true, composed: true })); await t.settle();
        t.ok(el.hasAttribute('shown'), 'tap opens'); t.eq(getComputedStyle(el.part('tip')).pointerEvents, 'auto');
        t.eq(el.part('heading').textContent, 'Wave account'); t.eq(el.slotted('links').length, 1);
        el.part('tip').dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'touch', bubbles: true, composed: true })); await t.settle();
        t.ok(el.hasAttribute('shown'), 'a tap inside the panel keeps it open');
        help.dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'touch', bubbles: true, composed: true })); await t.settle();
        t.ok(!el.hasAttribute('shown'), 'a second tap closes it');
    }],

    ['popover: a click on the trigger opens it, Escape closes it and returns focus, confirm fires pk-confirm', async t => {
        const el = await t.mount('<pk-popover heading="Details"><button slot="trigger">Open</button>Body</pk-popover>');
        const trig = el.querySelector('button');
        trig.click(); await t.settle();
        t.ok(el.open && el.hasAttribute('open'), 'open reflected'); t.eq(trig.getAttribute('aria-expanded'), 'true');
        t.eq(getComputedStyle(el.part('panel')).position, 'fixed');
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        await t.settle(); t.ok(!el.open, 'Escape closes');
        const c = await t.mount('<pk-popover variant="confirm" heading="Delete?" confirm-label="Delete"><button slot="trigger">X</button></pk-popover>');
        let got = 0; c.addEventListener('pk-confirm', () => got++);
        c.querySelector('button').click(); await t.settle();
        c.part('panel').querySelector('[data-action="confirm"]').click(); await t.settle();
        t.eq(got, 1); t.ok(!c.open);
    }],

    ['badge-popover: the pill is a disclosure button, opens an anchored panel, Escape closes and returns focus, an outside press closes without moving it, data-close closes', async t => {
        const host = await t.mount('<div><pk-badge-popover variant="warn" heading="5 failing checks">5 failing<div slot="details">Price is missing</div><pk-button slot="actions" data-close>Dismiss</pk-button></pk-badge-popover><button id="pk-bp-out">Elsewhere</button></div>');
        const el = host.querySelector('pk-badge-popover'), pill = el.part('trigger'), panel = el.part('panel');
        t.eq(pill.localName, 'button'); t.eq(pill.getAttribute('aria-expanded'), 'false'); t.eq(pill.getAttribute('aria-controls'), panel.id);
        t.eq(getComputedStyle(panel).display, 'none');
        t.ok(getComputedStyle(pill).backgroundColor !== 'rgba(0, 0, 0, 0)', 'the pill is filled');
        pill.focus(); pill.click(); await t.settle();
        t.ok(el.open && el.hasAttribute('open'), 'open reflected'); t.eq(pill.getAttribute('aria-expanded'), 'true');
        t.eq(getComputedStyle(panel).position, 'fixed'); t.eq(panel.getAttribute('aria-labelledby'), el.part('title').id); t.eq(el.part('title').textContent, '5 failing checks');
        t.ok(!el.part('actions').hidden, 'actions shown when slotted');
        await arrived(panel, t);
        const a = pill.getBoundingClientRect(), b = panel.getBoundingClientRect();
        t.ok(near(b.top, a.bottom + 6, 8), `directly under the pill (${Math.round(a.bottom)}, ${Math.round(b.top)})`);
        t.key(document, 'Escape'); await t.settle();
        t.ok(!el.open, 'Escape closes'); t.eq(el.shadowRoot.activeElement, pill, 'focus returns to the pill');
        pill.click(); await t.settle(); t.ok(el.open);
        host.querySelector('pk-button').click(); await t.settle();
        t.ok(!el.open, 'a slotted data-close closes it'); t.eq(el.shadowRoot.activeElement, pill);
        pill.click(); await t.settle(); t.ok(el.open);
        let reason; el.addEventListener('pk-close', e => { reason = e.detail.reason; });
        document.getElementById('pk-bp-out').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true })); await t.settle();
        t.ok(!el.open && reason === 'outside', 'an outside press closes it');
        pill.click(); pill.click(); await t.settle(); t.ok(!el.open, 'a second press on the pill closes it');
    }],

    ['badge-popover: a cancelable pk-close vetoes closing, and no heading names the panel by label or pill text', async t => {
        const el = await t.mount('<pk-badge-popover open>Stale<div slot="details">Body</div></pk-badge-popover>');
        await t.settle(); t.eq(el.part('panel').getAttribute('aria-label'), 'Stale');
        el.addEventListener('pk-close', e => e.preventDefault());
        t.key(document, 'Escape'); await t.settle(); t.ok(el.open, 'vetoed');
        t.ok(el.part('actions').hidden, 'no actions, no row');
    }],

    ['popover: a cancelable pk-close lets the host veto closing', async t => {
        const el = await t.mount('<pk-popover open><button slot="trigger">Open</button>Body</pk-popover>');
        el.addEventListener('pk-close', e => e.preventDefault());
        el.part('panel').dispatchEvent(new Event('x'));
        el.request('outside'); await t.settle();
        t.ok(el.open, 'vetoed');
    }],

    ['dropdown and popover: a display: contents trigger wrapper still anchors the menu next to the trigger', async t => {
        const host = await t.mount('<div><pk-dropdown><span slot="trigger" style="display: contents"><button>Actions</button></span><pk-menu-item>Edit</pk-menu-item></pk-dropdown><pk-popover><span slot="trigger" style="display: contents"><button>Info</button></span><p>Body</p></pk-popover></div>');
        for (const b of host.querySelectorAll('button')) b.style.marginTop = '200px';
        for (const el of host.children) el.open = true;
        await t.settle();
        for (const [el, name] of [[host.querySelector('pk-dropdown'), 'dropdown'], [host.querySelector('pk-popover'), 'popover']]) {
            const b = el.querySelector('button').getBoundingClientRect();
            const panel = el.part(name === 'dropdown' ? 'menu' : 'panel'); await arrived(panel, t);
            const m = panel.getBoundingClientRect();
            t.ok(b.top > 150 && near(m.top, b.bottom + 4, 8), `${name} sits next to its trigger (trigger ${Math.round(b.left)},${Math.round(b.bottom)} panel ${Math.round(m.left)},${Math.round(m.top)})`);
        }
    }],

    ['dropdown: opens, arrows and typeahead move focus, checkbox toggles and reports, Escape returns focus to the trigger', async t => {
        const el = await t.mount('<pk-dropdown><button slot="trigger">Actions</button><pk-menu-item>Edit</pk-menu-item><pk-menu-item disabled>Copy</pk-menu-item><pk-menu-item type="checkbox" checked>Archived</pk-menu-item><pk-menu-item>Delete</pk-menu-item></pk-dropdown>');
        const trig = el.querySelector('button'); const items = [...el.querySelectorAll('pk-menu-item')];
        t.key(trig, 'ArrowDown'); await t.settle();
        t.ok(el.open); t.eq(document.activeElement, items[0], 'first item focused');
        t.key(items[0], 'ArrowDown'); await t.settle(); t.eq(document.activeElement, items[2], 'disabled item skipped');
        t.key(items[2], 'd'); await t.settle(); t.eq(document.activeElement, items[3], 'typeahead');
        let seen; el.addEventListener('pk-select', e => { seen = e.detail; });
        items[2].click(); await t.settle();
        t.eq(items[2].checked, false); t.eq(seen.checked, false); t.eq(seen.value, 'Archived');
        t.ok(!el.open, 'closes after choosing');
        t.eq(items[2].internals.role, 'menuitemcheckbox');
        trig.click(); await t.settle(); document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await t.settle();
        t.ok(!el.open); t.eq(document.activeElement, trig, 'focus returned');
    }],

    ['menu-item: a description (attribute or slot) wraps under the label, is the accessible description and stays out of the value and typeahead', async t => {
        const el = await t.mount('<pk-dropdown open><button slot="trigger">Actions</button><pk-menu-item description="Additive; nothing is deleted, and every existing row keeps its current value so you can undo it later.">Import</pk-menu-item><pk-menu-item>Rebuild<span slot="description">Takes a minute.</span></pk-menu-item><pk-menu-item>Plain</pk-menu-item></pk-dropdown>');
        const [a, b, c] = el.querySelectorAll('pk-menu-item'); await t.settle();
        t.ok(!a.part('description').hidden && !b.part('description').hidden && c.part('description').hidden, 'only items with a description show the line');
        t.eq(a.internals.ariaDescription, a.description); t.eq(b.internals.ariaDescription, 'Takes a minute.'); t.ok(!c.internals.ariaDescription, 'no description, no aria-description');
        t.eq(a.part('description').getAttribute('aria-hidden'), 'true', 'the line is not part of the name');
        a.style.width = '14rem'; await t.settle(); const row = a.getBoundingClientRect(); const line = a.part('description').getBoundingClientRect();
        t.ok(line.height > parseFloat(getComputedStyle(a.part('description')).fontSize) * 1.5, 'a long description wraps onto more lines'); t.ok(line.right <= row.right + 0.5 && a.scrollWidth <= a.clientWidth + 1, 'and stays inside the item');
        a.focus(); t.key(a, 't'); await t.settle(); t.ok(document.activeElement !== b, 'typeahead ignores the description text');
        b.querySelector('[slot="description"]').textContent = 'Changed.'; b.focus(); t.eq(b.internals.ariaDescription, 'Changed.', 'focus refreshes the description');
        let seen; el.addEventListener('pk-select', e => { seen = e.detail; }); b.click(); await t.settle(); t.eq(seen.value, 'Rebuild', 'the value is the label alone');
    }],

    ['dropdown: a submenu opens with Right and closes with Left', async t => {
        const el = await t.mount('<pk-dropdown open><button slot="trigger">A</button><pk-menu-item>More<pk-menu-item slot="submenu">One</pk-menu-item><pk-menu-item slot="submenu">Two</pk-menu-item></pk-menu-item></pk-dropdown>');
        const parent = el.querySelector('pk-menu-item'); const [one, two] = parent.querySelectorAll('pk-menu-item');
        const toggles = []; parent.addEventListener('pk-submenu-toggle', e => toggles.push(e.detail.open));
        parent.focus(); t.key(parent, 'ArrowRight'); await t.settle();
        t.ok(parent.open, 'submenu open'); t.eq(document.activeElement, one); t.eq(JSON.stringify(toggles), JSON.stringify([true]), 'opening it itself raises pk-submenu-toggle');
        t.key(one, 'ArrowDown'); await t.settle(); t.eq(document.activeElement, two);
        t.key(two, 'ArrowLeft'); await t.settle(); t.ok(!parent.open); t.eq(document.activeElement, parent); t.eq(JSON.stringify(toggles), JSON.stringify([true, false]), 'closing raises it too');
        parent.open = true; parent.open = false; await t.settle(); t.eq(JSON.stringify(toggles), JSON.stringify([true, false]), 'a change the host makes raises nothing');
    }],

    ['table: the row checkboxes commit selected through pk-select; a host change raises nothing', async t => {
        const el = await t.mount('<pk-table selectable label="T"></pk-table>'); el.columns = [{ key: 'n', label: 'N' }]; el.rows = [{ id: 'a', n: 1 }, { id: 'b', n: 2 }]; await t.settle();
        const seen = []; el.addEventListener('pk-select', e => seen.push(e.detail.selected));
        el.selected = ['a']; await t.settle(); t.eq(JSON.stringify(seen), JSON.stringify([]), 'host change is silent');
        const box = el.shadowRoot.querySelector('[data-select="b"]'); box.checked = true; box.dispatchEvent(new Event('change', { bubbles: true })); await t.settle();
        t.eq(JSON.stringify(seen), JSON.stringify([['a', 'b']])); t.eq(JSON.stringify([...el.selected]), '["a","b"]');
    }],

    ['context menu: contextmenu opens it at the pointer; choosing an item closes it', async t => {
        const el = await t.mount('<pk-context-menu><div>Area</div><pk-menu-item slot="menu">Rename</pk-menu-item></pk-context-menu>');
        let opened; el.addEventListener('pk-open', e => { opened = e.detail; });
        el.firstElementChild.dispatchEvent(new MouseEvent('contextmenu', { clientX: 40, clientY: 50, bubbles: true, composed: true, cancelable: true }));
        await t.settle();
        t.ok(el.open); t.eq(getComputedStyle(el.part('menu')).position, 'fixed');
        t.eq(opened.target, el.firstElementChild, 'pk-open names the element that was right-clicked'); t.eq(opened.context, undefined, 'no ancestor carries data-pk-context');
        el.querySelector('pk-menu-item').click(); await t.settle(); t.ok(!el.open);
    }],

    ['context menu: Shift+F10 names data-pk-context, and a synchronous slot swap from the pk-open handler is what gets focused', async t => {
        const el = await t.mount('<pk-context-menu><div data-pk-context="row-2"><button type="button">cell</button></div><pk-menu-item slot="menu">Old</pk-menu-item></pk-context-menu>');
        let opened;
        el.addEventListener('pk-open', e => {
            opened = e.detail;
            el.querySelectorAll('[slot="menu"]').forEach(n => n.remove());
            const swapped = document.createElement('pk-menu-item'); swapped.slot = 'menu'; swapped.textContent = 'New'; el.append(swapped);
        });
        const button = el.querySelector('button'); button.focus();
        button.dispatchEvent(new KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true, composed: true, cancelable: true }));
        await t.settle();
        t.ok(el.open); t.eq(opened.context, 'row-2', 'pk-open names the row via data-pk-context');
        t.eq(document.activeElement.textContent, 'New', 'the item focused is the one the pk-open handler just swapped in, not the pre-swap "Old" one');
    }],

    ['select-menu: reads its options, opens, chooses with the keyboard, reports pk-change and joins the form', async t => {
        const host = t.stage('<form><pk-select-menu name="s" value="b"><option value="a">Alpha</option><option value="b">Beta</option><option value="c">Gamma</option></pk-select-menu></form>');
        await t.load(host);
        const el = host.querySelector('pk-select-menu'); await t.settle();
        t.eq(el.part('value').textContent, 'Beta'); t.eq(new FormData(host.firstElementChild).get('s'), 'b');
        const trig = el.part('trigger'); t.key(trig, 'ArrowDown'); await t.settle(); t.ok(el.open);
        let ch; el.addEventListener('pk-change', e => { ch = e.detail; });
        t.key(trig, 'ArrowDown'); t.key(trig, 'Enter'); await t.settle();
        t.eq(el.value, 'c'); t.eq(ch.value, 'c'); t.eq(ch.previous, 'b'); t.ok(!el.open);
        t.eq(new FormData(host.firstElementChild).get('s'), 'c');
    }],

    ['drawer: open reflects to a native modal dialog; Escape asks first and can be vetoed; a backdrop click closes unless persistent', async t => {
        const el = await t.mount('<pk-drawer heading="Filters">Body</pk-drawer>');
        const dlg = el.part('panel');
        el.open = true; await t.settle(); t.ok(dlg.open, 'dialog open');
        t.eq(getComputedStyle(dlg).position, 'fixed');
        let veto = true; el.addEventListener('pk-close', e => { if (veto) e.preventDefault(); });
        dlg.dispatchEvent(new Event('cancel', { cancelable: true })); await t.settle(); t.ok(el.open, 'vetoed');
        veto = false; dlg.click(); await t.settle(); t.ok(!el.open && !dlg.open, 'backdrop click closes');
        el.persistent = true; el.open = true; await t.settle(); dlg.click(); await t.settle(); t.ok(el.open, 'persistent ignores the backdrop');
        el.remove(); t.ok(!dlg.open, 'closed on disconnect');
    }],

    ['drawer: docked is non-modal, sits inside its positioned ancestor, and Escape still asks before closing', async t => {
        const host = t.stage('<div><div data-rel><pk-drawer docked heading="Inspector">Body</pk-drawer></div><button id="outside">outside</button></div>');
        host.querySelector('[data-rel]').setAttribute('data-x', '1');
        const rel = host.querySelector('[data-rel]'); rel.style.position = 'relative'; rel.style.height = '200px'; rel.style.width = '400px';
        await t.load(host);
        const el = host.querySelector('pk-drawer'); el.open = true; await t.settle();
        const dlg = el.part('panel');
        t.ok(dlg.open && !dlg.matches(':modal'), 'open but not modal');
        const box = dlg.getBoundingClientRect(); const rbox = rel.getBoundingClientRect();
        t.ok(box.right <= rbox.right + 1 && box.top >= rbox.top - 1 && box.height <= rbox.height + 1, 'contained by the positioned ancestor');
        let asked = 0; el.addEventListener('pk-close', () => { asked++; });
        dlg.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true })); await t.settle();
        t.eq(asked, 1); t.ok(!el.open, 'closed after the request');
    }],

    ['drawer: sides, the wide flag and the actions slot are part of the API', async t => {
        const el = await t.mount('<pk-drawer side="left" wide heading="H"><button slot="actions">Save</button>x</pk-drawer>');
        t.eq(el.side, 'left'); t.ok(el.wide); t.eq(el.slotted('actions').length, 1);
    }],

    ['dialog: once open (after its entry animation) it is centred in the viewport, full screen on a phone, and never taller than the viewport', async t => {
        const el = await t.mount('<pk-dialog heading="Where am I?" size="sm">Text</pk-dialog>');
        const dlg = el.part('dialog'); el.open = true; await arrived(dlg, t);
        const r = dlg.getBoundingClientRect(); const vw = document.documentElement.clientWidth; const vh = window.innerHeight;
        t.ok(getComputedStyle(dlg).transform === 'none' || /^matrix\(1, 0, 0, 1, 0, 0\)$/.test(getComputedStyle(dlg).transform), 'the entry transform is gone');
        if (mediaBelow('phone').matches) {
            t.ok(near(r.left, 0) && near(r.top, 0) && near(r.width, vw) && near(r.height, vh), `full screen on a phone (${r.left},${r.top} ${r.width}x${r.height} in ${vw}x${vh})`);
        } else {
            t.ok(near(r.left + r.width / 2, vw / 2), `centred horizontally (${r.left + r.width / 2} vs ${vw / 2})`);
            t.ok(near(r.top + r.height / 2, vh / 2), `centred vertically (${r.top + r.height / 2} vs ${vh / 2})`);
            t.ok(r.width <= 26 * 16 + 1 && r.height <= vh, 'size sm stays within 26rem and the viewport');
        }
        el.open = false; await t.settle();
    }],

    ['drawer: once open (after its slide) it is flush with its edge and spans the viewport: right, left and bottom', async t => {
        const vw = document.documentElement.clientWidth; const vh = window.innerHeight;
        for (const side of ['right', 'left', 'bottom']) {
            const el = await t.mount(`<pk-drawer side="${side}" heading="Edge">Body</pk-drawer>`);
            const panel = el.part('panel'); el.open = true; await arrived(panel, t);
            const r = panel.getBoundingClientRect();
            t.ok(getComputedStyle(panel).transform === 'none' || /^matrix\(1, 0, 0, 1, 0, 0\)$/.test(getComputedStyle(panel).transform), `${side}: the slide transform is gone`);
            if (side === 'right') t.ok(near(r.right, vw) && near(r.top, 0) && near(r.height, vh), `right drawer at the right edge, full height (${r.right} of ${vw}, ${r.top}, ${r.height} of ${vh})`);
            if (side === 'left') t.ok(near(r.left, 0) && near(r.top, 0) && near(r.height, vh), `left drawer at the left edge, full height (${r.left}, ${r.top}, ${r.height} of ${vh})`);
            if (side === 'bottom') t.ok(near(r.bottom, vh) && near(r.left, 0) && near(r.width, vw), `bottom drawer at the bottom edge, full width (${r.bottom} of ${vh}, ${r.left}, ${r.width} of ${vw})`);
            if (side !== 'bottom') t.ok(r.width <= Math.min(24 * 16, vw * 0.9) + 1, `${side}: width is min(24rem, 90vw) at most (${r.width})`);
            el.open = false; await t.settle();
        }
    }],

    ['dialog: the backdrop never closes it; Escape and the close button do; confirm resolves a promise', async t => {
        const el = await t.mount('<pk-dialog heading="Sure?" size="sm">Text</pk-dialog>');
        const dlg = el.part('dialog');
        el.open = true; await t.settle(); t.ok(dlg.open);
        dlg.click(); await t.settle(); t.ok(el.open, 'backdrop click does nothing');
        el.part('close').click(); await t.settle(); t.ok(!el.open, 'close button closes');
        const cls = customElements.get('pk-dialog');
        const p = cls.confirm({ heading: 'Delete?', message: 'Gone.', danger: true });
        await wait(30);
        const d = document.body.querySelector(':scope > pk-dialog:last-of-type');
        t.ok(d.open && d.part('dialog').open, 'built and opened');
        d.querySelector('[data-result="ok"]').click();
        t.eq(await p, true); t.ok(!d.isConnected, 'removed afterwards');
        const q = cls.confirm({ heading: 'x' }); await wait(30);
        document.body.querySelector(':scope > pk-dialog:last-of-type').querySelector('[data-result="cancel"]').click();
        t.eq(await q, false);
    }],

    ['dialog, drawer and popover: data-open, data-toggle and data-close work from the elements alone (the openers install when one connects)', async t => {
        const box = await t.mount('<div><pk-button data-open="#pk-inv-d">Open</pk-button><pk-button data-open="#pk-inv-w">Drawer</pk-button><pk-button data-toggle="#pk-inv-p">Toggle</pk-button><pk-dialog id="pk-inv-d" heading="Hi" size="sm">Text<pk-button data-close>Cancel</pk-button></pk-dialog><pk-drawer id="pk-inv-w" heading="Side">Body</pk-drawer><pk-popover id="pk-inv-p" heading="Pop">Body</pk-popover></div>');
        const [openD, openW, toggleP] = box.querySelectorAll('pk-button');
        const dialog = box.querySelector('pk-dialog'); const drawer = box.querySelector('pk-drawer'); const pop = box.querySelector('pk-popover');
        openD.click(); await t.settle(); t.ok(dialog.open, 'data-open opens the dialog');
        dialog.querySelector('[data-close]').click(); await t.settle(); t.ok(!dialog.open, 'data-close closes it');
        openW.click(); await t.settle(); t.ok(drawer.open, 'data-open opens the drawer');
        toggleP.click(); await t.settle(); t.ok(pop.open, 'data-toggle opens the popover');
        toggleP.click(); await t.settle(); t.ok(!pop.open, 'data-toggle closes it again');
    }],

    ['toast: kind sets its role, the timer dismisses it, hover pauses it', async t => {
        const el = await t.mount('<pk-toast kind="danger" heading="Failed" duration="80">Sync error.</pk-toast>');
        t.eq(el.internals.role, 'alert');
        let reason; el.addEventListener('pk-dismiss', e => { reason = e.detail.reason; });
        await wait(160); t.eq(reason, 'timeout'); t.ok(!el.isConnected);
        const h = await t.mount('<pk-toast duration="120">Hi</pk-toast>');
        h.dispatchEvent(new PointerEvent('pointerenter')); await wait(220); t.ok(h.isConnected, 'paused while hovered');
        h.remove();
    }],

    ['toast stack: shows at most max toasts and reveals the next as one is dismissed', async t => {
        const st = await t.mount('<pk-toast-stack max="2" position="top"><pk-toast duration="0">1</pk-toast><pk-toast duration="0">2</pk-toast><pk-toast duration="0">3</pk-toast></pk-toast-stack>');
        await t.load(st); await t.settle();
        const vis = () => [...st.querySelectorAll('pk-toast')].filter(x => !x.hidden).length;
        t.eq(vis(), 2); t.eq(st.internals.role, 'region');
        st.querySelector('pk-toast').dismiss('method'); await t.settle(); await t.settle();
        t.eq(vis(), 2, 'the third appeared');
        const made = customElements.get('pk-toast-stack').show('Saved', { kind: 'success', position: 'bottom', duration: 0 });
        t.ok(made.isConnected); t.eq(made.parentElement.getAttribute('position'), 'bottom'); made.parentElement.remove();
    }],

    ['alert: role follows the kind and dismiss hides it unless vetoed', async t => {
        const el = await t.mount('<pk-alert kind="warning" heading="Low" dismissible>Three left.</pk-alert>');
        t.eq(el.internals.role, 'alert');
        el.addEventListener('pk-dismiss', e => e.preventDefault()); el.dismiss(); t.ok(!el.hidden, 'vetoed');
        const b = await t.mount('<pk-alert kind="info" dismissible>x</pk-alert>');
        t.eq(b.internals.role, 'status'); b.part('close').click(); await t.settle(); t.ok(b.hidden);
    }],

    ['loading overlay: busy makes the content inert and announces the label', async t => {
        const el = await t.mount('<pk-loading-overlay label="Loading orders"><button>Inside</button></pk-loading-overlay>');
        t.ok(!el.part('content').inert); el.busy = true; await t.settle();
        t.ok(el.part('content').inert); t.eq(getComputedStyle(el.part('overlay')).display, 'flex'); t.eq(el.part('label').textContent, 'Loading orders');
        el.busy = false; await t.settle(); t.ok(!el.part('content').inert);
    }],

    ['loading overlay: the label sits on a solid panel over a strong scrim, in view, for short and tall regions (issue 374)', async t => {
        const rgba = c => { const m = /(-?[\d.]+)[ ,]+(-?[\d.]+)[ ,]+(-?[\d.]+)(?:\s*[,/]\s*([\d.]+))?\)/.exec(c); const k = c.startsWith('color(') ? 255 : 1; return m && { r: m[1] * k, g: m[2] * k, b: m[3] * k, a: m[4] === undefined ? 1 : +m[4] }; };
        const lum = ({ r, g, b }) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
        const rows = Array.from({ length: 50 }, (_, i) => `<p>Row ${i + 1} of a long report.</p>`).join('');
        const host = t.stage(`<div id="lo-scroll"><pk-loading-overlay id="lo-tall" busy label="Loading the report"><div>${rows}</div></pk-loading-overlay></div><pk-loading-overlay id="lo-short" busy label="Saving"><p>Saved 3 orders.</p></pk-loading-overlay>`);
        await t.load(host);
        const scroll = host.querySelector('#lo-scroll'), tall = host.querySelector('#lo-tall'), short = host.querySelector('#lo-short');
        scroll.style.setProperty('height', '300px'); scroll.style.setProperty('overflow', 'auto'); await t.settle();
        const legible = (el, what) => {
            const panel = el.part('panel'); t.ok(panel, `${what}: there is a panel behind the spinner and label`); if (!panel) return;
            const bg = rgba(getComputedStyle(panel).backgroundColor), fg = rgba(getComputedStyle(el.part('label')).color), scrim = rgba(getComputedStyle(el.part('overlay')).backgroundColor);
            t.ok(bg && bg.a === 1, `${what}: the panel is opaque`); t.ok(scrim && scrim.a >= 0.8, `${what}: the scrim hides the covered content (${scrim?.a})`);
            const [x, y] = [lum(fg), lum(bg)].sort((a, b) => b - a); t.ok((x + 0.05) / (y + 0.05) >= 4.5, `${what}: the label contrast on the panel is ${((x + 0.05) / (y + 0.05)).toFixed(2)}, AA needs 4.5`);
            const p = panel.getBoundingClientRect(), l = el.part('label').getBoundingClientRect(); t.ok(l.left >= p.left - 0.5 && l.right <= p.right + 0.5 && l.top >= p.top - 0.5 && l.bottom <= p.bottom + 0.5, `${what}: the label is inside the panel`);
        };
        legible(short, 'short region'); legible(tall, 'tall region');
        const inside = (el, box, what) => { const p = el.part('panel').getBoundingClientRect(); t.ok(p.top >= box.top - 1 && p.bottom <= box.bottom + 1, `${what}: the panel [${Math.round(p.top)}-${Math.round(p.bottom)}] is inside [${Math.round(box.top)}-${Math.round(box.bottom)}]`); };
        t.ok(scroll.scrollHeight > scroll.clientHeight + 500, 'the tall region is taller than its scroller');
        for (const top of [0, 700, 1300]) { scroll.scrollTop = top; await t.settle(); inside(tall, scroll.getBoundingClientRect(), `tall region scrolled to ${top}`); }
        const p = short.part('panel').getBoundingClientRect(), r = short.getBoundingClientRect(); t.ok(Math.abs((p.left + p.right) / 2 - (r.left + r.right) / 2) <= 1, 'the panel is centred across the short region');
        t.ok(getComputedStyle(short.part('overlay')).position === 'absolute' && short.part('content').inert, 'still covers and inerts the region');
    }],

    ['breadcrumb: a long trail folds the middle crumbs behind a button that expands them', async t => {
        const el = await t.mount('<pk-breadcrumb max="3"><a href="#">A</a><a href="#">B</a><a href="#">C</a><a href="#">D</a><a href="#">E</a></pk-breadcrumb>');
        await t.settle();
        const folded = () => [...el.querySelectorAll('a')].filter(a => a.hasAttribute('data-folded')).map(a => a.textContent);
        t.eq(folded().join(''), 'BC'); t.eq(el.querySelector('a:last-child').getAttribute('aria-current'), 'page');
        el.part('more').click(); await t.settle(); t.eq(folded().length, 0);
    }],

    ['stepper: states follow current; a linear stepper blocks skipping ahead; events are cancelable', async t => {
        const el = await t.mount('<pk-stepper current="1" clickable><pk-step heading="A"></pk-step><pk-step heading="B"></pk-step><pk-step heading="C"></pk-step></pk-stepper>');
        await t.settle();
        const steps = [...el.querySelectorAll('pk-step')];
        t.eq(steps.map(s => s.state).join(), 'done,active,todo'); t.ok(steps[2].last);
        t.eq(steps[1].internals.ariaCurrent, 'step'); t.ok(steps[2].disabled, 'cannot skip ahead');
        let n = 0; el.addEventListener('pk-step-change', e => { n++; e.preventDefault(); });
        steps[0].click(); await t.settle(); t.eq(n, 1); t.eq(el.current, 1, 'vetoed');
        el.removeEventListener('pk-step-change', () => {}); el.next(); await t.settle();
    }],

    ['toc: lists the headings of its target with generated ids and marks the current one', async t => {
        const host = t.stage('<article id="toc-x"><h2>Overview</h2><p>a</p><h2>Getting started</h2><h3>Options</h3></article><pk-toc for="#toc-x" heading="On this page"></pk-toc>');
        await t.load(host); await t.settle();
        const toc = host.querySelector('pk-toc'); const links = [...toc.shadowRoot.querySelectorAll('a')];
        t.eq(links.map(a => a.textContent).join('|'), 'Overview|Getting started|Options');
        t.eq(host.querySelector('h2').id, 'overview'); t.eq(links.filter(a => a.hasAttribute('aria-current')).length, 1);
    }],

    ['side nav: filter shows matches and opens their branch, tree keys walk the rows, the rail marks items', async t => {
        const el = await t.mount('<pk-side-nav open filterable><a slot="brand" href="#">App</a><pk-nav-item href="#">Orders</pk-nav-item><pk-nav-item>Products<pk-nav-item slot="children" href="#">Drafts</pk-nav-item><pk-nav-item slot="children" href="#">Archive</pk-nav-item></pk-nav-item></pk-side-nav>');
        await t.settle();
        const [orders, products, drafts] = el.querySelectorAll('pk-nav-item');
        const input = el.part('filter-input'); input.value = 'draft'; input.dispatchEvent(new Event('input')); await t.settle();
        t.ok(orders.hidden, 'non-match hidden'); t.ok(!products.hidden && products.expanded, 'branch open'); t.ok(!drafts.hidden);
        input.value = ''; input.dispatchEvent(new Event('input')); await t.settle(); t.ok(!orders.hidden); t.ok(!products.expanded, 'state restored');
        orders.focusRow(); t.key(orders, 'ArrowDown'); await t.settle(); t.eq(document.activeElement, products, 'walks to the branch');
        t.key(products, 'ArrowRight'); await t.settle(); t.ok(products.expanded);
        t.key(products, 'ArrowRight'); await t.settle(); t.eq(document.activeElement, drafts, 'enters the branch');
        t.key(drafts, 'ArrowLeft'); await t.settle(); t.eq(document.activeElement, products, 'back to the parent');
        el.collapsed = true; await t.settle(); t.eq(orders.rail, !mediaBelow('tablet').matches, 'items know they are in the rail (only on wide screens; a drawer ignores collapse)');
    }],

    ['side nav rail: flyout children keep their labels and the flyout is named by its branch (issue 299)', async t => {
        if (mediaBelow('tablet').matches) return;
        const el = await t.mount('<pk-side-nav open collapsed><pk-nav-item href="#">Orders</pk-nav-item><pk-nav-item>Products<pk-nav-item slot="children" href="#">Drafts</pk-nav-item><pk-nav-item slot="children" href="#">Archive</pk-nav-item></pk-nav-item></pk-side-nav>');
        await t.settle();
        const [orders, products, drafts] = el.querySelectorAll('pk-nav-item');
        t.ok(orders.rail && products.rail, 'top-level rows are in the rail'); t.ok(!drafts.rail, 'a child is not in the rail');
        products.part('link').click(); await t.settle();
        t.ok(products.flyout, 'the branch opens as a flyout');
        t.ok(getComputedStyle(drafts.part('label')).display !== 'none', 'the child shows its label');
        t.eq(products.part('sub-title').textContent, 'Products'); t.ok(getComputedStyle(products.part('sub-title')).display !== 'none', 'the flyout heading shows');
        t.eq(products.part('sub').getAttribute('aria-label'), 'Products', 'the flyout is a group named by the branch');
        t.key(products.part('link'), 'ArrowRight'); await t.settle(); t.eq(document.activeElement, drafts, 'ArrowRight enters the flyout');
        t.key(drafts, 'ArrowLeft'); await t.settle(); t.eq(document.activeElement, products, 'ArrowLeft returns to the branch');
    }],

    ['side nav: the brand hides in the icon rail even inside a Blazor-style display: contents wrapper (issue 297)', async t => {
        const el = await t.mount('<pk-side-nav open><span slot="brand" class="u-contents"><a href="#">App</a></span><pk-nav-item href="#">Orders</pk-nav-item></pk-side-nav>');
        const brand = el.querySelector('span[slot="brand"]'); await t.settle();
        t.ok(brand.firstElementChild.getBoundingClientRect().width > 0, 'expanded: the brand shows');
        el.collapsed = true; await t.settle();
        t.eq(brand.firstElementChild.getBoundingClientRect().width, 0, 'collapsed: the brand has no box in the rail although its wrapper is display: contents');
        t.ok(el.part('collapse').getBoundingClientRect().right <= el.getBoundingClientRect().right, 'the collapse button stays inside the rail');
    }],

    ['side nav: collapsed state and open branches persist under the persist key', async t => {
        const key = 'pk-test-nav';
        try { localStorage.removeItem(key); } catch { /* blocked */ }
        const a = await t.mount(`<pk-side-nav open persist="${key}"><pk-nav-item>Products<pk-nav-item slot="children" href="#">Drafts</pk-nav-item></pk-nav-item></pk-side-nav>`);
        a.collapsed = true; a.querySelector('pk-nav-item').expanded = true; a.querySelector('pk-nav-item').emit('pk-toggle', { expanded: true }); await t.settle();
        const b = await t.mount(`<pk-side-nav open persist="${key}"><pk-nav-item>Products<pk-nav-item slot="children" href="#">Drafts</pk-nav-item></pk-nav-item></pk-side-nav>`);
        await t.settle(); t.ok(b.collapsed, 'collapsed restored'); t.ok(b.querySelector('pk-nav-item').expanded, 'branch restored');
        try { localStorage.removeItem(key); } catch { /* blocked */ }
    }],

    ['nav item: a branch button toggles expanded; current and disabled set ARIA on the row', async t => {
        const el = await t.mount('<pk-nav-item>Products<pk-nav-item slot="children" href="#" current>All</pk-nav-item></pk-nav-item>');
        el.part('sub'); const branch = el.part('link');
        let got; el.addEventListener('pk-toggle', e => { got = e.detail; });
        branch.click(); await t.settle(); t.ok(el.expanded); t.eq(got.expanded, true); t.eq(branch.getAttribute('aria-expanded'), 'true');
        const child = el.querySelector('pk-nav-item'); await t.settle();
        t.eq(child.shadowRoot.querySelector('a').getAttribute('aria-current'), 'page');
    }],

    ['command palette: opens on Ctrl+K, filters as you type, Enter fires pk-select with the item and records a recent', async t => {
        localStorage.removeItem('pk-test-recents');
        const el = await t.mount('<pk-command-palette recents-key="pk-test-recents"></pk-command-palette>');
        el.items = [{ id: 'o', label: 'Go to Orders', group: 'Navigate' }, { id: 'p', label: 'Go to Products', group: 'Navigate' }, { id: 'n', label: 'New purchase order', group: 'Create' }];
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true, cancelable: true })); await t.settle();
        t.ok(el.open && el.part('dialog').open, 'Ctrl+K opens');
        t.eq(el.part('list').querySelectorAll('[role="option"]').length, 3);
        const input = el.part('input'); input.value = 'products'; input.dispatchEvent(new Event('input')); await t.settle();
        const opts = el.part('list').querySelectorAll('[role="option"]');
        t.eq(opts.length, 1); t.ok(opts[0].querySelector('mark'), 'matched letters are marked');
        t.eq(input.getAttribute('aria-activedescendant'), opts[0].id);
        let item; el.addEventListener('pk-select', e => { item = e.detail.item; });
        t.key(input, 'Enter'); await t.settle();
        t.eq(item.id, 'p'); t.ok(!el.open); t.eq(JSON.parse(localStorage.getItem('pk-test-recents'))[0], 'p');
        localStorage.removeItem('pk-test-recents');
    }],

    ['lightbox: shows the item at an index, steps with wrap-around, refuses unsafe sources', async t => {
        const el = await t.mount('<pk-lightbox><button>Open</button></pk-lightbox>');
        el.items = [{ src: '../../icons.svg', alt: 'One', caption: 'First' }, { src: 'java' + 'script:alert(1)', alt: 'Two' }, { src: '../../icons.svg', alt: 'Three' }];
        el.querySelector('button').click(); await t.settle();
        t.ok(el.open && el.part('dialog').open); t.eq(el.part('image').alt, 'One'); t.eq(el.part('counter').textContent, '1 / 3');
        el.go(-1); await t.settle(); t.eq(el.index, 2, 'wraps backwards');
        el.go(1); el.go(1); await t.settle(); t.eq(el.index, 1); t.ok(!el.part('image').hasAttribute('src'), 'unsafe src is not shown');
        el.hide(); await t.settle(); t.ok(!el.open);
    }],

    ['navbar: the hamburger toggles open and Escape closes it; app shell toggles its nav drawer', async t => {
        const nb = await t.mount('<pk-navbar><a slot="brand" href="#">A</a><a href="#">One</a></pk-navbar>');
        nb.part('toggle').click(); await t.settle(); t.ok(nb.open); t.eq(nb.part('toggle').getAttribute('aria-expanded'), 'true');
        t.key(nb.part('toggle'), 'Escape'); await t.settle(); t.ok(!nb.open);
        const sh = await t.mount('<pk-app-shell><pk-side-nav slot="nav"><pk-nav-item href="#">Home</pk-nav-item></pk-side-nav><button slot="header" data-nav-toggle>Menu</button>Body</pk-app-shell>');
        sh.querySelector('button').click(); await t.settle();
        if (mediaBelow('tablet').matches) { t.ok(sh.querySelector('pk-side-nav').open); t.ok(sh.navOpen); } // a drawer below the breakpoint
        else { t.ok(sh.navHidden, 'wide: the toggle hides the nav (issue 298)'); t.ok(!sh.navOpen); }
    }],

    ['app shell: a Blazor-style wrapper span in the nav slot (issue 212) still gets found and toggled', async t => {
        const sh = await t.mount('<pk-app-shell><span slot="nav" class="u-contents"><pk-side-nav><pk-nav-item href="#">Home</pk-nav-item></pk-side-nav></span><button slot="header" data-nav-toggle>Menu</button>Body</pk-app-shell>');
        const nav = sh.querySelector('pk-side-nav'); sh.querySelector('button').click(); await t.settle();
        if (mediaBelow('tablet').matches) { t.ok(nav.open, 'the wrapper span must not hide the side nav from the shell'); t.ok(sh.navOpen); }
        else { t.ok(sh.navHidden, 'the wrapper span must not hide the side nav from the shell'); t.eq(nav.getBoundingClientRect().width, 0, 'the wrapped nav is gone although its wrapper is display: contents'); }
    }],

    ['app shell: on a wide screen the nav toggle hides and shows the nav, keeps its icon-rail state and remembers the choice under the nav persist key (issue 298)', async t => {
        if (mediaBelow('tablet').matches) return;
        const key = 'pk-test-shell-nav';
        try { localStorage.removeItem(key + ':nav-hidden'); } catch { /* blocked */ }
        const html = `<pk-app-shell><pk-side-nav slot="nav" persist="${key}" collapsed><pk-nav-item href="#">Home</pk-nav-item></pk-side-nav><button slot="header" data-nav-toggle>Menu</button><p>Body</p></pk-app-shell>`;
        const sh = await t.mount(html); await t.settle();
        const nav = sh.querySelector('pk-side-nav'), main = sh.part('main'), full = sh.getBoundingClientRect().width;
        t.ok(nav.getBoundingClientRect().width > 0 && main.getBoundingClientRect().width < full, 'the nav shows beside the body');
        let ev = null; sh.addEventListener('pk-nav-toggle', e => { ev = e.detail; });
        sh.querySelector('button').click(); await t.settle();
        t.ok(sh.navHidden && sh.hasAttribute('nav-hidden')); t.eq(ev?.hidden, true, 'the commit event carries the new state');
        t.eq(nav.getBoundingClientRect().width, 0, 'the nav is hidden'); t.eq(Math.round(main.getBoundingClientRect().width), Math.round(full), 'the body takes the full width');
        t.ok(nav.collapsed, 'the nav keeps its icon-rail state');
        const b = sh.querySelector('button'); b.focus(); t.eq(document.activeElement, b, 'the toggle stays reachable by keyboard while the nav is hidden');
        const again = await t.mount(html); await t.settle();
        t.ok(again.navHidden, 'a new shell restores the hidden state'); t.eq(again.querySelector('pk-side-nav').getBoundingClientRect().width, 0);
        again.querySelector('button').click(); await t.settle();
        t.ok(!again.navHidden, 'the toggle shows the nav again');
        t.ok(again.querySelector('pk-side-nav').collapsed && again.querySelector('pk-side-nav').getBoundingClientRect().width > 0, 'shown again in its previous icon-rail state');
        try { localStorage.removeItem(key + ':nav-hidden'); localStorage.removeItem(key); } catch { /* blocked */ }
    }],

    ['app-bar-search: typing debounces pk-query, items render as results, arrows and Enter pick one and raise pk-select, Escape closes', async t => {
        const el = await t.mount('<pk-app-bar-search debounce="10" label="Search"></pk-app-bar-search>');
        const input = el.part('control');
        let queries = 0; el.addEventListener('pk-query', () => queries++);
        input.value = 'wid'; input.dispatchEvent(new Event('input', { bubbles: true }));
        t.ok(el.part('popup').hidden === false, 'the popup opens while typing, before results arrive');
        await new Promise(r => setTimeout(r, 60));
        t.eq(queries, 1, 'one debounced pk-query, not one per keystroke');
        el.items = [{ id: 'a', label: 'Widget A', group: 'Products', sub: 'AC-1001' }, { id: 'b', label: 'Widget B', group: 'Products', badge: 'New' }];
        await t.settle();
        const rows = [...el.part('popup').querySelectorAll('[role="option"]')];
        t.eq(rows.length, 2); t.eq(rows[0].querySelector('[part="row-label"]').textContent, 'Widget A'); t.eq(rows[0].querySelector('[part="row-sub"]').textContent, 'AC-1001');
        t.ok(!rows[1].querySelector('[part="badge"]').hidden, 'a badge shows when the item has one');
        t.ok(el.part('popup').querySelector('[role="presentation"]'), 'a group heading renders once for the shared group');
        let picked = null; el.addEventListener('pk-select', e => { picked = e.detail.item; });
        t.key(input, 'ArrowDown'); t.key(input, 'ArrowDown'); t.key(input, 'Enter');
        t.eq(picked?.id, 'b', 'two ArrowDown from nothing highlighted lands on the second row');
        t.ok(el.part('popup').hidden, 'picking a result closes the popup');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        t.key(input, 'Escape'); t.ok(el.part('popup').hidden, 'Escape closes the results');
    }],

    ['app-bar-search: a pill that grows to the room it is given, and compact keeps the icon button at any width', async t => {
        const row = await t.mount('<div><pk-app-bar-search label="Search" placeholder="Search products, orders"></pk-app-bar-search></div>');
        row.style.display = 'flex'; row.style.width = '900px';
        const el = row.firstElementChild, box = el.part('box'), r = box.getBoundingClientRect();
        t.ok(r.width > 300 && r.width <= 34 * 16 + 1, 'the field fills the row up to 34rem, not a fixed 14rem');
        t.ok(getComputedStyle(box).borderTopLeftRadius === '999px' && getComputedStyle(box).borderTopLeftRadius !== '50%', 'a pill, not an oval');
        el.compact = true; await t.settle();
        t.ok(el.part('expand').getBoundingClientRect().width > 0 && box.getBoundingClientRect().width === 0, 'compact shows only the icon button on a wide row');
        el.part('expand').click(); await t.settle();
        t.ok(el.expanded && box.getBoundingClientRect().width > 0, 'pressing it expands the field over the header row');
        t.key(el.part('control'), 'Escape'); t.ok(!el.expanded, 'Escape collapses it');
    }],
    ['app-bar-search: centred in the free space of the shell header on a wide screen, and --pk-app-bar-search-align moves it (issue 295)', async t => {
        if (mediaBelow('phone').matches) return;
        const sh = await t.mount('<pk-app-shell><pk-side-nav slot="nav"><pk-nav-item href="#">Home</pk-nav-item></pk-side-nav><button slot="header" data-nav-toggle>Menu</button><pk-app-bar-search slot="header" label="Search"></pk-app-bar-search><button slot="header">Account</button><p>Body</p></pk-app-shell>');
        await t.settle();
        const [menu, account] = sh.querySelectorAll('button'), el = sh.querySelector('pk-app-bar-search');
        const free = () => { const a = menu.getBoundingClientRect().right, b = account.getBoundingClientRect().left, r = el.getBoundingClientRect(); return { mid: (a + b) / 2, centre: (r.left + r.right) / 2, gapL: r.left - a, gapR: b - r.right, w: r.width }; };
        let f = free();
        t.ok(f.w > 300, 'the field is still a wide pill'); t.ok(Math.abs(f.mid - f.centre) <= 2, 'centred between the toggle and the actions');
        el.style.setProperty('--pk-app-bar-search-width', '16rem'); el.style.setProperty('--pk-app-bar-search-align', '0 auto'); await t.settle(); f = free();
        t.ok(f.w <= 16 * 16 + 1, 'the width hook still caps it'); t.ok(f.gapL < 20 && f.gapR > 40, 'the hook keeps it at the start (only the header gap after the toggle)');
        el.compact = true; await t.settle(); f = free();
        t.ok(f.gapL < 20, 'the icon button is not centred');
    }],

    ['app-bar-search: the popup is wider than a narrow field, a footer slot shows, and an item without an id is an unselectable note', async t => {
        const row = await t.mount('<div><pk-app-bar-search label="Search"><a slot="footer" href="#all">Full search</a></pk-app-bar-search></div>');
        row.style.display = 'flex'; row.style.width = '120px';
        const el = row.firstElementChild, pop = el.part('popup'), input = el.part('control');
        el.items = [{ id: 'a', label: 'A comic title with a long variant', group: 'Comics' }, { label: '+12 more' }];
        input.value = 'x'; input.dispatchEvent(new Event('input', { bubbles: true })); await t.settle();
        t.ok(el.part('box').getBoundingClientRect().width < 300 && pop.getBoundingClientRect().width >= 300, 'the panel keeps its minimum width though the field is narrow');
        t.ok(!el.part('footer').hidden && el.part('footer').getBoundingClientRect().height > 0, 'the footer slot shows');
        t.eq(pop.querySelectorAll('[role="option"]').length, 1); t.ok(pop.querySelector('[part="note"]')?.textContent === '+12 more', 'the id-less item is a note, not an option');
        t.key(input, 'ArrowDown'); t.key(input, 'ArrowDown'); t.eq(el.$a, 0, 'the note is skipped by the arrow keys');
    }],
    ['app-bar-search (375px): collapses to an icon button, expands to a full-width field, and the shell drawer opening collapses it', async t => {
        const { sampleDoc } = await import('../../site/gallery/frame.js');
        const html = '<pk-app-shell><pk-side-nav slot="nav"><pk-nav-item href="#">Home</pk-nav-item></pk-side-nav><pk-app-bar-search slot="header" label="Search"></pk-app-bar-search><button slot="header" data-nav-toggle>Menu</button></pk-app-shell>';
        const host = t.stage(''), f = document.createElement('iframe');
        f.title = 'sample'; f.style.width = '375px'; f.style.height = '400px'; f.style.border = '0';
        const loaded = new Promise(r => f.addEventListener('load', r, { once: true })); host.append(f); f.srcdoc = sampleDoc(html); await loaded;
        const until = async fn => { for (let i = 0; i < 100; i++) { const v = fn(); if (v) return v; await new Promise(r => setTimeout(r, 50)); } throw new Error('did not upgrade'); };
        const search = await until(() => f.contentDocument.querySelector('pk-app-bar-search')?.shadowRoot?.querySelector('[part="expand"]') && f.contentDocument.querySelector('pk-app-bar-search'));
        await new Promise(r => setTimeout(r, 100));
        t.eq(f.contentWindow.innerWidth, 375);
        const expandBtn = search.part('expand'), box = search.part('box');
        t.ok(expandBtn.getBoundingClientRect().width > 0, 'the icon button shows on a phone'); t.ok(box.getBoundingClientRect().width === 0, 'the pill is hidden');
        expandBtn.click(); await t.settle();
        t.ok(search.expanded, 'expand() sets expanded'); t.ok(box.getBoundingClientRect().width > 0, 'the pill shows once expanded');
        const shell = f.contentDocument.querySelector('pk-app-shell');
        shell.querySelector('button').click(); await t.settle();
        t.ok(!search.expanded, 'the drawer opening collapses the search field, so two overlays never show at once');
    }],

    ['app shell: the title slot and back link fill the top bar; the link is a real 44px link named by back-label, and an unsafe address is dropped', async t => {
        const sh = await t.mount('<pk-app-shell back-href="#list" back-label="Back to Things"><h1 slot="title">Thing 7</h1><button slot="header" data-nav-toggle>Menu</button>Body</pk-app-shell>'); await t.settle();
        const back = sh.part('back'); const box = back.getBoundingClientRect();
        t.ok(!back.hidden && back.getAttribute('href') === '#list', 'a real link to the parent'); t.eq(back.getAttribute('aria-label'), 'Back to Things');
        t.ok(box.width >= 43.5 && box.height >= 43.5, 'a 44px target'); back.focus(); t.eq(sh.shadowRoot.activeElement, back, 'reachable by keyboard');
        t.eq(sh.slotted('title')[0].textContent, 'Thing 7'); t.ok(getComputedStyle(sh.part('header')).display === 'flex' && sh.part('title').getBoundingClientRect().width > 0, 'the title shows in the top bar');
        t.ok(sh.querySelector('h1').getBoundingClientRect().left > box.right - 1, 'the title follows the back link');
        sh.backHref = ['javascript', 'void(0)'].join(':'); await t.settle(); t.ok(back.hidden, 'a script address is not linked');
        const bare = await t.mount('<pk-app-shell><button slot="header">Menu</button>Body</pk-app-shell>'); await t.settle(); t.ok(bare.part('title').hidden && getComputedStyle(bare.part('title')).display === 'none' && bare.part('back').hidden, 'no title and no link: the header slot keeps its place at the start'); t.ok(bare.querySelector('button').getBoundingClientRect().left < bare.getBoundingClientRect().left + 100);
    }],

    ['scroll aids: progress starts at 0, back-to-top is hidden until scrolled, the skip link points at a same-page fragment', async t => {
        const p = await t.mount('<pk-scroll-progress></pk-scroll-progress>'); await t.settle();
        t.ok(Number(p.style.getPropertyValue('--pk-progress')) >= 0);
        const b = await t.mount('<pk-back-to-top></pk-back-to-top>'); await t.settle();
        t.ok(!b.visible || document.scrollingElement.scrollTop > 400);
        const s = await t.mount('<pk-skip-link href="#main">Skip</pk-skip-link>'); await t.settle();
        t.eq(s.part('link').getAttribute('href'), '#main');
        s.href = 'https://evil.example/#x'; await t.settle(); t.ok(!s.part('link').hasAttribute('href'), 'a non-fragment target is refused');
    }],

    ['pager and step render their slots', async t => {
        const p = await t.mount('<pk-pager><a slot="prev" href="#">Prev</a><span>2 of 5</span><a slot="next" href="#">Next</a></pk-pager>');
        t.eq(p.slotted('prev').length, 1); t.eq(p.slotted('next').length, 1);
    }],

    ['page busy: a framework-owned overlay appears after the delay, stays the minimum time, shifts no layout, and never flashes for a fast action', async t => {
        const { createPage } = await import('../../js/page.js');
        const host = t.stage('<div><main id="pb-body"><h2>Orders</h2><p>Row one</p><button>Inside</button></main></div>');
        await t.load(host);
        const body = host.querySelector('#pb-body');
        const before = body.getBoundingClientRect();
        let cls = 0;
        const po = new PerformanceObserver(list => { for (const e of list.getEntries()) if (!e.hadRecentInput) cls += e.value; });
        po.observe({ type: 'layout-shift', buffered: false });
        const page = createPage({ body, delay: 80, minTime: 200 });
        const ov = body.parentElement;
        t.eq(ov.localName, 'pk-loading-overlay'); await t.load(host);
        const same = () => { const r = body.getBoundingClientRect(); return r.x === before.x && r.y === before.y && r.width === before.width && r.height === before.height; };
        t.ok(same(), 'wrapping does not move the body');
        const fast = page.begin('Quick'); await wait(20); t.eq(body.getAttribute('aria-busy'), 'true'); fast(); await wait(140);
        t.ok(!ov.busy && getComputedStyle(ov.part('overlay')).display === 'none', 'an action shorter than the delay never shows the overlay'); t.ok(!body.hasAttribute('aria-busy'));
        const slow = page.begin('Saving <b>x</b>'); await wait(30); t.ok(!ov.busy, 'not yet, inside the delay');
        await wait(90); t.ok(ov.busy, 'shown after the delay'); t.eq(getComputedStyle(ov.part('overlay')).display, 'flex');
        t.eq(ov.part('label').textContent, 'Saving <b>x</b>', 'the label is text'); t.eq(ov.part('label').children.length, 0);
        t.ok(ov.part('overlay').getAttribute('aria-live') === 'polite' && ov.part('overlay').getAttribute('role') === 'status', 'announced politely');
        t.ok(same(), 'showing the overlay moves nothing');
        slow(); await wait(20); t.ok(ov.busy, 'still shown inside the minimum time'); await wait(260); t.ok(!ov.busy, 'hidden after the minimum time');
        await wait(50); po.disconnect(); t.ok(cls < 0.001, `layout shift while the overlay showed and hid: ${cls}`);
        page.destroy(); t.ok(body.parentElement === host.firstElementChild, 'destroy puts the body back'); t.ok(!host.querySelector('pk-loading-overlay'));
    }],

    ['page busy: overlapping actions keep the overlay up until the last one finishes; a rejection releases only its own token', async t => {
        const { createPage } = await import('../../js/page.js');
        const host = t.stage('<pk-alert id="pb-alert" hidden></pk-alert><div><main id="pb2"><button>Inside</button></main></div>');
        await t.load(host);
        const page = createPage({ body: host.querySelector('#pb2'), alert: host.querySelector('#pb-alert'), delay: 0, minTime: 0 });
        const ov = host.querySelector('pk-loading-overlay'); await t.load(host);
        let endA; const a = page.busy(() => new Promise(r => { endA = r; }), 'First');
        let endB; const b = page.busy(() => new Promise(r => { endB = r; }), 'Second'); await t.settle();
        t.ok(ov.busy); t.eq(ov.part('label').textContent, 'Second'); t.ok(ov.part('content').inert);
        endB(); await b; await t.settle(); t.ok(ov.busy, 'the first is still running'); t.eq(ov.part('label').textContent, 'First');
        await page.busy(async () => { throw new Error('boom'); }, 'Bad').catch(() => { /* the case only checks the token */ }); await t.settle(); t.ok(ov.busy, 'the failure released only its own token');
        t.eq(host.querySelector('#pb-alert').kind, 'danger');
        endA(); await a; await t.settle(); t.ok(!ov.busy && !ov.part('content').inert, 'idle after the last');
        page.destroy();
    }],

    ['tasks: a task toast is composed from pk-toast, text and pk-progress, updated in place, cancellable with Retry after a failure, and sits at the bottom end', async t => {
        const { createTasks } = await import('../../js/tasks.js');
        const host = t.stage('<div></div>');
        const tasks = createTasks({ container: host, concurrency: 1, doneDelay: 60, load: el => t.load(el) });
        let g; const gate = () => new Promise((r, no) => { g = { r, no }; });
        let attempts = 0;
        const h = tasks.run({ title: 'Import <b>x</b>', details: 'Reading', cancellable: true, run: async ctx => { ctx.progress(30); await gate(); } });
        const queued = tasks.run({ title: 'Second', retry: true, run: async () => { if (++attempts === 1) throw new Error('secret detail'); } });
        await t.load(host); await t.settle(); await wait(300);
        const stack = host.querySelector('pk-toast-stack[position="bottom-end"]'); t.ok(stack, 'a bottom-end stack');
        const toasts = [...stack.querySelectorAll('pk-toast')]; t.eq(toasts.length, 2);
        const [a, b] = toasts;
        t.eq(a.heading, 'Import <b>x</b>'); t.eq(a.querySelector('b'), null, 'the title is text, never markup');
        t.eq(a.duration, 0); t.eq(a.querySelector('pk-progress').value, 30); t.ok(!a.querySelector('pk-progress').indeterminate);
        t.eq(b.querySelector('pk-progress').part('label').textContent, 'Queued');
        const r = a.getBoundingClientRect(); t.ok(r.right <= innerWidth && r.bottom <= innerHeight && r.left > innerWidth / 3, 'at the bottom end, inside the viewport');
        t.ok(a.noClose && getComputedStyle(a.part('close')).display === 'none', 'a running toast has no close button');
        t.eq(host.querySelectorAll('pk-toast').length, 2); a.querySelector('pk-button').click(); await t.settle();
        t.eq(h.state, 'cancelled'); t.ok(a.isConnected, 'the toast stays to say cancelled'); t.eq(a.kind, 'warning');
        await h.promise; await wait(150); t.ok(!a.isConnected, 'and goes shortly after');
        const rb = await queued.promise; t.eq(rb.state, 'failed'); await t.settle();
        t.eq(b.kind, 'danger'); t.eq(b.querySelector('div').textContent, 'This task failed. Try again, or check the log.', 'the raw error message is not shown');
        b.querySelector('pk-button').click(); await t.settle(); await wait(50);
        t.ok(!b.isConnected, 'Retry replaces the failed toast'); t.eq(attempts, 2);
        tasks.destroy(); t.ok(!host.querySelector('pk-toast-stack'), 'destroy removes the stack it created');
    }],

    ['tasks: 100 run, complete, fail, cancel and dismiss cycles leave no toast, node or timer', async t => {
        const { createTasks } = await import('../../js/tasks.js');
        const host = t.stage('<div></div>');
        const tasks = createTasks({ container: host, doneDelay: 5, load: el => t.load(el) });
        const open = new Set(); const st = window.setTimeout, ct = window.clearTimeout;
        window.setTimeout = (fn, ms, ...a) => { const id = st(() => { open.delete(id); fn(...a); }, ms); open.add(id); return id; };
        window.clearTimeout = id => { open.delete(id); ct(id); };
        try {
            for (let i = 0; i < 100; i++) {
                const k = i % 4;
                const x = tasks.run({ title: `t${i}`, cancellable: k === 2, timeout: k === 3 ? 30 : 0, run: async ctx => { ctx.progress(1, 2); ctx.details('x'); if (k === 1) throw new Error('boom'); if (k >= 2) await new Promise(() => {}); } });
                if (k === 2) x.cancel();
                await x.promise;
                if (k === 1 || k === 3) for (const e of host.querySelectorAll('pk-toast')) e.dismiss('close');
                if (i % 10 === 9) await wait(20);
            }
            await wait(50);
            t.eq(host.querySelectorAll('pk-toast').length, 0, 'no toast is left');
            t.eq(host.querySelector('pk-toast-stack').children.length, 0);
            t.eq(open.size, 0, `${open.size} timers are pending`);
            tasks.destroy();
            t.eq(host.querySelectorAll('*').length, 1, 'only the stage div is left');
        } finally { window.setTimeout = st; window.clearTimeout = ct; }
    }],
];
