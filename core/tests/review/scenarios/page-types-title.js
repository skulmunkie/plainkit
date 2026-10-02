// The built-in states, not-found and tool page types hand the app a level 1 title to focus after navigation (#807): each page has exactly one
// level 1 pk-heading (the factory's, in the page element's title slot), the state's own heading is not drawn a second time, and the tool page's form follows its title.
import { mountPage } from '../../../js/app.js';

export default {
    name: 'page-types-title',
    issue: [807],
    elements: ['states-page', 'not-found-page', 'tool-page', 'heading'],
    html: '<div id="boxes"><main id="a"></main><main id="b"></main><main id="c"></main></div>',
    setup(frame) {
        const at = id => frame.querySelector(`#${id}`);
        globalThis.__pages = [
            mountPage(at('a'), { type: 'states', config: { state: 'empty', heading: 'No orders yet', description: 'Orders you place show up here.' } }),
            mountPage(at('b'), { type: 'not-found', config: { description: 'That page moved or never existed.' } }),
            mountPage(at('c'), { type: 'tool', config: { heading: 'Tax calculator', input: [{ key: 'amount', type: 'number', label: 'Amount' }], runLabel: 'Add tax' } }),
        ];
    },
    steps: [{ wait: 'settle' }, { wait: 300 }, { shot: 'pages' }],
    expect(t) {
        for (const id of ['a', 'b', 'c']) {
            const titles = document.querySelectorAll(`#${id} pk-heading[level="1"]`);
            t.ok(titles.length === 1, `#${id}: ${titles.length} level-1 titles, expected exactly 1`);
            t.ok(document.querySelectorAll(`#${id} [role="heading"][aria-level="1"]`).length === 0, `#${id}: the page draws no second level 1 heading`);
            t.inViewport(`#${id} pk-heading[level="1"]`);
        }
        t.hasText('#a pk-heading[level="1"]', 'No orders yet');
        t.hasText('#b pk-heading[level="1"]', 'Page not found');
        t.hasText('#c pk-heading[level="1"]', 'Tax calculator');
    },
};
