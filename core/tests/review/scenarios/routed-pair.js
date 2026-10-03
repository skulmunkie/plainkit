// The "List page and record page" template (#699), run as a real app: the list page (data table with search, filter, paging), a row click to its own record page, the record
// in edit mode with an unsaved change, and the new-record route. Two routes, so the list is never on screen beside a record and the page scrolls only in the list.
export default {
    name: 'routed-pair',
    issue: [699],
    elements: ['data-table', 'list-page', 'record-page', 'app-shell'],
    html: '<div id="app"></div>',
    setup: () => import('../../../samples/templates/routed-pair/routed-pair.js'),
    steps: [
        { wait: 'settle' }, { wait: 700 }, { shot: 'list' },
        { click: 'pk-list-page >>> pk-data-table >>> pk-table >>> tbody tr:nth-child(3)' }, { wait: 700 }, { shot: 'record' },
        { click: 'pk-record-page >>> [part="edit"]' }, { wait: 300 }, { shot: 'record-edit' },
    ],
    expect(t) {
        if (t.shot === 'list') {
            t.hasText('#pk-main pk-heading[level="1"]', 'Things');
            t.ok(!document.querySelector('pk-record-page'), 'the record is not on screen beside the list');
            t.inViewport('pk-list-page >>> pk-data-table');
        } else {
            t.ok(!document.querySelector('pk-list-page'), 'the list page is not on screen beside the record');
            t.inViewport('pk-record-page');
        }
    },
};
