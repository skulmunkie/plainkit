// A-3 (design 2026-09-28-conformance-audit-cli-design.md, section 3): the generated hint data is well-formed, and every
// `replaces`/`aliases` entry an element declares resolves to a real element - the parity test of design section 10 scoped to
// this slice. Runs against the checked-in sources directly (loadElementMetas etc.), and against the generated module that
// scripts/bootstrap.mjs writes (a missing file says to run it, the same message every other generated-file test gives).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadElementMetas, buildElementHints, parseTokens, loadTokens, loadPageTypes, buildAuditData } from './data.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const generatedFile = path.join(root, 'core', 'tools', 'audit', 'generated.data.mjs');

test('every element replaces/aliases entry resolves to a real pk-* element or a known selector/API shape', () => {
    const metas = loadElementMetas();
    const tags = new Set(metas.map(m => m.tag));
    assert.ok(tags.size > 50, 'expected the full element catalogue to load');
    for (const m of metas) {
        for (const alias of m.aliases ?? []) assert.ok(typeof alias === 'string' && alias.length > 0, `${m.tag}: aliases entry must be non-empty (${JSON.stringify(alias)})`);
        for (const entry of m.replaces ?? []) {
            assert.match(entry, /^(api:[\w.]+|[a-z][a-z0-9]*(\[[^\]]+\])?|\[[^\]]+\])$/, `${m.tag}: replaces entry "${entry}" has an unrecognised shape`);
        }
    }
});

test('buildElementHints: tag, class and role hints all point at a real element tag', () => {
    const metas = loadElementMetas();
    const tags = new Set(metas.map(m => m.tag));
    const { tagHints, classHints, roleHints, apiHints } = buildElementHints(metas);
    assert.ok(Object.keys(tagHints).length > 0, 'expected at least one tag hint');
    assert.ok(Object.keys(classHints).length > 50, 'expected a class hint for every element (tag minus prefix, plus aliases)');
    assert.ok(Object.keys(roleHints).length > 0, 'expected at least one role hint');
    for (const [, element] of Object.entries(tagHints)) assert.ok(tags.has(element), `tag hint points at unknown element ${element}`);
    for (const [, element] of Object.entries(classHints)) assert.ok(tags.has(element), `class hint points at unknown element ${element}`);
    for (const [, element] of Object.entries(roleHints)) assert.ok(tags.has(element), `role hint points at unknown element ${element}`);
    for (const { element } of apiHints) assert.ok(tags.has(element), `api hint points at unknown element ${element}`);
    // Known cases from the design's worked examples (section 3.1, 2.1) must resolve correctly.
    assert.equal(tagHints.button, 'pk-button');
    assert.equal(tagHints.table, 'pk-table');
    assert.equal(classHints.modal, 'pk-dialog');
    assert.equal(classHints.dialog, 'pk-dialog');
});

test('parseTokens: recognises every token group the design names, well-formed entries', () => {
    const css = `
:root {
    --color-accent: #4e93e3;
    --space-3: 0.75rem;
    --text-md: 1rem;
    --radius-sm: 4px;
    --shadow-card: 0 1px 2px rgba(0,0,0,0.4);
    --duration-fast: 120ms;
    --ease-out: cubic-bezier(0,0,0.2,1);
    --unrelated-thing: 3;
}`;
    const tokens = parseTokens(css);
    const groups = new Set(tokens.map(t => t.group));
    for (const g of ['color', 'space', 'text', 'radius', 'shadow', 'duration', 'ease']) assert.ok(groups.has(g), `missing token group ${g}`);
    assert.ok(!tokens.some(t => t.name === '--unrelated-thing'), 'a custom property outside the named groups must not be collected');
    for (const t of tokens) { assert.ok(t.name.startsWith('--')); assert.ok(t.value.length > 0); }
});

test('loadTokens: the repository token file parses to a non-empty, de-duplicated list', () => {
    const tokens = loadTokens();
    assert.ok(tokens.length > 20, 'expected a sizeable token list from core/tokens/tokens.css');
    const names = tokens.map(t => t.name);
    assert.equal(new Set(names).size, names.length, 'a token declared for both themes must be recorded once');
});

test('loadPageTypes: every built-in page type exports a well-formed PAGE_TYPE descriptor', async () => {
    const pageTypes = await loadPageTypes();
    assert.equal(pageTypes.length, 12, 'expected all 12 built-in page types to export PAGE_TYPE');
    const ids = new Set();
    for (const p of pageTypes) {
        for (const key of ['id', 'summary', 'useWhen']) assert.ok(typeof p[key] === 'string' && p[key].length > 0, `page type missing ${key}`);
        assert.ok(Array.isArray(p.configKeys), `${p.id}: configKeys must be an array`);
        assert.ok(Array.isArray(p.states), `${p.id}: states must be an array`);
        assert.ok(!ids.has(p.id), `duplicate page type id ${p.id}`);
        ids.add(p.id);
    }
});

test('buildAuditData: assembles elements, tokens and page types together', async () => {
    const data = await buildAuditData();
    assert.ok(data.elements.tagHints);
    assert.ok(data.tokens.length > 0);
    assert.ok(data.pageTypes.length > 0);
});

test('the generated data module (core/tools/audit/generated.data.mjs) is present and matches a fresh build', async () => {
    assert.ok(fs.existsSync(generatedFile), 'missing core/tools/audit/generated.data.mjs: run node scripts/bootstrap.mjs');
    const generated = await import('./generated.data.mjs');
    const fresh = await buildAuditData();
    assert.deepEqual(generated.TAG_HINTS, fresh.elements.tagHints);
    assert.deepEqual(generated.CLASS_HINTS, fresh.elements.classHints);
    assert.deepEqual(generated.ROLE_HINTS, fresh.elements.roleHints);
    assert.deepEqual(generated.API_HINTS, fresh.elements.apiHints);
    assert.deepEqual(generated.TOKENS, fresh.tokens);
    assert.deepEqual(generated.PAGE_TYPES, fresh.pageTypes);
});

test('hints.mjs re-exports the generated tables and keeps its own API/utility-layout hints well-formed', async () => {
    const hints = await import('./hints.mjs');
    assert.ok(hints.TAG_HINTS && hints.CLASS_HINTS && hints.ROLE_HINTS);
    assert.ok(Array.isArray(hints.API_HINTS) && hints.API_HINTS.length > 0);
    for (const h of hints.API_HINTS) { assert.ok(h.re instanceof RegExp); assert.ok(typeof h.element === 'string'); assert.ok(typeof h.api === 'string'); }
    assert.ok(hints.UTILITY_LAYOUT_CLASSES.has('d-flex'));
});
