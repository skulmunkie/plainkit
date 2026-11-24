// Strict equality (#1985, step 7): core/ source uses === and !==, never == or !=. The one allowed loose form is the nullish idiom `== null` /
// `!= null` (null and undefined together), which reads as intent. A tokenizer skips strings, template literals (their text, not their ${} code),
// comments and regular expression literals, so grammar quoted in text is not a finding. To fix a finding write === / !== (or `== null` for
// "null or undefined"); never edit this test.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const BS = String.fromCharCode(92);
const REGEX_AFTER = /^(?:[(,=:[!&|?{};+\-*%<>~^]|return|typeof|case|in|of|new|delete|void|throw|else|do|yield|await)$/;
const OPERATOR = /^(?:===|!==|==|!=|>>>=|<<=|>>=|>>>|\*\*=|&&=|\|\|=|\?\?=|=>|\?\?|\?\.|[-+*/%&|^<>=!]=?|[-+&|]{2}|<<|>>)/;

// Loose comparisons in JS source: [{ line, op, text }].
export function findLooseEquality(src) {
    const hits = [], braces = [];   // braces: a stack; 't' marks the `}` that resumes a template literal
    const n = src.length;
    let i = 0, line = 1, prev = '';
    const template = () => {   // after the opening backtick or a resuming `}`: skip text up to the closing backtick or the next `${`
        while (i < n) {
            const c = src[i];
            if (c === BS) { i += 2; continue; }
            if (c === '\n') line++;
            if (c === '`') { i++; prev = '"'; return; }
            if (c === '$' && src[i + 1] === '{') { i += 2; braces.push('t'); prev = '{'; return; }
            i++;
        }
    };
    while (i < n) {
        const c = src[i], d = src[i + 1];
        if (c === '\n') { line++; i++; continue; }
        if (/\s/.test(c)) { i++; continue; }
        if (c === '/' && d === '/') { while (i < n && src[i] !== '\n') i++; continue; }
        if (c === '/' && d === '*') {
            const e = src.indexOf('*/', i + 2), end = e < 0 ? n : e + 2;
            line += (src.slice(i, end).match(/\n/g) || []).length; i = end; continue;
        }
        if (c === '"' || c === "'") { i++; while (i < n && src[i] !== c && src[i] !== '\n') i += src[i] === BS ? 2 : 1; i++; prev = '"'; continue; }
        if (c === '`') { i++; template(); continue; }
        if (c === '/' && (prev === '' || REGEX_AFTER.test(prev))) {
            i++; let cls = false;
            while (i < n && src[i] !== '\n' && (cls || src[i] !== '/')) { if (src[i] === BS) i++; else if (src[i] === '[') cls = true; else if (src[i] === ']') cls = false; i++; }
            i++; while (/[a-z]/.test(src[i] || '')) i++;
            prev = '"'; continue;
        }
        if (c === '{') { braces.push('b'); prev = '{'; i++; continue; }
        if (c === '}') { const top = braces.pop(); i++; if (top === 't') { template(); continue; } prev = '}'; continue; }
        if (/[A-Za-z_$]/.test(c)) { let j = i; while (/[\w$]/.test(src[j] || '')) j++; prev = src.slice(i, j); i = j; continue; }
        if (/[0-9]/.test(c)) { let j = i; while (/[\w.]/.test(src[j] || '')) j++; prev = '0'; i = j; continue; }
        const m = OPERATOR.exec(src.slice(i, i + 4));
        if (m) {
            const op = m[0];
            if ((op === '==' || op === '!=') && !/^\s*null\b/.test(src.slice(i + 2, i + 12))) hits.push({ line, op, text: src.split('\n')[line - 1].trim().slice(0, 120) });
            prev = op; i += op.length; continue;
        }
        prev = c; i++;
    }
    return hits;
}

function sources() {
    const out = execFileSync('git', ['ls-files', '--', 'core/*.js', 'core/*.mjs'], { cwd: root, encoding: 'utf8' });
    return out.split('\n').filter(f => f && !/\.test\.mjs$/.test(f) && !/(^|\/)(dist|node_modules)\//.test(f));
}

test('the tokenizer finds loose equality in code, not in strings, comments, regexes or template text', () => {
    const src = [
        'if (a == b) {}',
        'if (a != b) {}',
        'if (a == null || b != null) {}',
        "const s = 'a == b';",
        'const t = `x != y ${a === c} z`;',
        '// a == b',
        '/* a != b */',
        'const r = /a==b/.test(x);',
        'const q = a / b == c;',
        'const u = `${a == d}`;',
    ].join('\n');
    assert.deepEqual(findLooseEquality(src).map(h => [h.line, h.op]), [[1, '=='], [2, '!='], [9, '=='], [10, '==']]);
});

test('core/ source compares with === and !==', () => {
    const bad = [];
    for (const f of sources()) for (const h of findLooseEquality(fs.readFileSync(path.join(root, f), 'utf8'))) bad.push(f + ':' + h.line + ': ' + h.op + '  ' + h.text);
    assert.deepEqual(bad, [], 'FIX: write === or !== (or == null for "null or undefined") in:\n' + bad.join('\n'));
});
