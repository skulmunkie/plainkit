// Browser cases for the tool modules shipped in dist (mountCodeExplorer, mountScorecard, mountThemeEditor). Same shape as cases.js.
const wait = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, what) => { for (let i = 0; i < 150; i++) { const v = fn(); if (v) return v; await wait(100); } throw new Error(`timed out waiting for ${what}`); };
const dist = name => import(new URL(`../../dist/${name}/${name}.js`, import.meta.url).href);

const SNAPSHOT = { version: 1, files: [
    { path: 'src/app.js', language: 'js', content: 'export function run() {\n  return 42;\n}\n', symbols: [{ kind: 'function', name: 'run', line: 1, depth: 0 }] },
    { path: 'README.md', language: 'md', content: '# Title\nsome text\n' },
] };

export const toolCases = [
    ['code explorer module: mounts a snapshot object, opens the requested file and runs the search', async t => {
        const { mountCodeExplorer } = await dist('code-explorer');
        const host = t.stage('');
        const handle = await mountCodeExplorer(host, { snapshot: SNAPSHOT, file: 'src/app.js', line: 2, search: 'return', theme: 'light', height: '20rem' });
        const el = handle.element;
        t.eq(el.getAttribute('data-theme'), 'light');
        await until(() => el.querySelector('.cv-row--focus'), 'the opened file');
        t.eq(el.querySelector('.cv-row--focus .cv-code').textContent.trim(), 'return 42;', 'the requested line is focused');
        await until(() => el.querySelector('.csr-hit'), 'the search results');
        t.eq(el.querySelectorAll('.csr-hit').length, 1);
        await handle.search('nothing-matches-this'); await t.settle();
        t.ok(/No matches/.test(el.textContent));
        handle.destroy(); t.ok(!host.contains(el));
    }],

    ['scorecard module: renders each target at every theme and width, scores the bad one lower, ranks worst first and honours the checks filter', async t => {
        const { mountScorecard } = await dist('scorecard');
        const host = t.stage('');
        const targets = [{ name: 'Good', html: '<div class="card"><p>Fine</p></div>' }, { name: 'Bad', html: '<button></button><img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=">' }];
        const card = await mountScorecard(host, { targets, themes: ['dark'], widths: [375, 1024], theme: 'light' });
        t.eq(card.results().length, 0, 'nothing runs until asked');
        host.querySelector('[data-sc-run]').click();
        await until(() => host.querySelector('.sc-table'), 'the ranked table');
        const rows = [...host.querySelectorAll('.sc-table tbody tr')].map(r => r.cells[0].textContent.trim());
        t.eq(rows.join(), 'Bad,Good', 'worst first');
        const [bad, good] = card.results().sort((a, b) => a.score - b.score);
        t.ok(bad.score < 100 && good.score === 100, 'the unnamed button and the image without alt cost points');
        t.ok(bad.findings.some(f => f.check === 'unnamed-input') && bad.findings.some(f => f.check === 'image-alt'));
        t.eq(host.querySelectorAll('.sc-frames iframe').length, 0, 'the measuring frames are removed');
        const only = await (await mountScorecard(t.stage(''), { targets, themes: ['dark'], widths: [375], checks: ['image-alt'] })).run();
        t.eq(only.find(i => i.name === 'Bad').findings.map(f => f.check).join(), 'image-alt', 'only the requested check remains');
        card.destroy();
    }],
    ['scorecard module: an icon-only pk-button with no accessible name is an unnamed-input failure; one named by its text or its label is not, and none is under 44px on a phone', async t => {
        const { mountScorecard } = await dist('scorecard');
        const { sampleDoc } = await import('../../site/gallery/frame.js'); // a frame that loads the elements, so the buttons are drawn (and measurable)
        const targets = [
            { name: 'Nameless', srcdoc: () => sampleDoc('<pk-button icon icon-name="plus"></pk-button>') },
            { name: 'Named', srcdoc: () => sampleDoc('<pk-button icon icon-name="plus">Add item</pk-button> <pk-button icon icon-name="search" label="Search"></pk-button> <pk-button icon href="#a"><pk-icon name="chevron-left"></pk-icon>Back to Orders</pk-button>') },
        ];
        const results = await (await mountScorecard(t.stage(''), { targets, themes: ['dark'], widths: [375], settleMs: 1500, checks: ['unnamed-input', 'touch-target'] })).run();
        t.eq(results.find(i => i.name === 'Nameless').findings.map(f => f.check).join(), 'unnamed-input', 'no name is a failure');
        t.eq(results.find(i => i.name === 'Named').findings.length, 0, 'named icon buttons pass, and their 44px target is met');
    }],
    ['theme editor module: a length token is a pk-unit-input that edits number and unit, other kinds keep their field, and Reset restores the stylesheet value', async t => {
        const { mountThemeEditor } = await dist('theme-editor');
        const preview = t.stage('<div data-theme="dark"></div>').firstElementChild;
        const host = t.stage('');
        const editor = await mountThemeEditor(host, { target: preview, preview: false });
        const row = name => host.querySelector(`[data-token="${name}"]`);
        await until(() => row('--space-4'), 'the token rows');
        const unit = row('--space-4').querySelector('pk-unit-input'); await t.load(host); await t.settle();
        t.ok(unit, 'a length token uses pk-unit-input');
        t.eq(unit.part('control').value, '1'); t.eq(unit.part('unit').value, 'rem');
        t.ok(row('--color-accent').querySelector('pk-colour-input') && row('--font-sans').querySelector('pk-input') && !row('--text-sm').querySelector('pk-unit-input'), 'colours, fonts and var() sizes keep their field');
        unit.part('control').value = '1.5'; unit.part('control').dispatchEvent(new Event('input', { bubbles: true, composed: true })); await t.settle();
        t.eq(editor.overrides().dark['--space-4'], '1.5rem'); t.eq(preview.style.getPropertyValue('--space-4'), '1.5rem');
        const select = unit.part('unit'); select.value = 'px'; select.dispatchEvent(new Event('change', { bubbles: true })); await t.settle();
        t.eq(editor.overrides().dark['--space-4'], '1.5px', 'a unit pick is an edit');
        row('--space-4').querySelector('pk-button').click(); await t.settle();
        t.eq(Object.keys(editor.overrides().dark).length, 0, 'Reset clears the override');
        const fresh = row('--space-4').querySelector('pk-unit-input'); await t.settle();
        t.eq(fresh.value, '1rem');
        editor.destroy();
    }],
];
