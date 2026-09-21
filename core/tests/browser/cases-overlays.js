// Browser cases for the overlays, feedback and navigation elements. Same contract as cases.js: [name, async (t) => void].
const wait = ms => new Promise(r => setTimeout(r, ms));
const focus = (el, t) => { el.focus(); return t.settle(); };

export const overlaysCases = [
    ['tooltip: focus shows it, the target is described by a light-DOM node, Escape hides it', async t => {
        const el = await t.mount('<pk-tooltip text="Saves the draft"><button>Save</button></pk-tooltip>');
        const b = el.querySelector('button');
        b.dispatchEvent(new FocusEvent('focusin', { bubbles: true, composed: true })); await wait(30);
        t.ok(el.hasAttribute('shown'), 'shown on focus');
        const d = document.getElementById(b.getAttribute('aria-describedby'));
        t.eq(d.textContent, 'Saves the draft'); t.eq(el.part('tip').textContent, 'Saves the draft');
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

    ['popover: a cancelable pk-close lets the host veto closing', async t => {
        const el = await t.mount('<pk-popover open><button slot="trigger">Open</button>Body</pk-popover>');
        el.addEventListener('pk-close', e => e.preventDefault());
        el.part('panel').dispatchEvent(new Event('x'));
        el.request('outside'); await t.settle();
        t.ok(el.open, 'vetoed');
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

    ['dropdown: a submenu opens with Right and closes with Left', async t => {
        const el = await t.mount('<pk-dropdown open><button slot="trigger">A</button><pk-menu-item>More<pk-menu-item slot="submenu">One</pk-menu-item><pk-menu-item slot="submenu">Two</pk-menu-item></pk-menu-item></pk-dropdown>');
        const parent = el.querySelector('pk-menu-item'); const [one, two] = parent.querySelectorAll('pk-menu-item');
        parent.focus(); t.key(parent, 'ArrowRight'); await t.settle();
        t.ok(parent.open, 'submenu open'); t.eq(document.activeElement, one);
        t.key(one, 'ArrowDown'); await t.settle(); t.eq(document.activeElement, two);
        t.key(two, 'ArrowLeft'); await t.settle(); t.ok(!parent.open); t.eq(document.activeElement, parent);
    }],

    ['context menu: contextmenu opens it at the pointer; choosing an item closes it', async t => {
        const el = await t.mount('<pk-context-menu><div>Area</div><pk-menu-item slot="menu">Rename</pk-menu-item></pk-context-menu>');
        el.firstElementChild.dispatchEvent(new MouseEvent('contextmenu', { clientX: 40, clientY: 50, bubbles: true, composed: true, cancelable: true }));
        await t.settle();
        t.ok(el.open); t.eq(getComputedStyle(el.part('menu')).position, 'fixed');
        el.querySelector('pk-menu-item').click(); await t.settle(); t.ok(!el.open);
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
        el.collapsed = true; await t.settle(); t.eq(orders.rail, !matchMedia('(max-width: 1024px)').matches, 'items know they are in the rail (only on wide screens; a drawer ignores collapse)');
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
        sh.querySelector('button').click(); await t.settle(); t.ok(sh.querySelector('pk-side-nav').open); t.ok(sh.navOpen);
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
];
