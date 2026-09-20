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
];
