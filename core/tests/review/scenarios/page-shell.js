// pk-page-shell (#423): the header with crumbs, actions and docked tabs above the content, then a whole-page error that replaces the content and keeps the header.
const SHELL = '#ps';
const HEAD = '#ps >>> [part=header]';

export default {
    name: 'page-shell',
    issue: [423],
    elements: ['page-shell', 'page-header', 'tabs'],
    html: `<pk-page-shell id="ps" heading="PO 1042" crumbs='[{"label":"Stock","href":"#"},{"label":"Purchase orders","href":"#"},{"label":"PO 1042"}]'>
<pk-button slot="actions" variant="ghost" icon-name="document" collapse="phone">Print</pk-button>
<pk-button slot="actions" icon-name="import" collapse="phone">Receive</pk-button>
<pk-tabs slot="tabs" label="Sections"><pk-tab value="lines">Lines</pk-tab><pk-tab value="history">History</pk-tab></pk-tabs>
<pk-card id="body" heading="Lines"><p>Three lines, 412.00 in total.</p></pk-card>
</pk-page-shell>`,
    steps: [
        { shot: 'ready' },
        { click: '#ps pk-tab:nth-of-type(2)' }, { wait: 'settle' }, { shot: 'second-tab' },
        { set: SHELL, attr: 'state', value: 'error' }, { set: SHELL, attr: 'state-heading', value: 'Could not load the order' }, { set: SHELL, attr: 'state-description', value: 'The request failed.' }, { wait: 'settle' }, { shot: 'error' },
    ],
    expect(t) {
        const head = t.rect(HEAD), shell = t.rect(SHELL), tabs = t.rect('#ps pk-tabs');
        t.within(HEAD, SHELL, 1);
        if (head && tabs) t.ok(tabs.bottom <= head.bottom + 1, 'the tabs are docked inside the header');
        if (t.shot === 'error') {
            t.ok(!t.shown('#body'), 'the content is hidden while the error shows');
            const state = t.rect('#ps >>> [part=state]');
            if (state && head && shell) { t.ok(state.y >= head.bottom - 1, 'the state sits under the header'); t.ok(state.right <= shell.right + 1, 'the state fits the shell'); }
        } else {
            t.visible('#body');
            const body = t.rect('#body');
            if (body && head) t.ok(body.y >= head.bottom - 1, 'the content starts under the header');
        }
    },
};
