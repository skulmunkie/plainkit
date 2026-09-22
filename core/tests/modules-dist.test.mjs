// dist/modules/<tool>/ is a tool module as other projects use it: a folder of the modules unit, every path resolved inside dist/ (its own files, or the runtime unit two folders up), no inline script or style.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { build } from '../tools/build.mjs';
import { MODULES } from '../tools/modules-dist.mjs';

const { out } = build({ write: false });
const resolve = (from, spec) => path.posix.normalize(path.posix.join(path.posix.dirname(from), spec.split(/[?#]/)[0]));
const files = name => [...out.keys()].filter(f => f.startsWith(`dist/modules/${name}/`));
const isRuntime = f => f.startsWith('dist/') && !f.startsWith('dist/modules/');

for (const name of Object.keys(MODULES)) {
    test(`dist/modules/${name} holds its module, and every relative import, stylesheet and URL in it resolves to a file in the unit or in the runtime`, () => {
        assert.ok(out.has(`dist/modules/${name}/${name}.js`));
        const missing = [];
        for (const file of files(name)) {
            const text = out.get(file);
            const specs = /\.js$/.test(file)
                ? [...text.matchAll(/(?:from|import)\s*\(?\s*['"](\.{1,2}\/[^'"$`]+)['"]|(?:new URL|runtimeUrl)\(\s*['"](\.{1,2}\/[^'"]+)['"]/g)].map(m => m[1] ?? m[2])
                : [];
            for (const spec of specs) if (!out.has(resolve(file, spec)) && !out.has(resolve(file, spec).replace(/\/$/, ''))) missing.push(`${file} -> ${spec}`);
            const styles = [...text.matchAll(/const (?:OWN_)?STYLES = (\[.*?\]);/g)].flatMap(m => JSON.parse(m[1].replaceAll("'", '"')));
            for (const s of styles) if (!out.has(resolve(file, s))) missing.push(`${file} STYLES -> ${s}`);
        }
        assert.deepEqual(missing, []);
    });

    test(`dist/modules/${name} names no source folder and asks for the runtime's page layer only`, () => {
        for (const f of files(name).filter(x => /\.js$/.test(x))) {
            const code = out.get(f).replace(/\/\/ .*$/gm, '');
            assert.ok(!/\bsite\/|\bsamples\/|\.\.\/\.\.\/dist\/|\.\.\/\.\.\/modules\/|\/tokens\/tokens\.css/.test(code), `${f} names the source tree`);
            if (/STYLES/.test(code)) assert.match(code, /const STYLES = \['\.\.\/\.\.\/plainkit\.css'\];/, `${f} loads the runtime's page stylesheet only`);
        }
    });

    test(`dist/modules/${name} reaches only its own folder, the other tools it composes, and the runtime's js/`, () => {
        const outside = [];
        for (const file of files(name).filter(x => /\.js$/.test(x))) {
            for (const m of out.get(file).matchAll(/from\s*['"](\.{1,2}\/[^'"]+)['"]/g)) {
                const target = resolve(file, m[1]);
                if (target.startsWith('dist/modules/') || target.startsWith('dist/js/')) continue;
                outside.push(`${file} -> ${m[1]}`);
            }
        }
        assert.deepEqual(outside, []);
    });
}

test('the theme editor module reads the runtime by relative paths that resolve from its unit folder', () => {
    const tab = out.get('dist/modules/theme-editor/sdk-tab.js');
    assert.match(tab, /export const DIST = '\.\.\/\.\.\/';/);
    assert.ok(isRuntime(resolve('dist/modules/theme-editor/sdk-tab.js', '../../manifest.json')) && out.has('dist/manifest.json'));
    assert.match(out.get('dist/modules/console/console.js'), /runtimeUrl\('\.\.\/\.\.\/elements\/api\.json'/);
    assert.match(out.get('dist/modules/layout-builder/layout-builder.js'), /const DEFAULT_API = '\.\.\/\.\.\/elements\/api\.json';/);
});
