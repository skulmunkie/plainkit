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
