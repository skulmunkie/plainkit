// The "App shell" template (#354, #363), run as a real app opened on a message: the inbox shows the list beside the open message (wide) or the message alone with Back (phone).
export default {
    name: 'app-template',
    issue: [354, 363],
    elements: ['app-shell', 'master-detail-page'],
    html: '<div id="app"></div>',
    setup: () => { location.hash = '#/inbox/3'; return import('../../../samples/templates/app/app.js'); },
    steps: [
        { wait: 'settle' }, { wait: 900 }, { shot: 'message' },
    ],
    expect(t) {
        t.ok(document.querySelector('pk-master-detail-page'), 'the master-detail page is mounted');
        t.fitsWidth('pk-master-detail-page');
    },
};
