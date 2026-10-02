// The tooling that is path-sensitive finds an element wherever its tier puts it (#767, prep for scripts/move-tiers.mjs). Each case puts a synthetic element in a
// tier folder (core/shells, core/pages, core/components) and asserts the tool still sees it: CI decisions, the UI review, the usage index, the generated-file
// list, the scorecard's stylesheet paths. Nothing here moves a real element; a batch of the move script must leave every case green.
import './needs-bootstrap.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { elementOfPath, listElementFolders, elementFile, TIER_FOLDERS } from '../tools/element-folders.mjs';
import { classify, usageIndex } from '../tools/usage-index.mjs';
import { decide } from '../../scripts/ci-changes.mjs';
import { changedFromFiles, dependentsFromIndex } from '../../scripts/ui-review.mjs';
import { isGenerated } from '../../scripts/generated.mjs';
import { elementCssPaths } from '../site/scorecard/css-paths.js';

const core = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FOLDERS = TIER_FOLDERS;

test('elementOfPath names the folder, the element and the file inside it, and is null outside an element folder', () => {
    assert.deepEqual(elementOfPath('core/shells/app-shell/app-shell.css'), { folder: 'shells', name: 'app-shell', rest: 'app-shell.css' });
    assert.deepEqual(elementOfPath('core\\pages\\x-page\\x-page.meta.json'), { folder: 'pages', name: 'x-page', rest: 'x-page.meta.json' });
    assert.equal(elementOfPath('core/elements/registry.js'), null);
    assert.equal(elementOfPath('core/js/element.js'), null);
});

test('CI decisions treat a file in any tier folder like one in core/elements', () => {
    for (const f of FOLDERS) {
        const files = [`core/${f}/zz/zz.css`];
        for (const area of ['node', 'dotnet', 'browser', 'pack', 'ui-review']) {
            const want = decide(area, { event: 'pull_request', files: ['core/elements/zz/zz.css'] }).run;
            assert.equal(decide(area, { event: 'pull_request', files }).run, want, `${area} for ${files[0]}`);
        }
        assert.equal(decide('browser', { event: 'pull_request', files }).run, true, `${f}: the browser suite runs`);
        assert.equal(decide('pack', { event: 'pull_request', files }).run, true, `${f}: the package check runs`);
        assert.equal(decide('ui-review', { event: 'pull_request', files }).run, true, `${f}: the UI review runs`);
    }
});

test('the UI review names a changed element in any tier folder, and its dependents', () => {
    const known = new Set(['zz', 'button']);
    for (const f of FOLDERS) {
        assert.deepEqual(changedFromFiles([`core/${f}/zz/zz.css`], known), { names: ['zz'], base: false }, f);
        assert.deepEqual(changedFromFiles([`core/${f}\\zz\\zz.html`], known).names, ['zz'], `${f} with Windows separators`);
    }
    const index = { button: { files: { elements: ['core/shells/zz/zz.html'], gallery: ['core/pages/yy/yy.meta.json'] } }, zz: { files: { elements: [], gallery: [] } } };
    assert.deepEqual(dependentsFromIndex(index).button, ['yy', 'zz']);
});

test('the usage index classifies the files of an element in any tier folder', () => {
    for (const f of FOLDERS) {
        assert.deepEqual(classify(`core/${f}/zz/zz.html`), { category: 'elements', owner: 'zz' }, f);
        assert.deepEqual(classify(`core/${f}/zz/zz.js`), { category: 'elements', owner: 'zz' }, f);
        assert.deepEqual(classify(`core/${f}/zz/zz.meta.json`), { category: 'gallery', owner: 'zz' }, f);
        assert.equal(classify(`core/${f}/zz/zz.element.js`), null, `${f}: generated`);
        assert.equal(classify(`core/${f}/zz/zz.css`), null, `${f}: not markup or script`);
    }
});

test('the usage index counts an element composed by an element that lives in a tier folder', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pk-tier-usage-'));
    try {
        const put = (rel, text) => { fs.mkdirSync(path.dirname(path.join(tmp, rel)), { recursive: true }); fs.writeFileSync(path.join(tmp, rel), text); };
        put('core/elements/button/button.html', '<slot></slot>');
        put('core/elements/button/button.meta.json', '{"examples":[]}');
        put('core/shells/zz-shell/zz-shell.html', '<pk-button>go</pk-button>');
        put('core/shells/zz-shell/zz-shell.meta.json', '{"examples":[{"html":"<pk-zz-shell></pk-zz-shell>"}]}');
        put('core/shells/zz-shell/zz-shell.element.js', '// generated: <pk-button>');
        const { index } = usageIndex(tmp);
        assert.deepEqual(index.button.files.elements, ['core/shells/zz-shell/zz-shell.html'], 'the shell template counts as an element file using the button');
        assert.equal(index.button.total, 1, 'the generated element.js does not count');
        assert.ok('zz-shell' in index, 'the shell is an element of the index');
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('the generated-file list covers the element module of every tier folder', () => {
    for (const f of FOLDERS) assert.equal(isGenerated(`core/${f}/zz/zz.element.js`), true, f);
    for (const f of FOLDERS) assert.equal(isGenerated(`core/${f}/zz/zz.js`), false, `${f}: the behaviour file is source`);
});

test('the scorecard finds every element stylesheet from the registry, whichever folder holds it', () => {
    const registry = { 'pk-button': './button/button.element.js', 'pk-app-shell': '../shells/app-shell/app-shell.element.js', 'pk-tabs': '../components/tabs/tabs.element.js' };
    assert.deepEqual(Object.keys(elementCssPaths(registry)), ['elements/button/button.css', 'shells/app-shell/app-shell.css', 'components/tabs/tabs.css']);
});

test('every stylesheet the scorecard resolves from the real registry exists', async () => {
    const registry = (await import(pathToFileURL(path.join(core, 'elements/registry.js')).href)).default;
    const paths = Object.keys(elementCssPaths(registry));
    assert.equal(paths.length, Object.keys(registry).length);
    for (const p of paths) assert.ok(fs.existsSync(path.join(core, p)), p);
    for (const e of listElementFolders(core)) assert.ok(fs.existsSync(elementFile(e.name, 'css', core)), e.name);
});

test('what dist/tools/audit ships imports only files that ship (data.mjs reads the repository and stays out)', () => {
    const dist = path.join(core, 'dist');
    const dir = path.join(dist, 'tools/audit');
    assert.equal(fs.existsSync(path.join(dir, 'data.mjs')), false, 'audit/data.mjs is a build step, not part of the package (a stale file from an older build: delete core/dist and run node scripts/bootstrap.mjs)');
    const problems = [];
    for (const f of fs.readdirSync(dir, { recursive: true })) {
        const file = path.join(dir, f);
        if (!fs.statSync(file).isFile() || !/\.mjs$/.test(f)) continue;
        for (const m of fs.readFileSync(file, 'utf8').matchAll(/(?:from|import)\s*\(?\s*['"](\.\.?\/[^'"]+)['"]/g)) {
            if (!fs.existsSync(path.resolve(path.dirname(file), m[1]))) problems.push(`${f}: imports ${m[1]}, which is not in dist`);
        }
    }
    assert.deepEqual(problems, []);
});
