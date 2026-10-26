// scripts/core-js-users.mjs: which elements can load a core/js module. Never narrower than a browser can load.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { REVIEWED_COMPUTED_IMPORTS, coreJsUsers } from '../core-js-users.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const fixture = (t, files) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pk-cju-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    for (const [f, text] of Object.entries(files)) {
        fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
        fs.writeFileSync(path.join(dir, f), text);
    }
    return coreJsUsers(dir);
};

test('private helpers of one element select only that element', () => {
    const usersOf = coreJsUsers(root);
    assert.deepEqual(usersOf('core/js/dock-model.js'), { elements: ['dock'] });
    assert.deepEqual(usersOf('core/js/canvas-snap.js'), { elements: ['canvas'] });
    assert.deepEqual(usersOf('core/js/svg/align.js'), { elements: [] });
});

test('shared modules and non-modules are full', () => {
    const usersOf = coreJsUsers(root);
    assert.match(usersOf('core/js/element.js').full, /element\.js/);
    assert.match(usersOf('core/js/deprecation.js').full, /build\.mjs/);
    for (const f of ['core/js/log.js', 'core/js/init.js', 'core/js/reconnect.js']) assert.ok(usersOf(f).full, `${f} must be full`);
    assert.match(usersOf('core/js/app/pages/list.js').full, /computed import/);
    assert.match(usersOf('core/js/nope.js').full, /not a core\/js module/);
    assert.match(usersOf('core/js/app/manifest.schema.json').full, /not a core\/js module/);
});

test('every reviewed computed import still exists', () => {
    for (const f of Object.keys(REVIEWED_COMPUTED_IMPORTS)) {
        const text = fs.readFileSync(path.join(root, f), 'utf8');
        assert.ok(/(?<![.\w$])import\(\s*(?![\s'"`)])/.test(text), `FIX: ${f} has no computed import() any more; remove the stale entry from REVIEWED_COMPUTED_IMPORTS in scripts/core-js-users.mjs`);
    }
});

test('fixture: element and transitive imports', t => {
    const usersOf = fixture(t, {
        'core/js/a.js': 'export const a = 1;\n',
        'core/elements/x/x.js': "import { a } from '../../js/a.js';\n",
        'core/js/e.js': 'export const e = 1;\n',
        'core/js/f.js': "import { e } from './e.js';\nexport const f = e;\n",
        'core/components/y/y.js': "import { f } from '../../js/f.js';\n",
    });
    assert.deepEqual(usersOf('core/js/a.js'), { elements: ['x'] });
    assert.deepEqual(usersOf('core/js/e.js'), { elements: ['y'] });
});

test('fixture: an importer that is not an element or a core module is full', t => {
    const usersOf = fixture(t, {
        'core/js/b.js': 'export const b = 1;\n',
        'core/modules/m/m.js': "import { b } from '../../js/b.js';\n",
    });
    assert.match(usersOf('core/js/b.js').full, /imported by core\/modules/);
});

test('fixture: a file name in a string is full', t => {
    const usersOf = fixture(t, {
        'core/js/c.js': 'export const c = 1;\n',
        'core/js/d.js': "export const u = new URL('./c.js', import.meta.url);\n",
    });
    assert.match(usersOf('core/js/c.js').full, /named in a string/);
});

test('fixture: an unreviewed computed import makes every module full', t => {
    const usersOf = fixture(t, {
        'core/js/g.js': 'const m = await import(url);\n',
        'core/js/z.js': 'export const z = 1;\n',
    });
    assert.match(usersOf('core/js/z.js').full, /not reviewed/);
});

test('fixture: the Blazor bridge importing a module is full', t => {
    const usersOf = fixture(t, {
        'core/js/h.js': 'export const h = 1;\n',
        'blazor/src/PlainKit.Blazor/wwwroot/plainkit.blazor.js': "export const m = () => import('./plainkit/js/h.js');\n",
    });
    assert.match(usersOf('core/js/h.js').full, /plainkit\.blazor\.js/);
});
