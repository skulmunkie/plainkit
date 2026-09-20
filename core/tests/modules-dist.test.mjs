// dist/<tool>/ is a tool module as other projects use it: self-contained, every path resolved inside dist/, no inline script or style.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { build } from '../tools/build.mjs';
import { MODULES } from '../tools/modules-dist.mjs';

const { out } = build({ write: false });
const resolve = (from, spec) => path.posix.normalize(path.posix.join(path.posix.dirname(from), spec.split(/[?#]/)[0]));
const files = name => [...out.keys()].filter(f => f.startsWith(`dist/${name}/`));

for (const name of Object.keys(MODULES)) {
    test(`dist/${name} holds its module, and every relative import, stylesheet and URL in it resolves to a file in dist`, () => {
        assert.ok(out.has(`dist/${name}/${name}.js`));
        const missing = [];
        for (const file of files(name)) {
            const text = out.get(file);
            const specs = /\.js$/.test(file)
                ? [...text.matchAll(/(?:from|import)\s*\(?\s*['"](\.{1,2}\/[^'"$`]+)['"]|new URL\(\s*['"](\.{1,2}\/[^'"]+)['"]/g)].map(m => m[1] ?? m[2])
                : [];
            for (const spec of specs) if (!out.has(resolve(file, spec)) && !out.has(resolve(file, spec).replace(/\/$/, ''))) missing.push(`${file} -> ${spec}`);
            const styles = [...text.matchAll(/const (?:OWN_)?STYLES = (\[.*?\]);/g)].flatMap(m => JSON.parse(m[1].replaceAll("'", '"')));
            for (const s of styles) if (!out.has(resolve(file, s))) missing.push(`${file} STYLES -> ${s}`);
        }
        assert.deepEqual(missing, []);
    });

    test(`dist/${name} names no source folder and asks for the page layer and the class-based components`, () => {
        for (const f of files(name).filter(x => /\.js$/.test(x))) {
            const code = out.get(f).replace(/\/\/ .*$/gm, '');
            assert.ok(!/\bsite\/|modules\/|samples\/|\/tokens\/tokens\.css/.test(code), `${f} names the source tree`);
            if (/STYLES/.test(code)) assert.match(code, /const STYLES = \['\.\.\/plainkit\.css', '\.\.\/plainkit-compat\.css'/, `${f} loads both stylesheets`);
        }
    });
}
