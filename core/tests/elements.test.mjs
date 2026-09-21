// The parts of the element model that need no DOM: prop coercion, template bindings, the loader plan, the API schema and its guards, the
// build output, the size budget. The DOM behaviour is in tests/browser/ (run in a tab; elements-attest.test.mjs fails if it is stale).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { kebab, camel, coerce, parseBindings, bindValue } from '../js/element-core.js';
import { planLoad } from '../js/loader.js';
import { validateApi, propsObject } from '../tools/element-api.mjs';
import { build, loadElementSources, elementModule } from '../tools/build.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8').replace(/\r\n/g, '\n');
const elements = loadElementSources();

test('kebab and camel are inverses for prop names', () => {
    assert.equal(kebab('tabIndexValue'), 'tab-index-value'); assert.equal(camel('tab-index-value'), 'tabIndexValue');
    for (const n of ['a', 'heading', 'ariaLevel', 'delegatesFocusOnClick']) assert.equal(camel(kebab(n)), n);
});

test('coerce turns attributes and assigned values into the declared type', () => {
    const b = { type: 'boolean', default: false }; const n = { type: 'number', default: 5 }; const e = { type: 'enum', values: ['a', 'b'], default: 'a' }; const s = { type: 'string', default: 'x' };
    assert.equal(coerce(b, '', true), true); assert.equal(coerce(b, null, true), false); assert.equal(coerce(b, 'false', true), false); assert.equal(coerce(b, 1), true); assert.equal(coerce(b, 0), false);
    assert.equal(coerce(n, '7', true), 7); assert.equal(coerce(n, 'abc', true), 5); assert.equal(coerce(n, null, true), 5); assert.equal(coerce(n, '', true), 5); assert.equal(coerce(n, 0), 0);
    assert.equal(coerce(e, 'b'), 'b'); assert.equal(coerce(e, 'z'), 'a'); assert.equal(coerce(e, null, true), 'a');
    assert.equal(coerce(s, 'y'), 'y'); assert.equal(coerce(s, null, true), 'x'); assert.equal(coerce(s, 3), '3');
});

test('parseBindings splits text and bindings, and bindValue renders them', () => {
    const parts = parseBindings('Hi {{name}}, {{ n|str }}!');
    assert.deepEqual(parts, ['Hi ', { key: 'name', str: false }, ', ', { key: 'n', str: true }, '!']);
    assert.equal(bindValue(parts, { name: 'Ann', n: false }), 'Hi Ann, false!');
    assert.equal(bindValue(parts, { name: undefined, n: 0 }), 'Hi , 0!');
    assert.deepEqual(parseBindings('plain'), ['plain']);
});

test('a lone attribute binding removes the attribute for false/empty, sets it for true, stringifies the rest', () => {
    const lone = parseBindings('{{x}}');
    for (const [v, want] of [[false, null], [null, null], [undefined, null], ['', null], [true, ''], ['a', 'a'], [3, '3']]) assert.equal(bindValue(lone, { x: v }, true), want, `value ${String(v)}`);
    assert.equal(bindValue(parseBindings('{{x|str}}'), { x: false }, true), 'false', '|str keeps false as text');
    assert.equal(bindValue(parseBindings('a {{x}}'), { x: false }, true), 'a false', 'mixed text is never removed');
});

test('planLoad names only the pk-* tags the registry knows and nothing already loaded', () => {
    const reg = { 'pk-a': './a.js', 'pk-b': './b.js' };
    assert.deepEqual(planLoad(['pk-a', 'pk-a', 'div', 'pk-x', 'pk-b'], reg), [{ tag: 'pk-a', path: './a.js' }, { tag: 'pk-b', path: './b.js' }]);
    assert.deepEqual(planLoad(['pk-a', 'pk-b'], reg, new Set(['pk-a'])), [{ tag: 'pk-b', path: './b.js' }]);
    assert.deepEqual(planLoad([], reg), []);
});

