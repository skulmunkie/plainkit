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
    ['theme editor module: a brand colour generates palette swatches at 4.5:1 or better, Apply writes ordinary edits, and a colour it cannot read disables Apply', async t => {
        const { mountThemeEditor } = await dist('theme-editor');
        const preview = t.stage('<div data-theme="dark"></div>').firstElementChild;
        const host = t.stage('');
        const editor = await mountThemeEditor(host, { target: preview, preview: false });
        await until(() => host.querySelector('.te-pair'), 'the palette swatches');
        await t.load(host); await t.settle();
        const okAll = () => [...host.querySelectorAll('.te-pair pk-badge')].every(b => b.getAttribute('variant') === 'ok');
        const palette = () => host.querySelector('.te-palette-inputs').parentElement;
        t.ok(host.querySelectorAll('.te-pair').length >= 32 && okAll(), 'every pair in both themes is at 4.5:1 or better');
        const brand = host.querySelector('pk-colour-input[label="Brand colour"]');
        const applyBtn = [...host.querySelectorAll('pk-button')].find(b => b.textContent.trim() === 'Apply as edits');
        brand.part('control').value = '#ffffff'; brand.part('control').dispatchEvent(new Event('input', { bubbles: true, composed: true })); await t.settle();
        t.ok(okAll(), 'an extreme brand still gives AA everywhere');
        t.ok(/had to move/.test(palette().textContent), 'it says the brand colour moved');
        t.eq(Object.keys(editor.overrides().dark).length, 0, 'nothing changes before Apply');
        applyBtn.click(); await t.settle();
        t.ok(Object.keys(editor.overrides().dark).length > 8 && Object.keys(editor.overrides().light).length > 8, 'Apply writes edits for both themes');
        t.eq(preview.style.getPropertyValue('--color-accent'), editor.overrides().dark['--color-accent'], 'the current theme is applied to the target');
        t.ok(host.querySelector('[data-token="--color-accent"]').classList.contains('te-changed'), 'the generated tokens are ordinary edits, listed as changed');
        const neutral = host.querySelector('pk-input[label^="Neutral tint"]');
        neutral.value = 'nope'; neutral.dispatchEvent(new Event('input', { bubbles: true, composed: true })); await t.settle();
        t.ok(applyBtn.hasAttribute('disabled') && /not one this can read/.test(palette().textContent), 'a colour it cannot read disables Apply and says why');
        const p = editor.applyBrand('#e11d74');
        t.ok(p.brand === '#e11d74' && !p.error, 'applyBrand generates and applies in one call');
        t.ok(editor.applyBrand('nope').error, 'applyBrand refuses an unreadable colour');
        editor.destroy();
    }],
    ['theme editor module: built-in presets replace the edits, and saved themes are applied, renamed and deleted by name and kept in localStorage', async t => {
        const { mountThemeEditor } = await dist('theme-editor');
        const key = `pk-test-saved-${Math.random().toString(36).slice(2)}`;
        const preview = t.stage('<div data-theme="dark"></div>').firstElementChild;
        const host = t.stage('');
        const editor = await mountThemeEditor(host, { target: preview, preview: false, savedKey: key });
        await until(() => host.querySelector('.te-saved'), 'the presets tab'); await t.load(host); await t.settle();
        const button = label => [...host.querySelectorAll('pk-button')].find(b => b.textContent.trim() === label);
        const name = host.querySelector('pk-input[label="Theme name"]');
        const setName = v => { name.value = v; name.dispatchEvent(new Event('input', { bubbles: true, composed: true })); };
        t.eq(editor.presets().map(p => p.id).join(), 'default,high-contrast,compact,roomy');
        t.ok(editor.applyPreset('high-contrast') && editor.overrides().dark['--color-text'] === '#ffffff', 'a preset replaces the edits');
        t.eq(preview.style.getPropertyValue('--color-text'), '#ffffff', 'and the target shows it');
        editor.applyPreset('compact');
        t.ok(Object.keys(editor.overrides().dark).length === 0 && editor.overrides().shared['--pad-cell'] === 'var(--space-1) var(--space-2)', 'a second preset replaces the first');
        t.ok(!editor.applyPreset('no such preset'), 'an unknown preset is refused');
        setName('<b>x</b>'); button('Save current edits').click(); await t.settle();
        t.ok(/A name is 1 to 40/.test(host.textContent) && editor.saved().length === 0, 'a bad name is refused with a reason');
        setName('My compact'); button('Save current edits').click(); await t.settle();
        t.eq(editor.saved().join(), 'My compact');
        t.ok(window.localStorage.getItem(key).includes('My compact'), 'kept in localStorage');
        editor.applyPreset('default'); t.eq(Object.keys(editor.overrides().shared).length, 0);
        const row = () => host.querySelector('[data-saved]');
        [...row().querySelectorAll('pk-button')].find(b => b.textContent.trim() === 'Apply').click(); await t.settle();
        t.eq(editor.overrides().shared['--pad-page'], 'var(--space-4)', 'a saved theme applies');
        setName('Renamed'); [...row().querySelectorAll('pk-button')].find(b => b.textContent.trim() === 'Rename').click(); await t.settle();
        t.eq(editor.saved().join(), 'Renamed');
        const again = await mountThemeEditor(t.stage(''), { target: preview, preview: false, savedKey: key });
        t.eq(again.saved().join(), 'Renamed', 'a new editor reads them back'); again.destroy();
        [...row().querySelectorAll('pk-button')].find(b => b.textContent.trim() === 'Delete').click(); await t.settle();
        t.eq(editor.saved().length, 0); t.ok(!window.localStorage.getItem(key).includes('Renamed'), 'delete is stored');
        window.localStorage.removeItem(key);
        editor.destroy();
    }],
    ['theme editor module: undo and redo walk every change, the Changes tab lists edits against the stylesheet, and resets work per edit and per group', async t => {
        const { mountThemeEditor } = await dist('theme-editor');
        const preview = t.stage('<div data-theme="dark"></div>').firstElementChild;
        const host = t.stage('');
        const editor = await mountThemeEditor(host, { target: preview, preview: false });
        await until(() => host.querySelector('.te-changes'), 'the changes tab'); await t.load(host); await t.settle();
        const button = label => [...host.querySelectorAll('pk-button')].find(b => b.textContent.trim() === label);
        const summary = () => host.querySelector('.te-summary').textContent;
        t.eq(summary(), 'No changes'); t.ok(button('Undo').hasAttribute('disabled') && button('Redo').hasAttribute('disabled'), 'nothing to undo yet');
        editor.applyPreset('compact'); editor.applyBrand('#e11d74'); await t.settle();
        t.ok(/^\d+ changes$/.test(summary()) && button('Undo') && !button('Undo').hasAttribute('disabled'), 'changes are counted and Undo is on');
        const count = Object.keys(editor.overrides().shared).length;
        t.ok(editor.undo(), 'undo returns true'); await t.settle();
        t.eq(Object.keys(editor.overrides().dark).length, 0, 'the brand palette is undone');
        t.eq(Object.keys(editor.overrides().shared).length, count, 'the preset before it is kept');
        t.ok(!button('Redo').hasAttribute('disabled')); t.ok(editor.redo() && Object.keys(editor.overrides().dark).length > 8, 'redo brings it back');
        button('Undo').click(); await t.settle();
        t.eq(Object.keys(editor.overrides().dark).length, 0, 'the Undo button works');
        editor.undo(); editor.undo(); t.ok(!editor.undo(), 'undo at the start returns false');
        // typing in one field is one step
        const row = host.querySelector('[data-token="--color-accent"]'); await t.settle();
        const field = row.querySelector('pk-colour-input').part('control');
        for (const v of ['#111111', '#222222', '#333333']) { field.value = v; field.dispatchEvent(new Event('input', { bubbles: true, composed: true })); }
        await t.settle();
        t.eq(editor.overrides().dark['--color-accent'], '#333333'); t.eq(summary(), '1 change');
        editor.undo(); t.eq(editor.overrides().dark['--color-accent'], undefined, 'three keystrokes are one undo step');
        editor.redo(); await t.settle();
        const changes = () => [...host.querySelectorAll('.te-change')].map(c => c.dataset.change);
        t.eq(changes().join(), 'dark --color-accent');
        t.ok(/#333333/.test(host.querySelector('.te-change').textContent) && /#4e93e3/.test(host.querySelector('.te-change').textContent), 'the diff shows the stylesheet value and the new one');
        editor.applyBrand('#0d9488'); await t.settle();
        t.ok(changes().length > 8 && host.querySelector('[data-reset-group="color"]'), 'the palette lists many edits, grouped');
        host.querySelector('[data-reset-group="color"]').click(); await t.settle();
        t.ok(changes().every(c => !c.includes('--color-')), 'Reset group clears every colour token');
        editor.reset(); await t.settle(); t.eq(summary(), 'No changes'); t.ok(editor.undo(), 'Reset all is itself undoable');
        editor.destroy();
    }],
    ['theme editor module: the export tab has a copy-paste snippet and a text-only theme link that another editor (or the page hash) applies as edits', async t => {
        const { mountThemeEditor } = await dist('theme-editor');
        const preview = t.stage('<div data-theme="dark"></div>').firstElementChild;
        const host = t.stage('');
        const editor = await mountThemeEditor(host, { target: preview, preview: false, savedKey: false });
        await until(() => host.querySelector('pk-textarea[label="Copy-paste snippet"]'), 'the export tab'); await t.load(host); await t.settle();
        const snippet = host.querySelector('pk-textarea[label="Copy-paste snippet"]');
        t.ok(snippet.value.startsWith('/* Plainkit theme: 0 token overrides'), 'the snippet header counts overrides');
        t.eq((await editor.share()).error?.slice(0, 20), 'There is nothing to ', 'an empty theme has no link');
        editor.applyBrand('#e11d74'); await t.settle();
        t.ok(/--color-accent:\s*#/.test(snippet.value) && /\[data-theme="light"\]/.test(snippet.value), 'the snippet holds the :root and [data-theme] blocks');
        const link = await editor.share();
        t.ok(link.url.includes('#pk-theme=') && link.hash.length <= 4096, 'a link with the theme in the fragment');
        t.eq(host.querySelector('pk-input[label="Theme link"]').value, link.url, 'shown in the link field');
        const other = await mountThemeEditor(t.stage(''), { target: t.stage('<div data-theme="dark"></div>').firstElementChild, preview: false, savedKey: false });
        const got = await other.importShare(link.url);
        t.ok(!got.error && JSON.stringify(other.overrides()) === JSON.stringify(editor.overrides()), 'another editor gets the same edits');
        t.ok(other.undo() && Object.keys(other.overrides().dark).length === 0, 'they are ordinary edits: Undo takes them back');
        const hostile = btoa('{"dark":{"--x-y":"url(https://evil.test)","BAD":"<b>x</b>"}}').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        const bad = await other.importShare('#pk-theme=p.' + hostile);
        t.ok(bad.error && Object.keys(other.overrides().dark).length === 0, 'hostile names and values are refused and nothing changes');
        const old = location.hash;
        try {
            history.replaceState(null, '', '#' + link.hash);
            const fromHash = await mountThemeEditor(t.stage(''), { target: t.stage('<div data-theme="dark"></div>').firstElementChild, preview: false, savedKey: false, readHash: true });
            t.eq(JSON.stringify(fromHash.overrides()), JSON.stringify(editor.overrides()), 'readHash applies the theme in the page fragment');
            fromHash.destroy();
        } finally { history.replaceState(null, '', old || location.pathname + location.search); }
        other.destroy(); editor.destroy();
    }],
    ['theme editor module: the Contrast tab audits every pair in both themes under the edits, counts the failures and jumps to the token', async t => {
        const { mountThemeEditor } = await dist('theme-editor');
        const preview = t.stage('<div data-theme="dark"></div>').firstElementChild;
        const host = t.stage('');
        const editor = await mountThemeEditor(host, { target: preview, preview: false, savedKey: false });
        await until(() => host.querySelector('.te-audit .te-pair'), 'the audit rows'); await t.load(host); await t.settle();
        const tab = () => [...host.querySelectorAll('pk-tab')].find(x => x.textContent.trim().startsWith('Contrast'));
        const rows = () => [...host.querySelectorAll('.te-audit .te-pair')];
        t.ok(rows().length >= 32 && rows().every(r => r.querySelector('pk-badge').getAttribute('variant') === 'ok'), 'the stylesheet passes every pair in both themes');
        t.eq(tab().textContent.trim(), 'Contrast');
        // a low-contrast edit for the light theme only shows up as a failure in light, and the tab title counts it
        editor.setTheme('light'); await t.settle();
        const accent = host.querySelector('[data-token="--color-muted"] pk-colour-input');
        await t.load(host); await t.settle();
        accent.part('control').value = '#eeeeee'; accent.part('control').dispatchEvent(new Event('input', { bubbles: true, composed: true })); await t.settle();
        const failing = rows().filter(r => r.querySelector('pk-badge').getAttribute('variant') === 'danger').map(r => r.dataset.pairRow);
        t.ok(failing.length === 2 && failing.every(f => f.startsWith('light --color-muted')), failing.join('; '));
        t.ok(/2 below AA/.test(tab().textContent) && /2 text pairs below 4\.5:1 \(2 in light\)/.test(host.textContent), 'counted in the tab and the summary');
        t.ok(rows().find(r => r.dataset.pairRow.startsWith('light')).dataset.pairRow.includes('--color-muted'), 'failing rows come first in their theme');
        // jump to the token from the dark side of a pair
        editor.setTheme('dark'); await t.settle();
        const jumpBtn = host.querySelector('[data-jump="--color-text"][data-jump-theme="dark"]');
        jumpBtn.click(); await t.settle();
        t.eq(host.querySelectorAll('.te-row').length, 1, 'the token list is filtered to that token');
        t.eq(host.querySelector('.te-row').dataset.token, '--color-text');
        t.eq(host.querySelector('pk-tabs').value, 'tokens', 'and the Tokens tab is open');
        editor.destroy();
    }],
    ['theme editor module: an app supplies the initial theme and its own presets (CSS, JSON or object), and reports each change with the exported CSS', async t => {
        const { mountThemeEditor } = await dist('theme-editor');
        const preview = t.stage('<div data-theme="dark"></div>').firstElementChild;
        const host = t.stage('');
        const css = ':root, [data-theme="dark"] { --color-accent: #123456; }\n[data-theme="light"] { --color-accent: #654321; }';
        const seen = [];
        const editor = await mountThemeEditor(host, {
            target: preview, preview: false, savedKey: false, initial: css, onchange: ({ css: out }) => seen.push(out),
            presets: [{ name: 'Brand', theme: '{"shared":{"--radius-md":"2px"}}', description: 'Our theme' }, { name: 'Bad', theme: 'nothing usable' }, { name: 'High-contrast', theme: css }, { name: 'From css', theme: css }],
        });
        await until(() => host.querySelector('.te-saved'), 'the presets tab'); await t.load(host); await t.settle();
        t.eq(editor.overrides().dark['--color-accent'], '#123456', 'the initial theme is the starting edits');
        t.eq(preview.style.getPropertyValue('--color-accent'), '#123456', 'and it is applied');
        t.ok(!editor.undo(), 'the initial theme is the baseline: there is nothing to undo');
        t.eq(editor.presets().map(p => p.id).join(), 'default,high-contrast,compact,roomy,Brand,From css', 'app presets follow the built-in ones; a bad or built-in-named one is left out');
        t.ok(host.querySelector('pk-select[label="Built-in preset"] option[value="Brand"]'), 'and they are in the picker');
        seen.length = 0;
        t.ok(editor.applyPreset('Brand') && editor.overrides().shared['--radius-md'] === '2px' && Object.keys(editor.overrides().dark).length === 0, 'an app preset replaces the edits');
        t.ok(seen.length > 0 && /--radius-md:\s*2px/.test(seen.at(-1)), 'onchange reports the exported CSS');
        editor.destroy();
        const stored = await mountThemeEditor(t.stage(''), { target: t.stage('<div data-theme="dark"></div>').firstElementChild, preview: false, savedKey: false, initial: 'not a theme' });
        t.eq(Object.keys(stored.overrides().dark).length, 0, 'an initial theme with nothing usable is ignored');
        stored.destroy();
    }],
    ['theme editor module: blocked storage is logged and saved themes still work until the page closes', async t => {
        const { mountThemeEditor } = await dist('theme-editor');
        const preview = t.stage('<div data-theme="dark"></div>').firstElementChild;
        const host = t.stage('');
        const desc = Object.getOwnPropertyDescriptor(window, 'localStorage');
        let editor;
        try {
            Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new DOMException('blocked', 'SecurityError'); } });
            editor = await mountThemeEditor(host, { target: preview, preview: false, savedKey: 'pk-test-blocked' });
            await until(() => host.querySelector('.te-saved'), 'the presets tab'); await t.load(host); await t.settle();
            const name = host.querySelector('pk-input[label="Theme name"]');
            name.value = 'Session only'; name.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
            [...host.querySelectorAll('pk-button')].find(b => b.textContent.trim() === 'Save current edits').click(); await t.settle();
            t.eq(editor.saved().join(), 'Session only', 'it is kept in memory');
            t.ok(/blocks storage/.test(host.querySelector('.te-saved').parentElement.textContent), 'and the panel says storage is blocked');
        } finally {
            if (desc) Object.defineProperty(window, 'localStorage', desc); else delete window.localStorage;
            editor?.destroy();
        }
    }],
];
