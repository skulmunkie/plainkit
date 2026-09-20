// Samples and layers: every sample sits in its own folder with a meta file whose component list is true, and the top level is the
// documented set of layers.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSamples, SAMPLE_GROUPS, loadComponents } from '../tools/build.mjs';
import { classOwners, usedComponents, elementFolders } from '../tools/usage.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8').replace(/\r\n/g, '\n');
const owners = classOwners(root);
const elementNames = elementFolders(root);
const componentNames = new Set([...loadComponents().map(c => c.name), ...elementNames]);

test('the top level holds only the documented layers and entry files', () => {
    const allowed = new Set(['tokens', 'base', 'elements', 'components', 'layouts', 'samples', 'js', 'modules', 'site', 'tools', 'tests', 'dist', 'README.md', 'LICENSE', 'package.json', 'HANDOFF.md', 'STANDARDS.md', 'index.html', 'icons.svg', 'plainkit.css']);
    const extra = fs.readdirSync(root).filter(n => !allowed.has(n));
    assert.deepEqual(extra, [], 'a new top-level entry needs a place in the layer list (README and STANDARDS.md)');
});

test('every sample is a folder with html and meta, and its meta names the components its markup uses', () => {
    const problems = [];
    for (const [group, dir] of SAMPLE_GROUPS) {
        const base = path.join(root, dir);
        const folders = fs.readdirSync(base, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name);
        assert.ok(folders.length >= (group === 'patterns' ? 6 : 5), `${dir} has ${folders.length} samples`);
        for (const id of folders) {
            const meta = JSON.parse(read(`${dir}/${id}/${id}.meta.json`));
            const markup = ['html', 'js'].map(e => (fs.existsSync(path.join(base, id, `${id}.${e}`)) ? read(`${dir}/${id}/${id}.${e}`) : '')).join('\n');
            if (meta.id !== id) problems.push(`${dir}/${id}: meta.id is ${meta.id}`);
            for (const k of ['title', 'summary', 'used', 'order']) if (meta[k] === undefined) problems.push(`${dir}/${id}: meta lacks ${k}`);
            for (const u of meta.used ?? []) if (!componentNames.has(u)) problems.push(`${dir}/${id}: unknown component ${u}`);
            const actual = usedComponents(markup, owners, elementNames);
            if (JSON.stringify(actual) !== JSON.stringify(meta.used)) problems.push(`${dir}/${id}: used should be ${JSON.stringify(actual)}`);
        }
    }
    assert.deepEqual(problems, []);
});

test('loadSamples returns the three groups in order with their html', () => {
    const g = loadSamples();
    assert.deepEqual(Object.keys(g), ['templates', 'patterns', 'layouts']);
    for (const list of Object.values(g)) assert.deepEqual(list.map(s => s.order), [...list.map(s => s.order)].sort((a, b) => a - b));
    assert.ok(g.patterns.every(p => p.html.length > 40) && g.layouts.every(l => l.html.length > 40));
    assert.ok(g.templates.every(t => t.file.startsWith('samples/templates/') && fs.existsSync(path.join(root, t.file))));
});
