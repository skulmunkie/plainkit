// Browser cases for pk-page-shell (#423): header, tabs, whole-page state and content arranged in one column, measured at a desktop and a phone width.
const rect = el => el.getBoundingClientRect();
const MARKUP = state => `<pk-page-shell heading="PO 1042"${state}><pk-button slot="actions" id="act">Receive</pk-button><pk-tabs slot="tabs" label="Sections"><pk-tab value="a">Lines</pk-tab><pk-tab value="b">History</pk-tab></pk-tabs><p id="body">Content</p></pk-page-shell>`;
const header = el => el.part('header');

export const pageShellCases = [
    ['page-shell: header, tabs and content stack in one column at desktop and phone width, in that order, with no overlap', async t => {
        for (const width of [1000, 375]) {
            const host = t.stage(MARKUP('')); host.style.width = width + 'px'; await t.load(host); await customElements.whenDefined('pk-page-header'); await t.settle();
            const el = host.firstElementChild, h = header(el), title = h.shadowRoot.querySelector('[part="title"]');
            const tabs = el.querySelector('pk-tabs'), body = el.querySelector('#body'), act = el.querySelector('#act');
            t.ok(rect(el).width <= width + 1, `${width}: the shell fits its container`);
            t.ok(rect(act).bottom <= rect(tabs).top + 1 || rect(act).top >= rect(title).top - 1, `${width}: the actions sit in the title bar, above the tabs`);
            t.ok(rect(tabs).top >= rect(title).bottom - 1, `${width}: the tabs are under the title`);
            t.ok(rect(body).top >= rect(tabs).bottom - 1, `${width}: the content starts under the tabs`);
            t.ok(rect(body).top - rect(h).bottom >= 4, `${width}: the shell, not the page, spaces the header from the content`);
            t.ok(rect(act).right <= rect(el).right + 1 && rect(act).left >= rect(el).left - 1, `${width}: the actions stay inside the shell`);
            t.eq(h.shadowRoot.querySelector('[part="title"]').getAttribute('aria-level'), '1');
        }
    }],

    ['page-shell: crumbs and the actions share the title row at desktop width; a tab change reaches the page and the single content region stays', async t => {
        const host = t.stage('<pk-page-shell heading="PO 1042" crumbs=\'[{"label":"Stock","href":"#"},{"label":"PO 1042"}]\'><pk-button slot="actions" id="act">Receive</pk-button><pk-tabs slot="tabs" label="Sections"><pk-tab value="a">Lines</pk-tab><pk-tab value="b">History</pk-tab></pk-tabs><p id="body">Content</p></pk-page-shell>');
        host.style.width = '1000px'; await t.load(host); await customElements.whenDefined('pk-page-header'); await t.settle();
        const el = host.firstElementChild, act = el.querySelector('#act');
        const trail = header(el).shadowRoot.querySelector('[part="trail"]');
        t.ok(!trail.hidden, 'the crumbs are drawn by the header');
        t.ok(rect(act).left > rect(trail).left, 'the actions are at the end of the row');
        let got = null; el.addEventListener('pk-tab-change', e => { got = e.detail.value; });
        el.querySelector('pk-tab[value="b"]').click(); await t.settle();
        t.eq(got, 'b'); t.eq(el.querySelectorAll('#body').length, 1);
    }],

    ['page-shell: a whole-page state replaces the content, keeps the header and the tabs, and leaves the content in the DOM', async t => {
        for (const width of [1000, 375]) {
            const host = t.stage(MARKUP(' state="error" state-heading="Could not load" state-description="The request failed."')); host.style.width = width + 'px'; await t.load(host); await customElements.whenDefined('pk-page-header'); await t.settle();
            const el = host.firstElementChild, st = el.part('state'), body = el.querySelector('#body'), tabs = el.querySelector('pk-tabs');
            t.ok(!st.hidden && rect(st).height > 0, `${width}: the state is drawn`);
            t.eq(rect(body).width, 0, `${width}: the content is hidden`);
            t.ok(rect(st).top >= rect(tabs).bottom - 1, `${width}: the state sits under the tabs, where the content would be`);
            t.ok(rect(st).right <= rect(el).right + 1, `${width}: the state fits the shell`);
            t.ok(st.textContent.includes('Could not load') || st.querySelector('pk-alert')?.getAttribute('heading') === 'Could not load', `${width}: the state carries its heading`);
            let retried = 0; el.addEventListener('pk-page-shell-retry', () => retried++);
            st.querySelector('pk-button').click();
            t.eq(retried, 1, 'Retry raises pk-page-shell-retry');
            el.state = 'ready'; await t.settle();
            t.ok(st.hidden && rect(body).height > 0, `${width}: ready shows the content again`);
            el.state = 'loading'; await t.settle();
            t.ok(st.querySelector('pk-skeleton'), `${width}: loading draws a skeleton`);
            t.ok(rect(body).width === 0 || body.closest('[hidden]'), `${width}: loading hides the content`);
        }
    }],

    ['page-shell: badges, the home crumb and actions-overflow reach the header (#1735)', async t => {
        const host = t.stage('<pk-page-shell heading="PO 1042" crumbs=\'[{"label":"Stock","href":"/s"},{"label":"PO 1042"}]\' actions-overflow="always" overflow-label="More"><pk-badge slot="badges" id="chip">Open</pk-badge><pk-button slot="actions" id="act">Receive</pk-button><p id="body">Content</p></pk-page-shell>');
        host.style.width = '1000px'; host.firstElementChild.setAttribute('home-href', '/'); await t.load(host); await customElements.whenDefined('pk-page-header'); await t.settle();
        const el = host.firstElementChild, root = header(el).shadowRoot, title = root.querySelector('[part="title"]'), chip = el.querySelector('#chip');
        t.ok(chip.assignedSlot && rect(chip).width > 0, 'the badge is drawn');
        t.ok(Math.abs((rect(chip).top + rect(chip).bottom) / 2 - (rect(title).top + rect(title).bottom) / 2) < 16 && rect(chip).left >= rect(title).right - 1, 'the badge shares the title row, after the title');
        t.ok(root.querySelector('[part="trail"] a[aria-label="Home"]')?.getAttribute('href') === '/', 'the home crumb leads the trail');
        const ob = root.querySelector('[part="overflow-button"]');
        t.ok(ob && !ob.closest('[hidden]') && rect(ob).width > 0, 'actions-overflow always draws the overflow button');
        t.eq(ob.getAttribute('label'), 'More', 'overflow-label names it');
    }],

    ['list page: config badges, homeHref and actionsOverflow draw in the title bar like pk-page-header (#1734, #1735)', async t => {
        const host = t.stage('<pk-list-page><pk-button slot="actions">New order</pk-button></pk-list-page>'); host.style.width = '1000px';
        const el = host.firstElementChild;
        el.config = { heading: 'Orders', breadcrumb: [{ label: 'Sales', href: '/s' }, { label: 'Orders' }], homeHref: '/', actionsOverflow: 'always', overflowLabel: 'More', badges: [{ label: 'Live', variant: 'ok' }], columns: [{ key: 'a', label: 'A' }] };
        await t.load(host); await customElements.whenDefined('pk-page-header'); await t.settle();
        const shell = el.shadowRoot.querySelector('pk-page-shell'), root = shell.part('header').shadowRoot, chip = shell.querySelector('pk-badge[slot="badges"]');
        t.ok(chip && chip.textContent.trim() === 'Live' && rect(chip).width > 0, 'config.badges draws a badge');
        t.ok(root.querySelector('[part="trail"] a[aria-label="Home"]'), 'config.homeHref draws the home crumb');
        t.ok(rect(root.querySelector('[part="overflow-button"]')).width > 0, 'config.actionsOverflow draws the overflow button');
    }],

    ['page types: a badges slot puts the host\'s chips beside the title (#1735)', async t => {
        for (const tag of ['pk-list-page', 'pk-record-page', 'pk-settings-page', 'pk-dashboard-page']) {
            const host = t.stage(`<${tag}><pk-badge slot="badges">Draft</pk-badge></${tag}>`); host.style.width = '1000px';
            const el = host.firstElementChild; el.config = { heading: 'Title', title: 'Title' };
            await t.load(host); await customElements.whenDefined('pk-page-header'); await t.settle();
            const chip = el.querySelector('pk-badge'), lead = el.shadowRoot.querySelector('pk-page-shell').part('header').shadowRoot.querySelector('[part=lead]');
            t.ok(rect(chip).width > 0 && rect(chip).left >= rect(lead).left - 1 && rect(chip).right <= rect(el).right, `${tag}: the slotted badge is drawn in the title bar`);
        }
    }],
];
