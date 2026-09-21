// Pattern scripts: a pattern may ship <id>.js beside its markup (export default mount(root) -> { destroy() }). The build carries it into the
// gallery data and dist, preview.js loads it, and this file keeps it honest: it loads, it names only real elements and events, it logs
// through the SDK logger, it removes what it adds, and it stays inside CSP.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build, loadSamples } from '../tools/build.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8').replace(/\r\n/g, '\n');
const patterns = loadSamples().patterns;
const withScript = patterns.filter(p => p.script);

// Every real tag and every event the elements document.
const metas = fs.readdirSync(path.join(root, 'elements'), { withFileTypes: true }).filter(d => d.isDirectory()).map(d => JSON.parse(read(`elements/${d.name}/${d.name}.meta.json`)));
const TAGS = new Set(metas.map(m => m.tag));
const EVENTS = new Set(metas.flatMap(m => (m.events ?? []).map(e => e.name)));
// Events every script may listen for: native ones the elements re-dispatch across the shadow boundary.
const NATIVE = new Set(['click', 'input', 'change', 'keydown', 'pagehide']);

test('the patterns that need behaviour ship a script, and the data names it', () => {
    for (const id of ['notifications', 'unsaved-settings', 'search-results', 'onboarding', 'master-detail-pattern', 'filter-table']) {
        const p = patterns.find(x => x.id === id);
        assert.equal(p?.script, `${id}/${id}.js`, `${id} has no script`);
    }
    for (const p of patterns) assert.equal(Boolean(p.script), fs.existsSync(path.join(root, 'samples/patterns', p.id, `${p.id}.js`)), `${p.id}: script field and file disagree`);
    assert.ok(withScript.length >= 6);
});

test('every pattern script loads and default-exports a mount function', async () => {
    for (const p of withScript) {
        const mod = await import(pathToFileURL(path.join(root, 'samples/patterns', p.script)).href);
        assert.equal(typeof mod.default, 'function', `${p.id}: no default export`);
        assert.equal(mod.default.length, 1, `${p.id}: mount takes the sample's root`);
    }
});

test('a script mounted on an empty root warns through the logger and returns a handle that can be destroyed', async () => {
    const { addLogSink, configureLogging } = await import('../js/log.js');
    const seen = [];
    configureLogging({ level: 'silent' }); // the sinks still see every entry, the console stays quiet
    const remove = addLogSink(e => seen.push(e));
    const empty = { querySelector: () => null, querySelectorAll: () => [], addEventListener() {} };
    for (const p of withScript) {
        const mount = (await import(pathToFileURL(path.join(root, 'samples/patterns', p.script)).href)).default;
        const before = seen.length;
        const handle = mount(empty);
        assert.equal(typeof handle?.destroy, 'function', `${p.id}: no handle`);
        handle.destroy();
        assert.ok(seen.length > before, `${p.id}: a sample without its hooks did not say so`);
    }
    remove?.();
});

test('a pattern script uses only real pk-* tags and events, and the SDK logger', () => {
    for (const p of withScript) {
        const src = read(`samples/patterns/${p.script}`);
        const code = src.replace(/^\s*\/\/.*$/gm, '');
        const tags = [...code.matchAll(/['"`<]\s*(pk-[a-z][a-z0-9-]*)/g)].map(m => m[1]).filter(t => !EVENTS.has(t));
        for (const t of tags) assert.ok(TAGS.has(t), `${p.id}: <${t}> is not an element`);
        // Custom events named as strings must be documented on some element; native ones come from the short list.
        const events = [...code.matchAll(/addEventListener\(\s*['"]([\w-]+)['"]/g)].map(m => m[1]);
        for (const type of events) assert.ok(NATIVE.has(type) || EVENTS.has(type), `${p.id}: "${type}" is neither a native event nor an element event`);
        for (const m of code.matchAll(/for \(const type of \[([^\]]+)\]/g)) for (const type of m[1].match(/'([\w-]+)'/g).map(s => s.slice(1, -1))) assert.ok(NATIVE.has(type) || EVENTS.has(type), `${p.id}: "${type}"`);
        assert.match(src, /import \{ createLogger \} from '\.\.\/\.\.\/\.\.\/js\/log\.js';/, `${p.id}: logs through createLogger`);
        assert.match(src, /createLogger\('pattern:/, `${p.id}: logger scope`);
        assert.ok(!/\bconsole\./.test(code), `${p.id}: bare console`);
        assert.ok(!/\beval\(|new Function|innerHTML|insertAdjacentHTML|document\.write|\.style\.cssText|setAttribute\(\s*'style'/.test(code), `${p.id}: unsafe sink`);
        assert.ok(!/catch\s*(\(\w*\))?\s*\{\s*\}/.test(code), `${p.id}: empty catch`);
    }
});

test('a script cleans up: every listener it adds goes through one AbortController, destroyed with the sample', () => {
    for (const p of withScript) {
        const src = read(`samples/patterns/${p.script}`);
        assert.match(src, /new AbortController\(\)/, `${p.id}: no AbortController`);
        assert.match(src, /destroy\(\) \{[^}]*ac\.abort\(\)/, `${p.id}: destroy does not abort`);
        const adds = [...src.matchAll(/addEventListener\((?:[^()]|\([^()]*\))*\)/g)].map(m => m[0]);
        for (const a of adds) assert.match(a, /signal: ac\.signal/, `${p.id}: a listener without the signal: ${a.slice(0, 60)}`);
        assert.ok(!/set(Timeout|Interval)\(/.test(src.replace(/\/\/.*$/gm, '')), `${p.id}: a timer needs a cleanup`);
    }
});

test('the build carries the scripts into the gallery data and dist/gallery, and the preview host loads them', async () => {
    const { out } = build({ write: false });
    for (const p of withScript) {
        assert.ok(out.has(`dist/gallery/patterns/${p.script}`), `${p.id}: not in dist/gallery`);
        const distText = out.get(`dist/gallery/patterns/${p.script}`);
        // Same depth as the source, so the SDK import resolves to dist/js.
        assert.match(distText, /from '\.\.\/\.\.\/\.\.\/js\/log\.js'/);
        assert.ok(out.has('dist/js/log.js'));
        assert.match(out.get('dist/gallery/gallery.data.js'), new RegExp(`"script": "${p.script.replace('/', '\\/')}"`), `${p.id}: not in the gallery data`);
    }
    assert.match(out.get('dist/gallery/paths.js'), /PATTERNS_DIR = 'patterns\/'/);
    assert.match(read('site/gallery/paths.js'), /PATTERNS_DIR = '\.\.\/\.\.\/samples\/patterns\/'/);
    const preview = out.get('dist/gallery/preview.js');
    assert.match(preview, /PATTERNS_DIR \+ entry\.script/);
    assert.match(preview, /destroy/);
});

test('the samples that were static are live: the markup carries the hooks the scripts use', () => {
    const html = id => patterns.find(p => p.id === id).html;
    assert.match(html('notifications'), /data-toast="saved"/);
    assert.match(html('unsaved-settings'), /data-bar/);
    assert.match(html('search-results'), /data-query/);
    assert.match(html('onboarding'), /data-stepper/);
    assert.match(html('master-detail-pattern'), /data-detail/);
    assert.match(html('filter-table'), /data-field="status"/);
    assert.ok(!/data-filter=/.test(html('filter-table')), 'data-filter on a toolbar control would also drive the table\'s own filter handler');
    const record = loadSamples().layouts.find(l => l.id === 'record').html;
    assert.match(record, /<pk-timeline /);
    assert.ok(!record.includes('No changes yet'), 'the History tab is filled');
});
