// Code explorer and dev tools toolbar buttons (issue 1032): icon plus text on desktop, icon only on a phone (the label stays the accessible name).
import { mountCodeExplorer } from '../../../modules/code-explorer/code-explorer.js';
import { LazyProvider } from '../../../modules/code-explorer/providers.js';
import { mountLogs } from '../../../modules/logs/logs.js';

const CE = '#tcd-ce';
const LG = '#tcd-logs';
const BUTTONS = [`${CE} [data-ce-reports]`, `${LG} pk-button[collapse="phone"]:nth-of-type(1)`, `${LG} pk-button[collapse="phone"]:nth-of-type(2)`];

export default {
    name: 'toolbar-collapse-devtools',
    issue: [1032],
    elements: ['button'],
    html: '<pk-stack gap="md"><div id="tcd-ce"></div><div id="tcd-logs"></div></pk-stack>',
    async setup(frame) {
        const files = ['src/app.js', 'README.md'].map(path => ({ path, language: path.split('.').pop(), lines: 1 }));
        const reader = async () => ({ ok: true, status: 200, text: async () => 'export const a = 1;\n' });
        await mountCodeExplorer(frame.querySelector(CE), { provider: new LazyProvider(files, 'pk-source', { fetch: reader }), height: '20rem' });
        await mountLogs(frame.querySelector(LG), { level: 'debug' });
    },
    steps: [{ set: `${CE} pk-workspace`, attr: 'active-pane', value: 'nav', on: ['phone'] }, { wait: 800 }, { shot: 'rest' }],
    expect(t) {
        t.ok(t.metric('html', 'scrollWidth') <= t.metric('html', 'clientWidth') + 1, 'the page scrolls sideways');
        for (const s of BUTTONS) {
            t.visible(s, 'a toolbar button');
            const r = t.rect(s);
            if (!r) continue;
            if (t.viewport.name === 'phone') t.ok(r.width <= 64, `on a phone a toolbar button should be icon only, but it is ${Math.round(r.width)}px wide (${s})`);
            else t.ok(r.width > 50, `on desktop a toolbar button keeps icon and text, but it is ${Math.round(r.width)}px wide (${s})`);
        }
    },
};
