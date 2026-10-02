// scripts/move-tiers.mjs (#767): the planner is pure, so it is tested on a synthetic tree; apply runs in a throwaway repository. The real tree is never moved here.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { plan, apply, listElements, FOLDER, root } from '../move-tiers.mjs';

const elements = [{ name: 'button', tier: 'element' }, { name: 'tabs', tier: 'component' }, { name: 'tab-x', tier: 'element' }];
const files = {
    'core/elements/tabs/tabs.js': "import { b } from '../button/button.js';\nimport x from '../../js/x.js';\n",
    'core/elements/button/button.js': "import { t } from '../tabs/tabs.js';\n",
    'core/elements/tab-x/tab-x.js': "// not a mover: tab-x\n",
    'core/tests/a.test.mjs': "import '../elements/tabs/tabs.js'; const d = 'dist/elements/tabs.js'; const e = '../elements/tab-x/tab-x.js'; read(`elements/${n}/x`);\n",
    'core/elements/tabs/tabs.meta.json': '{}', 'CHANGELOG.md': 'core/elements/tabs/ is old\n',
};

test('plan lists the moves, rewrites only moving names (never dist/ or a longer name) and flags built paths', () => {
    const p = plan('component', { elements, files });
    assert.deepEqual(p.moves.map(m => m[1]).sort(), ['core/components/tabs/tabs.js', 'core/components/tabs/tabs.meta.json']);
    const after = Object.fromEntries(p.edits.map(e => [`${e.file}:${e.line}`, e.after]));
    assert.equal(after['core/tests/a.test.mjs:1'], "import '../components/tabs/tabs.js'; const d = 'dist/elements/tabs.js'; const e = '../elements/tab-x/tab-x.js'; read(`elements/${n}/x`);");
    assert.equal(after['core/elements/tabs/tabs.js:1'], "import { b } from '../../elements/button/button.js';", 'a moved file reaches a staying sibling through the elements folder');
    assert.equal(after['core/elements/button/button.js:1'], "import { t } from '../../components/tabs/tabs.js';");
    assert.ok(!('core/elements/tabs/tabs.js:2' in after), 'js/ imports keep their depth');
    assert.deepEqual(p.manual.map(m => m.file), ['core/tests/a.test.mjs'], 'elements/${n} is built from a variable: a human decides');
});

test('apply moves the folders and rewrites the references, keeping CRLF', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'move-tiers-'));
    const run = (...a) => assert.equal(spawnSync('git', a, { cwd: dir }).status, 0, a.join(' '));
    for (const [f, t] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); fs.writeFileSync(path.join(dir, f), t.replace(/\n/g, '\r\n')); }
    fs.writeFileSync(path.join(dir, 'core/elements/tabs/tabs.meta.json'), '{"tier":"component"}');
    for (const n of ['button', 'tab-x']) fs.writeFileSync(path.join(dir, `core/elements/${n}/${n}.meta.json`), '{"tier":"element"}');
    run('init', '-q'); run('add', '-A');
    const p = plan('component', { elements: listElements(dir), files: Object.fromEntries(Object.keys(files).map(f => [f, fs.readFileSync(path.join(dir, f), 'utf8')])) });
    apply(p, dir);
    assert.ok(fs.existsSync(path.join(dir, 'core/components/tabs/tabs.js')) && !fs.existsSync(path.join(dir, 'core/elements/tabs')));
    assert.equal(fs.readFileSync(path.join(dir, 'core/components/tabs/tabs.js'), 'utf8'), "import { b } from '../../elements/button/button.js';\r\nimport x from '../../js/x.js';\r\n");
    assert.match(fs.readFileSync(path.join(dir, 'core/tests/a.test.mjs'), 'utf8'), /'\.\.\/components\/tabs\/tabs\.js'/);
    fs.rmSync(dir, { recursive: true, force: true });
});

test('the real tree has every tier the script knows, and only the three tier folders are targets', () => {
    assert.deepEqual(FOLDER, { shell: 'shells', page: 'pages', component: 'components' });
    // A tier whose folder already exists has been moved (shells and pages in batch 1, #767): its plan is empty and its folder holds elements of that tier.
    const tiers = new Set(listElements().map(e => e.tier));
    for (const t of ['element', ...Object.keys(FOLDER)]) {
        const moved = fs.existsSync(path.join(root, 'core', FOLDER[t] ?? 'elements')) && t !== 'element';
        assert.ok(moved || tiers.has(t), t);
        if (t !== 'element') assert.equal(plan(t).moves.length > 0, !moved, `${t}: plan finds files exactly while its folder does not exist`);
    }
});
