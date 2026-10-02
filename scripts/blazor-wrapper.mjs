// Blazor stays a thin 1:1 wrapper (#801, step 10; docs/superpowers/specs/2026-10-02-multiselect-and-blazor-wrapper-audit.md, Part 2).
// Pure scanner behind scripts/tests/blazor-wrapper.test.mjs: it lists the HAND-WRITTEN files of blazor/src/PlainKit.Blazor (everything except
// Generated/, wwwroot/, obj/, bin/) with their line counts, and reports three kinds of finding in them:
//
//   name-parity    a hand-written component (Components/*.razor) whose name is not Pk + an element or module tag in PascalCase.
//   layout-recipe  a .razor whose markup instantiates two or more OTHER Pk* components (a layout recipe such as PkRecordForm's form + stack + toolbar):
//                  markup tags only (a tag opens after whitespace or `>`, so `EventCallback<PkSelectEventArgs>` and `Func<PkListRequest...>` do not count).
//   state-machine  Timer/PeriodicTimer/Task.Delay (timing), CancellationTokenSource (cancellation), a request sequence counter or generation guard
//                  (a stale-load guard) or a retry/attempt loop, in code and markup with comments removed. A file may declare in the inventory
//                  `allows: [timing|cancellation|sequence|retry]` for what is legitimate there (PageBase's busy timing, PkCallbackSlot's call cancellation);
//                  each line of that is visible in a pull request.
//
// Over-flagging is possible (a word match in a string). Fix the source, or say why in the baseline entry; never widen a rule to hide a finding.
import fs from 'node:fs';
import path from 'node:path';

export const BASE = 'blazor/src/PlainKit.Blazor';
export const CATEGORIES = {
    'typed-generics': 'a typed (TItem) component or type that shapes rows, columns or results for the element',
    'callback-slot': 'runs a .NET callback for an element callback property (PkCallbackSlot) or is the slot itself',
    'router': 'needs NavigationManager or the Blazor router, which core cannot have',
    'editcontext': 'EditContext, DataAnnotations, ValueExpression or two-way binding for form controls',
    'mount': 'a marker element plus a mount bridge call; JavaScript (a core module) owns the content',
    'wrapper': 'a pass-through of an element (parameters, slots, events) the generator cannot express yet',
    'base': 'a base class or shared parameter set for generated or hand-written components',
    'runtime': 'server concern: JS loading, assets, DI, hosting, logging, time zone, page state, typed stores',
    'dto': 'a type for JSON, events or enums: no behaviour',
    'devtools': 'the inspector, snapshot and circuit state of the dev tools host',
    'debt': 'behaviour that belongs in core; listed in the baseline with its reason and the lift-out it waits for'
};
export const ALLOWS = ['timing', 'cancellation', 'sequence', 'retry'];
export const RULES = ['name-parity', 'layout-recipe', 'state-machine'];

const SKIP = new Set(['Generated', 'wwwroot', 'obj', 'bin']);

function walk(dir, rel, out) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.isDirectory()) { if (!SKIP.has(e.name)) walk(path.join(dir, e.name), rel ? `${rel}/${e.name}` : e.name, out); }
        else if (/\.(razor|cs)$/.test(e.name)) out.push(rel ? `${rel}/${e.name}` : e.name);
    }
    return out;
}

/** Source with comments removed: razor @* *@, block comments, // and /// lines, html comments. */
export const stripComments = text => text
    .replace(/@\*[\s\S]*?\*@/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '')
    .replace(/(^|[^:"'])\/\/[^\n]*/g, '$1');

export const lineCount = text => { const l = text.split(/\r?\n/); return l[l.length - 1] === '' ? l.length - 1 : l.length; };

/** The distinct Pk* components a razor file instantiates, in markup or through a RenderTreeBuilder (not generic arguments). */
export const markupComponents = text => {
    const src = stripComments(text);
    return new Set([...src.matchAll(/(?:^|[\s>])<(Pk[A-Z]\w*)(?=[\s/>])/g), ...src.matchAll(/\bOpenComponent<(Pk[A-Z]\w*)>/g)].map(m => m[1]));
};

const STATE = {
    timing: /\bPeriodicTimer\b|\bnew\s+(?:System\.Threading\.)?Timer\b|\bTask\.Delay\b/,
    cancellation: /\bCancellationTokenSource\b/,
    sequence: /\+\+\s*_?\w*(?:sequence|generation|serial)\w*|\b_?\w*(?:sequence|generation)\w*\s*\+\+|\bsequence\s*(?:!=|==)\s*_/i,
    retry: /\b(?:retry|retries|attempts?)\b/i
};

/** Which kinds of state-machine code `text` contains. */
export const stateKinds = text => { const t = stripComments(text); return Object.keys(STATE).filter(k => STATE[k].test(t)); };

/**
 * @param {string} root repository root
 * @param {{ files: Record<string, { allows?: string[], blazorOnly?: string }> }} inventory
 * @returns {{ files: { file: string, lines: number }[], findings: { rule: string, file: string, message: string }[], known: Set<string> }}
 */
export function scan(root, inventory) {
    const dir = path.join(root, BASE);
    const files = walk(dir, '', []).sort().map(file => ({ file, text: fs.readFileSync(path.join(dir, file), 'utf8') }));
    const known = new Set(fs.readdirSync(path.join(root, 'blazor/mappings')).filter(f => f.endsWith('.json')).map(f => 'pk-' + f.replace(/\.json$/, '')));
    for (const d of fs.readdirSync(path.join(root, 'core/modules'), { withFileTypes: true })) if (d.isDirectory()) known.add('pk-' + d.name);
    const pascal = new Set([...known].map(t => 'Pk' + t.slice(3).split('-').map(s => s[0].toUpperCase() + s.slice(1)).join('')));
    const findings = [];
    for (const { file, text } of files) {
        const entry = inventory.files?.[file] ?? {};
        const name = path.posix.basename(file).replace(/\.razor$/, '');
        if (file.startsWith('Components/') && file.endsWith('.razor') && name !== '_Imports' && !pascal.has(name) && !entry.blazorOnly)
            findings.push({ rule: 'name-parity', file, message: `${name} matches no element or module tag (Pk + the tag in PascalCase)` });
        if (file.endsWith('.razor')) {
            const others = [...markupComponents(text)].filter(c => c !== name);
            if (others.length >= 2) findings.push({ rule: 'layout-recipe', file, message: `markup composes ${others.length} other components (${others.sort().join(', ')})` });
        }
        const kinds = stateKinds(text).filter(k => !(entry.allows ?? []).includes(k));
        if (kinds.length) findings.push({ rule: 'state-machine', file, message: `${kinds.join(', ')} in hand-written code` });
    }
    return { files: files.map(f => ({ file: f.file, lines: lineCount(f.text) })), findings, known: pascal };
}

export const key = f => `${f.rule} ${f.file}`;
