// The code explorer's Reports over a lazy provider (issue: the reports could not be computed): files read one at a time through a reader, one of them unreadable. The three reports (largest files,
// longest methods, duplicate blocks) each show rows, and a warning names the file that was left out. Phone and desktop, both themes, nothing overlapping or wider than the screen.
import { mountCodeExplorer } from '../../../modules/code-explorer/code-explorer.js';
import { LazyProvider } from '../../../modules/code-explorer/providers.js';

const HOST = '#cer-host';
const shared = ['  const rows = items.filter(Boolean);', '  rows.sort((a, b) => a - b);', '  const total = rows.length;', '  return { rows, total };'].join('\n');
const TEXTS = {
    'src/app.js': `export function run(items) {\n${shared}\n}\nexport function big() {\n${Array.from({ length: 24 }, (_, i) => `  step(${i});`).join('\n')}\n}\n`,
    'src/util.js': `export function helper(items) {\n${shared}\n}\n`,
    'docs/guide/README.md': '# Guide\nsome text\n',
    'README.md': '# Title\nsome text\n',
};

export default {
    name: 'code-explorer-reports',
    issue: [682],
    elements: ['workspace', 'tree', 'alert', 'button'],
    html: '<pk-card heading="Code explorer reports"><div id="cer-host"></div></pk-card>',
    async setup(frame) {
        const reader = async url => {
            const path = decodeURIComponent(url.slice('pk-source/'.length));
            return path in TEXTS ? { ok: true, status: 200, text: async () => TEXTS[path] } : { ok: false, status: 404, text: async () => '' };
        };
        const files = [...Object.keys(TEXTS), 'src/gone.js'].map(path => ({ path, language: path.split('.').pop(), lines: 1 }));
        await mountCodeExplorer(frame.querySelector(HOST), { provider: new LazyProvider(files, 'pk-source', { fetch: reader }), height: '30rem' });
    },
    steps: [
        { wait: 1200 },
        { set: `${HOST} pk-workspace`, attr: 'active-pane', value: 'nav', on: ['phone'] }, { wait: 300, on: ['phone'] },
        { click: `${HOST} [data-ce-reports]` }, { wait: 900 }, { shot: 'largest' },
        { click: `${HOST} [data-kind="methods"]` }, { wait: 400 }, { shot: 'methods' },
        { click: `${HOST} [data-kind="duplicates"]` }, { wait: 400 }, { shot: 'duplicates' },
    ],
    expect(t) {
        t.ok(t.metric('html', 'scrollWidth') <= t.metric('html', 'clientWidth') + 1, 'the page scrolls sideways');
        t.visible(`${HOST} pk-alert`, 'the warning naming the unreadable file');
        t.inViewport(`${HOST} pk-workspace`);
    },
};
