// Rewrites the "used" list in every sample's meta from the markup it carries: node core/tools/samples-sync.mjs
// (tests/samples.test.mjs fails when a list is wrong and names the exact value; this applies them.)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SAMPLE_GROUPS } from './build.mjs';
import { usedElements, elementFolders } from './usage.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const elements = elementFolders(root);
let changed = 0;
for (const [, dir] of SAMPLE_GROUPS) {
    for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true }).filter(d => d.isDirectory())) {
        const at = ext => path.join(root, dir, e.name, `${e.name}.${ext}`);
        const markup = ['html', 'js'].map(x => (fs.existsSync(at(x)) ? fs.readFileSync(at(x), 'utf8') : '')).join('\n');
        const raw = fs.readFileSync(at('meta.json'), 'utf8'); const meta = JSON.parse(raw);
        const used = usedElements(markup, elements);
        if (JSON.stringify(used) !== JSON.stringify(meta.used)) { fs.writeFileSync(at('meta.json'), JSON.stringify({ ...meta, used }, null, 2).replace(/\n/g, raw.includes('\r\n') ? '\r\n' : '\n') + (raw.includes('\r\n') ? '\r\n' : '\n')); changed++; }
    }
}
console.log(`updated ${changed} meta files`);
