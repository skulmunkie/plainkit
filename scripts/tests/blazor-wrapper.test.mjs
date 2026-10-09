// Blazor stays a thin 1:1 wrapper (#801 step 10; docs/superpowers/specs/2026-10-02-multiselect-and-blazor-wrapper-audit.md, Part 2.5).
// The rules, the detectors and their limits are in scripts/blazor-wrapper.mjs. The data:
//   blazor/handwritten.json           every hand-written file of blazor/src/PlainKit.Blazor with its fixed category (and `allows`, `blazorOnly`).
//   blazor/handwritten.baseline.json  shrink-only: per-file line budgets and the debt (findings that predate the rule, each with its reason).
// Only a NEW finding, a grown file or an unlisted file fails; a shrunk file or a fixed finding must be taken out of the baseline (it only shrinks).
// Never add a debt entry to hide a new finding, and never raise a budget: lift the behaviour into core (or the generator) instead.
//
// Not enforced: "behaviour parameters have matching element props" (audit rule 5). The typed parameters of the hand-written wrappers (Columns, IdOf,
// SearchDebounceMs, ...) are renames of ONE config JSON prop, so a name match finds dozens of false findings (PkDataTable alone: 24); the names that
// do map to a prop are already checked by blazor-mappings.test.mjs. Revisit when the generator can express typed config.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scan, key, CATEGORIES, ALLOWS, RULES } from '../blazor-wrapper.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const readJson = f => JSON.parse(fs.readFileSync(path.join(root, f), 'utf8'));
const inventory = readJson('blazor/handwritten.json');
const baseline = readJson('blazor/handwritten.baseline.json');
const result = scan(root, inventory);
const onDisk = result.files.map(f => f.file);
const listed = Object.keys(inventory.files);

test('every hand-written file is inventoried with a fixed category (an unlisted new file fails)', () => {
    assert.ok(onDisk.length > 50, `found ${onDisk.length} hand-written files`);
    assert.deepEqual(onDisk.filter(f => !listed.includes(f)), [],
        'FIX: blazor/src/PlainKit.Blazor must stay a thin wrapper. If the new file is behaviour, put it in core (or the generator) instead; if it is a legitimate typed, callback, router, editcontext, runtime or dto file, add it to blazor/handwritten.json with its category and add its line count to blazor/handwritten.baseline.json "budgets"');
    assert.deepEqual(listed.filter(f => !onDisk.includes(f)), [], 'FIX: remove the deleted or generated file from blazor/handwritten.json and from "budgets" in blazor/handwritten.baseline.json');
});

test('every inventory entry has a category from the fixed set and valid options', () => {
    const names = Object.keys(CATEGORIES);
    for (const [file, e] of Object.entries(inventory.files)) {
        assert.ok(names.includes(e.category), `${file}: category "${e.category}" is not one of ${names.join(', ')}`);
        for (const a of e.allows ?? []) assert.ok(ALLOWS.includes(a), `${file}: allows "${a}" is not one of ${ALLOWS.join(', ')}`);
        if (e.blazorOnly !== undefined) assert.ok(typeof e.blazorOnly === 'string' && e.blazorOnly.trim(), `${file}: blazorOnly needs the reason this component has no element`);
        if (e.allows) assert.ok(['runtime', 'callback-slot', 'debt'].includes(e.category), `${file}: only runtime, callback-slot or debt files may allow state-machine code`);
    }
});

test('component names match element tags 1:1, and no hand-written file holds a state machine or a layout recipe, beyond the baseline', () => {
    assert.ok(result.known.has('PkTable') && result.known.has('PkConsole'), 'the element and module tags were found');
    const known = new Set(baseline.debt.map(key));
    const fresh = result.findings.filter(f => !known.has(key(f)));
    assert.deepEqual(fresh.map(f => `${f.rule} ${f.file}: ${f.message}`), [],
        'FIX: Blazor wraps an element 1:1 (Pk + the tag; a rename is an [Obsolete] alias) and holds no timers, stale-load guards, retry loops or multi-component layouts: move that behaviour into the element (or the generator) and keep the wrapper to parameters, slots and events. Never add to "debt" in blazor/handwritten.baseline.json');
});

test('the debt baseline has no stale entry, an unknown rule or an empty reason', () => {
    const now = new Set(result.findings.map(key));
    assert.deepEqual(baseline.debt.filter(d => !now.has(key(d))).map(key), [], 'FIX: delete the listed entries from "debt" in blazor/handwritten.baseline.json (the debt is paid)');
    for (const d of baseline.debt) {
        assert.ok(RULES.includes(d.rule), `${key(d)}: rule must be one of ${RULES.join(', ')}`);
        assert.ok(typeof d.reason === 'string' && d.reason.trim().length > 10, `${key(d)}: a debt entry states why it exists and what removes it`);
    }
    const files = new Set(baseline.debt.map(d => d.file));
    for (const [file, e] of Object.entries(inventory.files)) if (e.category === 'debt') assert.ok(files.has(file), `${file} is category debt but has no entry in the baseline "debt"`);
});

test('per-file line budgets only go down', () => {
    const budgets = baseline.budgets;
    const over = [], under = [], missing = [];
    for (const { file, lines } of result.files) {
        if (!(file in budgets)) missing.push(file);
        else if (lines > budgets[file]) over.push(`${file}: ${lines} lines, budget ${budgets[file]}`);
        else if (lines < budgets[file]) under.push(`${file}: ${lines} lines, budget ${budgets[file]}`);
    }
    assert.deepEqual(missing, [], 'FIX: add the file to "budgets" in blazor/handwritten.baseline.json with its current line count (and to blazor/handwritten.json)');
    assert.deepEqual(over, [], 'FIX: a hand-written Blazor file may not grow: move the behaviour into core or the generator (never raise the budget)');
    assert.deepEqual(under, [], 'FIX: the file shrank, so lower its budget in blazor/handwritten.baseline.json to the new line count (the budget only goes down)');
    assert.deepEqual(Object.keys(budgets).filter(f => !onDisk.includes(f)), [], 'FIX: remove the deleted file from "budgets" in blazor/handwritten.baseline.json');
});

test('every mapping marked existing states why, from a fixed set of reasons', () => {
    const kinds = ['typed-generics', 'named-slots', 'router', 'callback', 'server', 'behaviour'];
    const dir = path.join(root, 'blazor/mappings');
    let existing = 0;
    for (const f of fs.readdirSync(dir).filter(n => n.endsWith('.json'))) {
        const m = readJson(`blazor/mappings/${f}`);
        if (!m.existing) { assert.equal(m.existingReason, undefined, `${f}: existingReason without existing`); continue; }
        existing++;
        const reason = typeof m.existingReason === 'string' ? m.existingReason.trim() : '';
        assert.ok(reason.length > 0, `${f}: "existing": true needs an existingReason. FIX: say why the generator cannot produce it (start with ${kinds.join(', ')}), or remove "existing"`);
        assert.ok(kinds.some(k => reason.startsWith(k)), `${f}: existingReason must start with one of ${kinds.join(', ')}: "${reason}"`);
    }
    assert.ok(existing > 0, 'existing mappings were found');
});
