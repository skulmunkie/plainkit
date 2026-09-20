// An element that styles its slotted light-DOM content from the page-level layer lists those selectors in its meta (contentStyles).
// This fails when a listed selector is missing from dist/plainkit.css, so the element cannot lose its content styles unnoticed.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8').replace(/\r\n/g, '\n');
const norm = s => s.replace(/\s+/g, ' ');

test('every page-level selector an element lists in contentStyles exists in dist/plainkit.css', () => {
    const css = norm(read('dist/plainkit.css'));
    const problems = [];
    for (const d of fs.readdirSync(path.join(root, 'elements'), { withFileTypes: true }).filter(e => e.isDirectory())) {
        const meta = JSON.parse(read(`elements/${d.name}/${d.name}.meta.json`));
        if (meta.contentStyles !== undefined && !Array.isArray(meta.contentStyles)) problems.push(`${meta.tag}: contentStyles must be an array`);
        for (const sel of meta.contentStyles ?? []) {
            if (!meta.tag || !sel.startsWith(meta.tag)) problems.push(`${meta.tag}: ${sel} must start with the tag`);
            const rest = sel.slice(meta.tag.length).trim();
            // A selector may be written flat (pk-table th) or nested under the tag (pk-table { & th { ... } }).
            if (!css.includes(norm(sel)) && !(rest && (css.includes(norm(`& ${rest}`)) || css.includes(norm(`&${rest}`))))) problems.push(`${meta.tag}: ${sel} is not in dist/plainkit.css`);
        }
    }
    assert.deepEqual(problems, []);
});
