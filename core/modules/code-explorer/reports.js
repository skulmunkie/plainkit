// Code-explorer reports: pure functions over file content already loaded by a provider ({ path, lines: string[] }[]), each
// returning rows with the { path, line } an existing pk-code-explorer already knows how to open via openFile(path, { line }).
// Kept framework-free (no DOM) so they are unit-testable as plain functions over a fake file list.
//
// A PkCodePattern: { name, pattern, label? }. `pattern` is either a JS RegExp (vanilla JS only), or a string: either a literal
// substring, or the same "/source/flags" convention the search box already uses (providers.js: matcherFor) so a host that can
// only pass plain strings (Blazor's PkCodePattern) can still supply a regex. A "count of a directive per file" report (e.g.
// counting `import` lines) is just a pattern report with one pattern -- issue #122 point 4 needs nothing beyond this.

const REGEX_LITERAL = /^\/(.+)\/([a-z]*)$/;

// A pattern's source -> a global RegExp that finds every hit on a line.
export function compilePattern(pattern) {
    if (pattern instanceof RegExp) {
        const flags = pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g';
        return new RegExp(pattern.source, flags);
    }
    const m = REGEX_LITERAL.exec(String(pattern));
    if (m) return new RegExp(m[1], m[2].includes('g') ? m[2] : m[2] + 'g');
    const escaped = String(pattern).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(escaped, 'g');
}

// One row per (file, pattern) that matched at least once, ranked by count descending. `files` is [{ path, lines: string[] }].
// `patterns` is [{ name, pattern, label? }]. Each row: { name, label, path, line (of the first hit), count }.
export function patternReport(files, patterns) {
    const compiled = (patterns ?? []).map(p => ({ name: p.name, label: p.label, regex: compilePattern(p.pattern) }));
    const rows = [];
    for (const f of files) {
        for (const p of compiled) {
            let count = 0;
            let line = null;
            f.lines.forEach((text, i) => {
                p.regex.lastIndex = 0;
                const hits = text.match(p.regex);
                if (hits) { count += hits.length; if (line === null) line = i + 1; }
            });
            if (count) rows.push({ name: p.name, label: p.label, path: f.path, line, count });
        }
    }
    return rows.sort((a, b) => b.count - a.count);
}

// ---- largest files / longest methods --------------------------------------------------------------------------------------

// One row per file, ranked by line count descending. `files` is [{ path, lines: string[] }]. Each row: { path, line: 1, count }
// (count = number of lines), the same shape as patternReport's rows so the UI can reuse its rendering.
export function largestFilesReport(files) {
    return (files ?? [])
        .map(f => ({ path: f.path, line: 1, count: f.lines.length }))
        .filter(r => r.count > 0)
        .sort((a, b) => b.count - a.count);
}

// A method/function heuristic for brace languages (C#, JS, TS, Java, ...): a line that looks like a declaration (has an
// identifier immediately followed by "(" ... ")" and, before or after the parens, at least one recognised modifier or a
// brace-opening keyword) opens a method at its "{" and the method ends at the matching "}", found by counting braces on
// every line from there on. This is a heuristic, not a parser: it does not understand strings, comments, template literals
// or interpolated braces, so a brace inside a string or a comment throws the count off (a known limitation -- not worth a
// real tokenizer here, since reports.js is meant to stay simple pure functions over lines of text).
const DECLARATION = /^\s*(?:(?:public|private|protected|internal|static|async|export|default|abstract|virtual|override|readonly|sealed|const|function|get|set|new)\s+)+[\w<>[\],. ]*?\b(\w+)\s*\([^;]*?\)\s*(?:where\s+[^{]*)?\{?\s*$/;

// One row per detected method, ranked by length (in lines) descending. `files` is [{ path, lines: string[] }].
// Each row: { path, line (of the declaration), count (length in lines), name }.
export function longestMethodsReport(files) {
    const rows = [];
    for (const f of files ?? []) {
        const lines = f.lines;
        for (let i = 0; i < lines.length; i++) {
            const text = lines[i];
            const m = DECLARATION.exec(text);
            if (!m) continue;
            // Find the opening brace: on this line, or (brace-on-its-own-line style) the next non-blank line.
            let openAt = i;
            const openCol = text.indexOf('{');
            if (openCol < 0) {
                openAt = i + 1;
                while (openAt < lines.length && lines[openAt].trim() === '') openAt++;
                if (openAt >= lines.length || !lines[openAt].includes('{')) continue;
            }
            let depth = 0;
            let end = -1;
            for (let j = openAt; j < lines.length; j++) {
                for (const ch of lines[j]) {
                    if (ch === '{') depth++;
                    else if (ch === '}') { depth--; if (depth === 0) { end = j; break; } }
                }
                if (end >= 0) break;
            }
            if (end < 0) continue; // unbalanced braces (likely a string/comment the heuristic does not understand) -- skip rather than guess
            rows.push({ path: f.path, line: i + 1, count: end - i + 1, name: m[1] });
        }
    }
    return rows.sort((a, b) => b.count - a.count);
}

// ---- duplicate blocks -------------------------------------------------------------------------------------------------------

// True for a line that cannot by itself signal duplication: blank, or only a closing brace/tag ("}", "})", "});", "</div>", ...).
const TRIVIAL_LINE = /^\s*$|^\s*[)\];,]*\}[)\];,]*$|^\s*<\/[\w.:-]+>\s*$/;

// Runs of `minLines` or more identical (whitespace-insensitive) consecutive, non-trivial lines that occur in 2+ places across
// the snapshot. `files` is [{ path, lines: string[] }]. Each result: { key, length, locations: [{ path, line }] }, sorted by
// (length * occurrence count) descending -- the biggest wins first. A run is normalized (each line trimmed, blank runs of
// whitespace collapsed) before comparison so indentation differences do not hide a duplicate.
export function duplicateBlocksReport(files, minLines = 4) {
    const norm = text => text.trim().replace(/\s+/g, ' ');
    // path -> normalized lines, and which lines are "trivial" (cannot anchor or end a duplicate run on their own).
    const docs = (files ?? []).map(f => ({ path: f.path, lines: f.lines.map(norm), trivial: f.lines.map(l => TRIVIAL_LINE.test(l)) }));
    const byKey = new Map(); // key (joined block text) -> [{ path, line }]
    for (const doc of docs) {
        for (let i = 0; i + minLines <= doc.lines.length; i++) {
            if (doc.trivial[i]) continue;
            const block = doc.lines.slice(i, i + minLines);
            if (block.every(l => l === '')) continue;
            const key = block.join('\n');
            if (!byKey.has(key)) byKey.set(key, []);
            byKey.get(key).push({ path: doc.path, line: i + 1 });
        }
    }
    const results = [];
    for (const [key, locations] of byKey) {
        if (locations.length < 2) continue;
        results.push({ key, length: minLines, locations });
    }
    return results.sort((a, b) => (b.length * b.locations.length) - (a.length * a.locations.length));
}