test('every element folder has a complete, valid API that matches its template and css', () => {
    assert.ok(elements.length >= 6, 'the pilot elements exist');
    for (const el of elements) assert.deepEqual(validateApi(el.meta, { template: el.template, css: el.css, name: el.name }), [], el.name);
});

test('the API validator rejects each kind of drift', () => {
    const el = elements.find(e => e.name === 'card');
    const bad = (mutate, expect, tpl = el.template, css = el.css) => {
        const m = structuredClone(el.meta); mutate(m);
        const problems = validateApi(m, { template: tpl, css, name: 'card' });
        assert.ok(problems.some(p => p.includes(expect)), `expected "${expect}" in ${JSON.stringify(problems)}`);
    };
    bad(m => { delete m.a11y; }, 'a11y is required');
    bad(m => { m.props[0].description = ''; }, 'needs a description');
    bad(m => { m.props[0].type = 'date'; }, 'has type date');
    bad(m => { m.props.push({ ...m.props[0] }); }, 'declared twice');
    bad(m => { m.props[2].default = 'nope'; }, 'default is not one of its values');
    bad(m => { m.slots.pop(); }, 'template has a slot');
    bad(m => { m.slots.push({ name: 'extra', description: 'x' }); }, 'no such slot');
    bad(m => { m.parts.pop(); }, 'is not in meta.parts');
    bad(m => { m.cssProperties.pop(); }, 'meta.cssProperties does not declare it');
    bad(m => { m.cssProperties.push({ name: '--pk-card-ghost', description: 'x' }); }, 'the css never reads it');
    bad(m => { m.cssProperties[0].name = '--card-bg'; }, 'must start with --pk-');
    bad(m => { m.examples[0].html = '<pk-card style="x:y"></pk-card>'; }, 'style attribute');
    bad(() => {}, 'binds {{ghost}}', el.template.replace('{{heading}}', '{{ghost}}'));
    bad(() => {}, 'style element or attribute', el.template.replace('<div part="card">', '<div part="card" style="a:b">'));
    bad(m => { m.tag = 'card'; }, 'tag must look like');
});

test('propsObject is what the runtime reads: type, default, values and reflect only', () => {
    const o = propsObject(elements.find(e => e.name === 'button').meta);
    assert.deepEqual(o.variant, { type: 'enum', default: 'primary', values: ['primary', 'ghost', 'warn', 'secondary', 'plain'], reflect: true });
    assert.deepEqual(o.disabled, { type: 'boolean', default: false, reflect: true });
});

