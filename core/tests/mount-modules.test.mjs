// The tool modules (mountX(container, options)): the shared mount support, the snapshot tool and the code explorer module's options.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ensureStyles, styleUrls, loadJson } from '../js/mount-support.js';
import { collectSnapshot, symbolsOf } from '../tools/snapshot.mjs';
import { SnapshotProvider } from '../modules/code-explorer/providers.js';
import { mountCodeExplorer } from '../modules/code-explorer/code-explorer.js';

// A document just big enough for the mount code: links load the moment they are appended.
function fakeDoc(existing = []) {
    const links = existing.map(href => ({ href }));
    const el = tag => {
        const attrs = {}; const listeners = {};
        return {
            tag, attrs, rel: '', href: '', provider: null, removed: false,
            setAttribute(k, v) { attrs[k] = v; }, getAttribute: k => attrs[k] ?? null,
            addEventListener(type, fn) { listeners[type] = fn; },
            async openFile(p, o) { this.opened = [...(this.opened ?? []), [p, o]]; }, async search() {},
            remove() { this.removed = true; },
        };
    };
    const doc = {
        links,
        querySelectorAll: () => links,
        createElement: tag => el(tag),
        head: { append: link => links.push(link) },
    };
    return doc;
}
const withLoad = doc => {
    const create = doc.createElement;
    doc.createElement = tag => { const e = create(tag); if (tag === 'link') { const original = e.addEventListener; e.addEventListener = (t, fn) => { original(t, fn); if (t === 'load') queueMicrotask(fn); }; } return e; };
    return doc;
};

test('ensureStyles adds only the stylesheets the document lacks and resolves once they load', async () => {
    const doc = withLoad(fakeDoc(['http://x/dist/plainkit.css']));
    await ensureStyles(['http://x/dist/plainkit.css', 'http://x/dist/plainkit-extra.css'], doc);
    assert.deepEqual(doc.links.map(l => l.href), ['http://x/dist/plainkit.css', 'http://x/dist/plainkit-extra.css']);
    assert.equal(doc.links[1].rel, 'stylesheet');
});

test('styleUrls resolves against the module address', () => {
    assert.deepEqual(styleUrls(['../plainkit.css', './a.css'], 'http://x/dist/tool/tool.js'), ['http://x/dist/plainkit.css', 'http://x/dist/tool/a.css']);
});

test('loadJson fetches a URL, passes an object through and reports a failed fetch', async () => {
    const obj = { files: [] };
    assert.equal(await loadJson(obj), obj);
    assert.deepEqual(await loadJson('u', async () => ({ ok: true, json: async () => ({ a: 1 }) })), { a: 1 });
    await assert.rejects(loadJson('u', async () => ({ ok: false, status: 404 })), /u: 404/);
});

test('symbolsOf lists top-level JS declarations and CSS class rules, nothing else', () => {
    assert.deepEqual(symbolsOf('export function a() {}\n  const inner = 1;\nclass B {}\nexport const c = 2;', 'js').map(s => [s.kind, s.name, s.line]), [['function', 'a', 1], ['class', 'B', 3], ['const', 'c', 4]]);
    assert.deepEqual(symbolsOf('.a, .b { x: 1 }\n#id { }', 'css').map(s => s.name), ['.a']);
    assert.deepEqual(symbolsOf('# heading', 'md'), []);
});

test('collectSnapshot reads a folder into the explorer format and the explorer reads it back', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'snap-'));
    try {
        fs.mkdirSync(path.join(dir, 'src')); fs.mkdirSync(path.join(dir, 'node_modules'));
        fs.writeFileSync(path.join(dir, 'src', 'app.js'), 'export function run() {\r\n  return 1;\r\n}\r\n');
        fs.writeFileSync(path.join(dir, 'README.md'), '# Title\n');
        fs.writeFileSync(path.join(dir, 'logo.png'), 'x');
        fs.writeFileSync(path.join(dir, 'node_modules', 'skip.js'), 'x');
        const snap = collectSnapshot(dir, { generated: 'now' });
        assert.deepEqual(snap.files.map(f => f.path), ['README.md', 'src/app.js']);
        assert.equal(snap.files[1].content, 'export function run() {\n  return 1;\n}\n', 'line endings are normalized');
        assert.deepEqual(snap.files[1].symbols, [{ kind: 'function', name: 'run', line: 1, depth: 0 }]);
        const provider = new SnapshotProvider(snap);
        assert.equal((await provider.readFile('src/app.js')).lines[1], '  return 1;');
        assert.equal((await provider.search('return')).length, 1);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('mountCodeExplorer maps its options onto the element and returns a handle', async () => {
    const doc = withLoad(fakeDoc());
    let children = null;
    const container = { ownerDocument: doc, replaceChildren: (...c) => { children = c; } };
    const handle = await mountCodeExplorer(container, { snapshot: { files: [{ path: 'a.js', content: 'x' }] }, file: 'a.js', line: 3, search: 'x', theme: 'light', height: '20rem' });
    const el = handle.element;
    assert.deepEqual(children, [el]);
    assert.deepEqual(el.attrs, { height: '20rem', theme: 'light', initial: 'a.js', 'initial-line': '3', search: 'x' });
    assert.ok(el.provider instanceof SnapshotProvider);
    assert.ok(doc.links.some(l => l.href.endsWith('/plainkit.css')));
    handle.destroy();
    assert.ok(el.removed);
});

test('mountCodeExplorer defaults the height and refuses to start with nothing to show', async () => {
    const doc = withLoad(fakeDoc(['dummy']));
    const container = { ownerDocument: doc, replaceChildren() {} };
    const { element } = await mountCodeExplorer(container, { snapshot: { files: [] } });
    assert.equal(element.attrs.height, '32rem');
    await assert.rejects(mountCodeExplorer(container, {}), /needs a snapshot/);
});
