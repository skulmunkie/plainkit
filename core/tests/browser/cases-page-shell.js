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
];