test('a tag is pk-<folder>, and the generated module inlines template, css and behaviour with no imports but the base', () => {
    for (const el of elements) {
        assert.equal(el.meta.tag, `pk-${el.name}`);
        const src = elementModule(el, { coreImport: '../js/element.js', minifyCss: true });
        // The base class, and at most shared modules from js/ (positioning, menu keys, scroll helpers): never another element or a package.
        const imports = [...src.matchAll(/^import [^\n]* from '([^']+)'/gm)].map(m => m[1]);
        assert.equal(imports[0], '../js/element.js', 'the base class first');
        for (const i of imports) assert.match(i, /^\.\.\/js\/[\w-]+\.js$/, `only shared js/ modules: ${i}`);
        assert.ok(src.includes(JSON.stringify(el.template)));
        assert.doesNotMatch(src, /\sstyle=|<style/);
        assert.match(src, /export default define\(class extends behaviour\(PkElement\)/);
    }
});

test('the build writes per-element modules, a registry, the FOUC guard and a page layer with no component rules', () => {
    const { out } = build({ write: false });
    const registry = JSON.parse(out.get('dist/elements/registry.js').replace(/^[\s\S]*?export default /, '').replace(/;\s*$/, ''));
    assert.deepEqual(Object.keys(registry).sort(), elements.map(e => e.meta.tag).sort());
    for (const el of elements) { assert.ok(out.has(`dist/elements/${el.name}.js`)); assert.ok(out.has(`elements/${el.name}/${el.name}.element.js`)); }
    const fouc = out.get('elements/elements.css');
    for (const el of elements) assert.ok(fouc.includes(`${el.meta.tag}:not(:defined)`), `${el.meta.tag} is hidden until defined`);
    assert.doesNotMatch(out.get('dist/plainkit.css'), /\.btn-primary:hover|\.card-header \{/, 'the primary sheet carries no class-based component rules');
    assert.match(out.get('dist/plainkit.css'), /:not\(:defined\)/);
    assert.ok(out.has('dist/elements/api.json'));
    assert.ok(!out.has('dist/plainkit-compat.css') && ![...out.keys()].some(f => f.startsWith('dist/components/')), 'the class-based layer is gone');
});

test('generated element files on disk are the build output (run node tools/build.mjs)', () => {
    const { out } = build({ write: false });
    for (const f of ['elements/registry.js', 'elements/elements.css', ...elements.map(e => `elements/${e.name}/${e.name}.element.js`), 'dist/elements/registry.js', 'dist/plainkit.css']) assert.equal(out.get(f), fs.readFileSync(path.join(root, f), 'utf8'), `${f} is stale`);
});

test('the element base stays small: element.js + element-core.js under 2.8 KB gzipped (comments and blank lines stripped)', () => {
    const strip = t => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\n\s+/g, '\n').replace(/\n+/g, '\n');
    const size = ['js/element.js', 'js/element-core.js'].reduce((n, f) => n + zlib.gzipSync(strip(read(f))).length, 0);
    assert.ok(size <= 2867, `base is ${size} bytes gzipped`);
});

test('no element source carries an inline style: template, css, behaviour, examples', () => {
    for (const el of elements) {
        assert.doesNotMatch(el.template, /\sstyle\s*=|<style/, el.name);
        assert.doesNotMatch(el.behaviour ?? '', /setAttribute\(\s*['"]style|\sstyle=|createElement\(\s*['"]style/, el.name);
        assert.doesNotMatch(el.css, /!important/, el.name);
    }
});

test('element css reads tokens, never a literal colour', () => {
    for (const el of elements) assert.doesNotMatch(el.css.replace(/var\([^)]*\)/g, ''), /#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/, `${el.name} has a literal colour`);
});

test('generated editor artefacts (manifest, VS Code data, web-types, typings) are in step with the meta files', async () => {
    const { allManifests } = await import('../tools/element-manifests.mjs');
    const metas = elements.map(e => e.meta);
    const made = allManifests(metas);
    const { out } = build({ write: false });
    for (const [name, text] of Object.entries(made)) assert.equal(out.get(`dist/${name}`), text.replace(/\r?\n/g, '\r\n'), `dist/${name} is stale: run node tools/build.mjs`);
    const cem = JSON.parse(made['custom-elements.json']);
    assert.deepEqual(cem.modules.map(m => m.declarations[0].tagName).sort(), metas.map(m => m.tag).sort());
    const button = cem.modules.find(m => m.declarations[0].tagName === 'pk-button').declarations[0];
    assert.ok(button.attributes.some(a => a.name === 'variant' && a.type.text.includes('"ghost"')));
    assert.ok(button.slots.some(s => s.name === 'start') && button.cssParts.some(p => p.name === 'control'));
    const vs = JSON.parse(made['vscode.html-custom-data.json']);
    assert.ok(vs.tags.find(t => t.name === 'pk-button').attributes.find(a => a.name === 'variant').values.some(v => v.name === 'warn'));
    const wt = JSON.parse(made['web-types.json']);
    assert.equal(wt.contributions.html.elements.length, metas.length);
    for (const m of metas) { assert.ok(made['elements.d.ts'].includes(`'${m.tag}': `)); assert.ok(made['elements.vue.d.ts'].includes(`'${m.tag}': `)); }
    assert.match(made['elements.d.ts'], /'pk-tab-change': CustomEvent<\{ value: unknown; previous: unknown; fallback\?: unknown \}>/);
    assert.doesNotMatch(made['elements.d.ts'], /'change': CustomEvent/, 'native event names keep their DOM typing');
});
