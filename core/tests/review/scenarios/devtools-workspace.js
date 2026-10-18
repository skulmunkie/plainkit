// The dev tools workspace module (issue 1582, step 1): the Gallery, Files and Scorecard tabs in a page, each workspace shown in turn. Built from SDK elements and modules only, so
// the tab strip and the workspace must fit the width at desktop and phone, in both themes, with nothing overlapping. The dock is left out (it floats over the page; the console and
// the tool dock have their own scenarios).
import { mountDevToolsWorkspace } from '../../../modules/devtools/workspace.js';

const HOST = '#dw-host';
const SNAPSHOT = { version: 1, files: [
    { path: 'src/app.js', language: 'js', content: 'export function run() {\n  return 42;\n}\n' },
    { path: 'README.md', language: 'md', content: '# Title\nsome text\n' },
] };

export default {
    name: 'devtools-workspace',
    issue: [1582],
    elements: ['tabs', 'gallery', 'empty-state'],
    html: '<div id="dw-host"></div>',
    async setup(frame) {
        const page = await mountDevToolsWorkspace(frame.querySelector(HOST), {
            dock: false,
            gallery: { height: 360 },
            files: { snapshot: SNAPSHOT, file: 'src/app.js', count: 2, height: '22rem' },
            scorecard: { height: '22rem', autorun: true, themes: ['dark'], widths: [375], targets: [{ name: 'Card', html: '<p>Fine</p>' }] },
        });
        await page.ready;
    },
    steps: [
        { wait: 3500 }, { shot: 'gallery' },
        { click: `${HOST} pk-tab[value=files]` }, { waitFor: `${HOST} pk-code-explorer` }, { wait: 800 }, { shot: 'files' },
        { click: `${HOST} pk-tab[value=scorecard]` }, { wait: 4000 }, { shot: 'scorecard' },
    ],
    expect(t) {
        t.ok(t.metric('html', 'scrollWidth') <= t.metric('html', 'clientWidth') + 1, 'the page scrolls sideways');
        t.visible(`${HOST} pk-tabs`, 'the tab strip');
        t.inViewport(`${HOST} pk-tabs`);
        if (t.shot === 'files') t.visible(`${HOST} pk-code-explorer`, 'the code explorer');
        if (t.shot === 'scorecard') t.visible(`${HOST} pk-tabs ~ div pk-button`, 'the scorecard');
    },
};
