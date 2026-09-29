// Tiny hand-written glob subset for the audit CLI (design section 5.8: "no globbing library, since the glob
// subset (**, *, ?, {a,b}, negation) is about 60 lines to write"). No dependency, pure string/regex work plus
// one directory walk. Patterns are matched against POSIX-style paths relative to a root (forward slashes always,
// even on Windows).
import fs from 'node:fs';
import path from 'node:path';

export const DEFAULT_IGNORE_DIRS = ['node_modules', 'dist', 'bin', 'obj', '.git', 'coverage', '.next'];

function escapeLiteral(ch) {
    return ch.replace(/[.+^${}()|[\]\\]/g, '\\$&');
}

// Compiles one glob pattern into a RegExp anchored on both ends. Supports `**` (any depth, including none),
// `*` (within one path segment), `?` (one character, not `/`), and `{a,b,c}` alternation (no nesting).
export function globToRegExp(pattern) {
    let re = '';
    for (let i = 0; i < pattern.length; i++) {
        const ch = pattern[i];
        if (ch === '*' && pattern[i + 1] === '*') {
            if (pattern[i + 2] === '/') { re += '(?:.*/)?'; i += 2; } else { re += '.*'; i += 1; }
        } else if (ch === '*') {
            re += '[^/]*';
        } else if (ch === '?') {
            re += '[^/]';
        } else if (ch === '{') {
            const end = pattern.indexOf('}', i);
            if (end === -1) { re += escapeLiteral(ch); continue; }
            const options = pattern.slice(i + 1, end).split(',').map(escapeLiteral);
            re += `(?:${options.join('|')})`;
            i = end;
        } else {
            re += escapeLiteral(ch);
        }
    }
    return new RegExp(`^${re}$`);
}

// A pattern beginning with `!` negates: `matchesAny` treats it as "unmatch" rather than "match" (design 5.3/5.8
// mention negation as part of the subset; consumers use it in `ignore` mostly, but it works in `include` too).
export function matchesAny(relPath, patterns) {
    let matched = false;
    for (const raw of patterns) {
        const negate = raw.startsWith('!');
        const pattern = negate ? raw.slice(1) : raw;
        if (globToRegExp(pattern).test(relPath)) matched = !negate;
    }
    return matched;
}

// Walks `root` (or one explicit start path) collecting files. Directories named in `DEFAULT_IGNORE_DIRS` are
// never descended into. Each result is `{ rel, abs }` for a kept file, or `{ rel, abs, skipped: 'unsupported' }`
// when `extensions` is given and the file's extension is not in it (still reported, never silently dropped -
// design 5.7).
export function collectFiles(root, { include = [], ignore = [], extensions = null } = {}) {
    const results = [];
    const includeRe = include.length ? include : null;

    function walk(dir) {
        let entries;
        try {
            entries = fs.readdirSync(dir, { withFileTypes: true });
        } catch {
            return;
        }
        entries.sort((a, b) => a.name.localeCompare(b.name));
        for (const entry of entries) {
            const abs = path.join(dir, entry.name);
            const rel = path.relative(root, abs).split(path.sep).join('/');
            if (entry.isDirectory()) {
                if (DEFAULT_IGNORE_DIRS.includes(entry.name)) continue;
                if (ignore.length && matchesAny(`${rel}/`, ignore)) continue;
                walk(abs);
                continue;
            }
            if (!entry.isFile()) continue;
            if (includeRe && !matchesAny(rel, includeRe)) continue;
            if (ignore.length && matchesAny(rel, ignore)) continue;
            if (extensions && !extensions.some(ext => entry.name.toLowerCase().endsWith(ext))) {
                results.push({ rel, abs, skipped: 'unsupported' });
                continue;
            }
            results.push({ rel, abs });
        }
    }

    const stat = fs.existsSync(root) ? fs.statSync(root) : null;
    if (stat && stat.isFile()) {
        const rel = path.basename(root);
        if (extensions && !extensions.some(ext => root.toLowerCase().endsWith(ext))) return [{ rel, abs: root, skipped: 'unsupported' }];
        return [{ rel, abs: root }];
    }
    walk(root);
    return results;
}
