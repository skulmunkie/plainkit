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
