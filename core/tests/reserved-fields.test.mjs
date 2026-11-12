// Guard (#1980): the base class (core/js/element.js) keeps its private state in short `this.$x` fields that
// every element shares. An element assigning one of them collides silently until render (#1977: `this.$b`).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const core = join(fileURLToPath(import.meta.url), '..', '..');
const FIELD = /this\.(\$\w+)/g;
const ASSIGN = /this\.(\$\w+)\s*(?:[-+*/|&?]{0,2}=(?!=)|\+\+|--)|(?:\+\+|--)this\.(\$\w+)/g;

function* jsFiles(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* jsFiles(p);
    else if (name.endsWith('.js') && !name.endsWith('.element.js') && !name.endsWith('.data.js')) yield p;
  }
}

const reserved = new Set([...readFileSync(join(core, 'js', 'element.js'), 'utf8').matchAll(FIELD)].map((m) => m[1]));

test('the base class owns some private $ fields', () => {
  assert.ok(reserved.size >= 4, `found ${[...reserved]}`);
});

test('no element, component, page, shell or module assigns a base-class private field', () => {
  const found = [];
  for (const group of ['elements', 'components', 'pages', 'shells', 'modules']) {
    let dir;
    try { dir = join(core, group); statSync(dir); } catch { continue; }
    for (const file of jsFiles(dir)) {
      readFileSync(file, 'utf8').split(/\r?\n/).forEach((line, i) => {
        for (const m of line.matchAll(ASSIGN)) {
          const name = m[1] || m[2];
          if (reserved.has(name)) found.push(`${relative(core, file)}:${i + 1} assigns this.${name}, a private field of PkElement (core/js/element.js). FIX: use a different name (for example this.$z).`);
        }
      });
    }
  }
  assert.deepEqual(found, []);
});
