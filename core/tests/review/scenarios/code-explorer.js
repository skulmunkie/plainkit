// The code explorer module (issue 682): a snapshot of a few files in a card at a fixed height. The file tree with its line-count badges, an opened file with its outline in the aside, and the
// search results of a query. Every state must fit the width at desktop and phone, in both themes, with nothing overlapping.
import { mountCodeExplorer } from '../../../modules/code-explorer/code-explorer.js';

const HOST = '#ce-host';
const SNAPSHOT = { version: 1, files: [
    { path: 'src/app.js', language: 'js', content: 'import { x } from "./util.js";\nexport function run() {\n  return 42;\n}\nexport const name = "app";\n' },
    { path: 'src/util.js', language: 'js', content: 'export const x = 1;\nexport function helper(a) {\n  return a + 1;\n}\n' },
    { path: 'docs/guide/README.md', language: 'md', content: '# Guide\nsome text\n' },
    { path: 'README.md', language: 'md', content: '# Title\nsome text\n' },
] };

export default {
    name: 'code-explorer',
    issue: [682],
    elements: ['workspace', 'tree', 'badge', 'alert'],
    html: '<pk-card heading="Code explorer"><div id="ce-host"></div></pk-card>',
    async setup(frame) { await mountCodeExplorer(frame.querySelector(HOST), { snapshot: SNAPSHOT, file: 'src/app.js', line: 2, height: '26rem' }); },
    steps: [
        { wait: 1200 }, { shot: 'file' },
        { focus: `${HOST} pk-input[data-ce-query] >>> [part=control]` }, { type: 'return' }, { key: 'Enter' }, { wait: 800 }, { shot: 'results' },
    ],
    expect(t) {
        t.ok(t.metric('html', 'scrollWidth') <= t.metric('html', 'clientWidth') + 1, 'the page scrolls sideways');
        t.visible(`${HOST} pk-workspace`, 'the workspace');
        t.inViewport(`${HOST} pk-workspace`);
    },
};
