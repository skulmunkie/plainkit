// Browser cases for the tool modules shipped in dist (mountCodeExplorer, mountScorecard, mountThemeEditor, mountLayoutBuilder). Same shape as cases.js.
const wait = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, what) => { for (let i = 0; i < 150; i++) { const v = fn(); if (v) return v; await wait(100); } throw new Error(`timed out waiting for ${what}`); };
const dist = name => import(new URL(`../../dist/modules/${name}/${name}.js`, import.meta.url).href);

// A store-only zip read back: Map of name -> text (or bytes with raw), from the central directory.
function unzip(bytes, raw = false) {
    const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let end = bytes.length - 22; while (v.getUint32(end, true) !== 0x06054b50) end--;
    const out = new Map(); let at = v.getUint32(end + 16, true);
    for (let i = 0, n = v.getUint16(end + 10, true); i < n; i++) {
        const size = v.getUint32(at + 24, true), len = v.getUint16(at + 28, true), off = v.getUint32(at + 42, true);
        const name = new TextDecoder().decode(bytes.subarray(at + 46, at + 46 + len)); at += 46 + len;
        const start = off + 30 + v.getUint16(off + 26, true) + v.getUint16(off + 28, true);
        out.set(name, raw ? bytes.slice(start, start + size) : new TextDecoder().decode(bytes.subarray(start, start + size)));
    }
    return out;
}

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

    ['theme editor Custom SDK tab: theme only exports a small zip without touching the SDK; the widths are validated and the delta table follows them', async t => {
        const { mountThemeEditor } = await dist('theme-editor');
        const host = t.stage('');
        const editor = await mountThemeEditor(host, { target: t.stage('<div data-theme="dark"></div>').firstElementChild, preview: false, savedKey: false, initial: ':root, [data-theme="dark"] { --color-accent: #123456; }' });
        const inputs = await until(() => { const l = host.querySelectorAll('.te-sdk [data-breakpoint-input]'); return l.length === 3 ? [...l] : null; }, 'the three breakpoint inputs');
        await t.load(host); await t.settle();
        const sdk = s => host.querySelector(`.te-sdk [data-sdk="${s}"]`);
        const type = (el, v) => { el.value = String(v); el.dispatchEvent(new Event('input', { bubbles: true, composed: true })); };
        const tick = (el, on) => { el.checked = on; el.dispatchEvent(new Event('change', { bubbles: true, composed: true })); };
        t.eq(inputs.map(i => i.dataset.breakpointInput + i.value).join(), 'phone640,tablet1024,wide1280', 'the shipped widths are the start');
        t.eq(sdk('export').textContent.trim(), 'Export custom SDK');
        // validation: ascending and a gap; the message and the invalid flag say which, and the export is off
        type(inputs[1], 660); await t.settle();
        t.ok(inputs[1].hasAttribute('invalid') && /at least 64/.test(host.querySelector('.te-sdk pk-alert').textContent) && sdk('export').hasAttribute('disabled'), 'a tablet 660px next to a phone 640px is refused');
        type(inputs[1], 1100); type(inputs[0], 700); await t.settle();
        t.ok(!host.querySelector('.te-sdk pk-alert') && !sdk('export').hasAttribute('disabled'), 'a valid set clears the message');
        // the delta table: the changed breakpoint is open, says which viewport widths flip and lists elements with their properties
        const item = host.querySelector('.te-sdk [data-breakpoint="phone"]');
        t.ok(/phone: 640px to 700px \(\d+ elements/.test(item.getAttribute('heading')) && item.hasAttribute('open'), item.getAttribute('heading'));
        t.ok(/Viewports 641 to 700px/.test(item.textContent) && item.querySelectorAll('tbody tr').length > 40 && /pk-grid|pk-tabs|pk-table/.test(item.textContent), 'the elements that change are listed');
        t.ok(!host.querySelector('.te-sdk [data-breakpoint="wide"]').hasAttribute('open'), 'an unchanged breakpoint stays closed');
        // theme only: untick Breakpoints; the button says so and the download is the small zip, with no SDK file in it
        tick(host.querySelector('.te-sdk [data-sdk="include-breakpoints"]'), false); await t.settle();
        t.eq(sdk('export').textContent.trim(), 'Export theme only');
        const got = [], realCreate = URL.createObjectURL, realClick = HTMLAnchorElement.prototype.click;
        URL.createObjectURL = b => { got.push({ blob: b }); return 'blob:test'; };
        HTMLAnchorElement.prototype.click = function () { got.at(-1).name = this.download; };
        try {
            const before = performance.getEntriesByType('resource').length;
            sdk('export').click(); await until(() => got.length, 'the download');
            const files = unzip(new Uint8Array(await got[0].blob.arrayBuffer()));
            t.eq([...files.keys()].sort().join(), 'README.md,plainkit-theme.css,plainkit.custom.json');
            t.ok(/--color-accent: #123456/.test(files.get('plainkit-theme.css')) && /Blazor: copy the file to/.test(files.get('README.md')) && got[0].name.startsWith('plainkit-theme-'), got[0].name);
            t.eq(JSON.parse(files.get('plainkit.custom.json')).include.breakpoints, false);
            t.ok(performance.getEntriesByType('resource').slice(before).every(r => !/dist\/(elements|manifest)/.test(r.name)), 'no SDK file was fetched for a theme-only export');
            // the stylesheet on its own: the separate, labelled action
            sdk('download-css').click(); await until(() => got.length === 2, 'the css download');
            t.eq(got[1].name, 'plainkit-theme.css');
        } finally { URL.createObjectURL = realCreate; HTMLAnchorElement.prototype.click = realClick; }
        editor.destroy();
    }],
    ['theme editor Custom SDK tab: the full export is the dist with the widths and the theme, a recomputed manifest whose hashes match, and the settings import back', async t => {
        const { mountThemeEditor } = await dist('theme-editor');
        const host = t.stage('');
        const editor = await mountThemeEditor(host, { target: t.stage('<div data-theme="dark"></div>').firstElementChild, preview: false, savedKey: false, initial: ':root, [data-theme="dark"] { --color-accent: #123456; }' });
        const inputs = await until(() => { const l = host.querySelectorAll('.te-sdk [data-breakpoint-input]'); return l.length === 3 ? [...l] : null; }, 'the breakpoint inputs');
        await t.load(host); await t.settle();
        const type = (el, v) => { el.value = String(v); el.dispatchEvent(new Event('input', { bubbles: true, composed: true })); };
        type(inputs[0], 700); await t.settle();
        const got = [], realCreate = URL.createObjectURL, realClick = HTMLAnchorElement.prototype.click;
        URL.createObjectURL = b => { got.push({ blob: b }); return 'blob:test'; };
        HTMLAnchorElement.prototype.click = function () { got.at(-1).name = this.download; };
        let files;
        try {
            host.querySelector('.te-sdk [data-sdk="export"]').click();
            await until(() => got.length, 'the export');
            files = unzip(new Uint8Array(await got[0].blob.arrayBuffer()), true);
        } finally { URL.createObjectURL = realCreate; HTMLAnchorElement.prototype.click = realClick; }
        const text = p => new TextDecoder().decode(files.get(p));
        t.ok(/^plainkit-custom-.+\.zip$/.test(got[0].name) && files.has('README.md') && files.has('plainkit.custom.json') && files.has('dist/manifest.json') && files.has('dist/elements/button.js'), got[0].name);
        t.ok(/--pk-bp-phone:700px;--pk-bp-tablet:1024px/.test(text('dist/plainkit.css')) && /--color-accent: #123456/.test(text('dist/plainkit.css')) && /max-width: 700px/.test(text('dist/elements/table.js') + text('dist/elements/tabs.js')), 'widths and theme are in the page layer and the elements');
        const manifest = JSON.parse(text('dist/manifest.json'));
        for (const p of ['plainkit.css', 'plainkit.min.css', 'elements/tabs.js', 'icons.svg']) {
            const digest = new Uint8Array(await crypto.subtle.digest('SHA-384', files.get(`dist/${p}`)));
            t.eq(manifest.files.find(f => f.path === p).integrity, 'sha384-' + btoa(String.fromCharCode(...digest)), `${p} hash matches the manifest`);
        }
        // the modules unit travels with its own manifest, whose hashes match the rewritten tool files
        const tools = JSON.parse(text('dist/modules/manifest.json'));
        t.ok(tools.name === 'plainkit-modules' && tools.files.length > 20 && !manifest.files.some(f => f.path.startsWith('modules/')), 'the modules are a unit of their own in the export');
        const themeCss = tools.files.find(f => f.path === 'theme-editor/theme-editor.css');
        const themeDigest = new Uint8Array(await crypto.subtle.digest('SHA-384', files.get('dist/modules/theme-editor/theme-editor.css')));
        t.eq(themeCss.integrity, 'sha384-' + btoa(String.fromCharCode(...themeDigest)), 'a tool file hash matches the modules manifest');
        // the exported page layer works in a real document: the widths are on :root and the theme wins
        const frame = document.createElement('iframe'); frame.style.width = '680px'; document.body.append(frame);
        try {
            const sheet = new frame.contentWindow.CSSStyleSheet(); sheet.replaceSync(text('dist/plainkit.css')); frame.contentDocument.adoptedStyleSheets = [sheet];
            const cs = frame.contentWindow.getComputedStyle(frame.contentDocument.documentElement);
            t.eq(cs.getPropertyValue('--pk-bp-phone'), '700px'); t.eq(cs.getPropertyValue('--color-accent').trim(), '#123456');
        } finally { frame.remove(); }
        // the settings import back: another editor takes the widths and the theme from plainkit.custom.json
        const other = t.stage('');
        const second = await mountThemeEditor(other, { target: t.stage('<div data-theme="dark"></div>').firstElementChild, preview: false, savedKey: false });
        await until(() => other.querySelectorAll('.te-sdk [data-breakpoint-input]').length === 3, 'the second editor'); await t.load(other); await t.settle();
        const box = other.querySelector('.te-sdk pk-textarea'); box.value = text('plainkit.custom.json'); box.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
        other.querySelector('.te-sdk [data-sdk="import"]').click(); await t.settle();
        t.eq(other.querySelector('[data-breakpoint-input="phone"]').value, '700', 'the width is back');
        t.eq(second.overrides().dark['--color-accent'], '#123456', 'and the theme');
        t.ok(/Imported settings made with Plainkit/.test(other.textContent));
        second.destroy(); editor.destroy();
    }],

    ['layout builder module: renders the page live in an inert canvas, selects by click, arrows and the structure tree, and the keyboard moves, duplicates, deletes and undoes', async t => {
        const { mountLayoutBuilder } = await dist('layout-builder');
        const host = t.stage('');
        const start = '<pk-stack gap="md"><h2>Title</h2><pk-card heading="Open"><p>Waiting</p><pk-button slot="footer">Review</pk-button></pk-card></pk-stack>';
        const builder = await mountLayoutBuilder(host, { html: start });
        const reasons = []; builder.on('change', e => reasons.push(e.reason));
        await t.load(host);
        const canvas = host.querySelector('.lb-canvas'), page = host.querySelector('.lb-page');
        t.ok(page.inert, 'the built page is inert: it cannot act on the builder');
        t.eq(page.querySelectorAll('[data-lb-id]').length, 5, 'every node is rendered as a real element');
        t.ok(customElements.get('pk-card') && page.querySelector('pk-card').shadowRoot, 'the elements are live');
        const key = (k, o = {}) => canvas.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...o }));
        const para = page.querySelector('p').getBoundingClientRect();
        canvas.dispatchEvent(new MouseEvent('click', { clientX: para.left + 4, clientY: para.top + para.height / 2, bubbles: true }));
        const selected = () => builder.selection() && page.querySelector('[data-lb-selected]')?.localName;
        t.eq(selected(), 'p', 'a click selects the smallest element under it');
        key('ArrowLeft'); t.eq(selected(), 'pk-card', 'Left selects the parent');
        key('ArrowDown'); t.eq(selected(), 'p', 'Down walks the page in order');
        key('ArrowLeft'); key('ArrowUp'); t.eq(selected(), 'h2', 'Up walks back');
        key('ArrowDown', { altKey: true });
        t.eq(builder.toHtml({ compact: true }), '<pk-stack gap="md"><pk-card heading="Open"><p>Waiting</p><pk-button slot="footer">Review</pk-button></pk-card><h2>Title</h2></pk-stack>', 'Alt+Down reorders');
        key('ArrowLeft', { altKey: true });
        t.eq(builder.getModel().nodes.length, 2, 'Alt+Left moves the heading out of the stack');
        key('z', { ctrlKey: true }); key('z', { ctrlKey: true });
        t.eq(builder.toHtml({ compact: true }), start, 'Ctrl+Z undoes the moves');
        key('y', { ctrlKey: true }); t.ok(reasons.includes('redo'), 'Ctrl+Y redoes');
        key('z', { ctrlKey: true });
        builder.select(builder.getModel().nodes[0].slots[''][1].id);
        key('d', { ctrlKey: true }); t.eq(page.querySelectorAll('pk-card').length, 2, 'Ctrl+D duplicates');
        key('Delete'); t.eq(page.querySelectorAll('pk-card').length, 1, 'Delete removes the selection');
        key('z', { ctrlKey: true }); key('z', { ctrlKey: true });
        const tree = host.querySelector('pk-tree');
        t.eq(tree.querySelectorAll('pk-tree-item').length, 5, 'the structure tree lists every node');
        const item = [...tree.querySelectorAll('pk-tree-item')].find(i => i.label.startsWith('pk-button'));
        item.dispatchEvent(new CustomEvent('pk-select', { bubbles: true, detail: { id: item.value } }));
        t.eq(selected(), 'pk-button', 'choosing a tree item selects it on the canvas');
        t.ok(host.querySelector('.lb-status').textContent.includes('pk-button'), 'the selection is announced');
        t.eq(host.querySelector('pk-code-block').textContent, builder.toHtml(), 'the HTML tab follows the page');
        builder.destroy(); t.ok(!host.querySelector('.lb'));
    }],
    ['layout builder module: the palette comes from the element API, the inspector edits props (enum, boolean, invalid number) and hostile models and markup are refused', async t => {
        const { mountLayoutBuilder } = await dist('layout-builder');
        const host = t.stage('');
        const problems = []; let saved = null;
        const builder = await mountLayoutBuilder(host, { html: '<pk-card heading="Open"><p>Waiting</p></pk-card>', onsave: e => { saved = e; } });
        builder.on('problem', e => problems.push(e.code));
        await t.load(host);
        const api = await (await fetch(new URL('../../dist/elements/api.json', import.meta.url))).json();
        const tags = () => [...host.querySelectorAll('.lb-palette pk-button[data-tag]')].map(b => b.dataset.tag);
        t.eq(new Set(tags()).size, tags().length, 'each element appears once');
        t.ok(tags().length >= api.length, 'every element of the API is offered (plus the native content tags)');
        const search = host.querySelector('pk-input[type=search]');
        search.value = 'tabs'; search.dispatchEvent(new Event('input', { bubbles: true, composed: true })); await t.settle();
        t.ok(tags().includes('pk-tabs') && tags().length < 8, 'search narrows the palette');
        builder.select(builder.getModel().nodes[0].id); await t.load(host);
        const control = attr => host.querySelector('.lb-form [data-attr="' + attr + '"]');
        const fire = (el, type) => el.dispatchEvent(new Event(type, { bubbles: true, composed: true }));
        control('heading').value = 'Renamed'; fire(control('heading'), 'input'); await t.settle();
        t.eq(builder.getModel().nodes[0].props.heading, 'Renamed', 'a string prop edits the model');
        control('tone').value = 'error'; fire(control('tone'), 'change'); await t.settle();
        t.eq(host.querySelector('.lb-page pk-card').getAttribute('tone'), 'error', 'an enum prop reaches the live element');
        control('flush').checked = true; fire(control('flush'), 'change'); await t.settle();
        t.eq(builder.getModel().nodes[0].props.flush, true, 'a boolean prop is present or absent');
        control('level').value = 'abc'; fire(control('level'), 'input'); await t.settle();
        t.ok(control('level').hasAttribute('invalid') && !('level' in builder.getModel().nodes[0].props), 'an invalid number is refused and marked');
        t.ok(problems.includes('invalid'), 'the refusal is reported');
        t.ok(host.querySelectorAll('.lb-inspector pk-accordion-item').length > 3, 'the element inspector shows the documentation');
        const id = builder.insert('pk-badge');
        t.ok(id && builder.getModel().nodes[0].slots[''].some(c => c.tag === 'pk-badge'), 'a palette insert goes inside the selected container');
        const hostile = builder.setModel({ version: 1, seq: 2, nodes: [{ id: 'n1', tag: 'script', props: {}, slots: {} }] });
        t.ok(!hostile.ok && builder.getModel().nodes[0].tag === 'pk-card', 'a model with a script tag is refused and the page is kept');
        const markup = builder.setHtml('<p onclick="x()">Hi</p><script>alert(1)</script><a href="' + 'java' + 'script:x">l</a>');
        t.ok(markup.problems.length >= 3 && !/script|onclick|javascript/.test(builder.toHtml()), 'markup is sanitised on the way in');
        host.querySelector('.lb pk-button[data-action=save]').click(); await t.settle();
        t.ok(saved && saved.html === builder.toHtml() && saved.model === builder.getModel(), 'Save hands the host the model and the HTML');
        builder.destroy();
    }],
];
