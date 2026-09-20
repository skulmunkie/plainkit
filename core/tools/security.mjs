// SDK security and defect scanner: node core/tools/security.mjs [--write]   (dependency-free)
// Scans the SDK's own source (not dist/, not the generated snapshot) and returns findings { severity, rule, file, line, message }.
// Severity: critical, high, medium, low. `--write` refreshes site/scorecard/security-report.json and security.baseline.json (the ratchet:
// counts per severity may only go down). Rules that need a decision list their allowed uses in tools/security.allow.json.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKIP_DIRS = new Set(['dist', 'node_modules']);
const SKIP_FILES = new Set(['snapshot.json', 'security-report.json', 'report.json', 'sweep-report.json']);

export function walk(dir = root) {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? (SKIP_DIRS.has(e.name) ? [] : walk(path.join(dir, e.name))) : [path.join(dir, e.name)]));
}

const rel = f => path.relative(root, f).split(path.sep).join('/');
const isTest = f => /\.test\.mjs$|(^|\/)tests\//.test(f);

// Each rule: { id, severity, files: regex, pattern: regex, message, skipTests? }
export const RULES = [
    { id: 'no-eval', severity: 'critical', files: /\.(js|mjs|html)$/, pattern: /\beval\s*\(/, message: 'eval() runs arbitrary code', skipTests: true },
    { id: 'no-new-function', severity: 'critical', files: /\.(js|mjs|html)$/, pattern: /\bnew\s+Function\s*\(/, message: 'new Function() runs arbitrary code' },
    { id: 'no-document-write', severity: 'high', files: /\.(js|mjs|html)$/, pattern: /\bdocument\.write(ln)?\s*\(/, message: 'document.write injects unparsed markup' },
    { id: 'no-javascript-url', severity: 'high', files: /\.(js|mjs|html)$/, pattern: /['"`(]\s*javascript:/i, message: 'javascript: URL' },
    { id: 'no-inline-handler', severity: 'high', files: /\.html$/, pattern: /\s(onclick|onload|onerror|oninput|onchange|onsubmit|onmouseover|onfocus)\s*=/i, message: 'inline event handler attribute (blocked by a strict CSP)' },
    { id: 'no-inline-style-attr', severity: 'high', files: /\.html$/, pattern: /\sstyle\s*=\s*["']/, message: 'inline style attribute (blocked by a strict style-src): use a token, a utility or component class, or set the value through the CSSOM', skipTests: true },
    { id: 'no-inline-style-attr-js', severity: 'high', files: /\.(js|mjs|json)$/, pattern: /\sstyle=\\?["'`]|setAttribute\(\s*['"]style['"]|createElement\(\s*['"]style['"]/, message: 'markup built with an inline style attribute or a style element: use the CSSOM (el.style.setProperty) or data-dyn (js/dynamic.js)', skipTests: true },
    { id: 'blank-needs-noopener', severity: 'medium', files: /\.(js|mjs|html)$/, pattern: /target=(\\?["'])_blank\1(?![^>]*noopener)/, message: 'target=_blank without rel=noopener' },
    { id: 'secret-private-key', severity: 'critical', files: /.*/, pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/, message: 'private key material' },
    { id: 'secret-token', severity: 'critical', files: /.*/, pattern: /\b(AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{30,}|sk-[A-Za-z0-9]{32,}|xox[baprs]-[A-Za-z0-9-]{10,})\b/, message: 'looks like an API key or token' },
    { id: 'secret-assignment', severity: 'high', files: /\.(js|mjs|json|html)$/, pattern: /\b(password|passwd|secret|api[_-]?key|access[_-]?token)\b["']?\s*[:=]\s*["'][^"'\s]{8,}["']/i, message: 'credential-like literal', skipTests: true },
    { id: 'secret-email', severity: 'low', files: /\.(js|mjs|json|html|md|css)$/, pattern: /\b[A-Za-z0-9._%+-]+@(?!example\.(com|org)|localhost)[A-Za-z0-9.-]+\.[a-z]{2,}\b/, message: 'email address in the repository' },
    { id: 'no-external-request', severity: 'high', files: /\.(js|mjs|html|css)$/, pattern: /(?:src|href|url\(|import\s*\(|from\s+|fetch\s*\()\s*=?\s*["'(]?\s*https?:\/\/(?!localhost|www\.w3\.org)/, message: 'third-party or CDN request at runtime', skipTests: true },
];

// innerHTML-style sinks: allowed per file up to the count in security.allow.json, each documented there with its source of markup.
const SINK = /\b(innerHTML|outerHTML|insertAdjacentHTML)\b/g;

function lines(text) { return text.split('\n'); }

// A let/var is fine when the file assigns to it on another line: name = ..., name += ..., name++, ++name.
export function isReassigned(ls, name, declLine) {
    const re = new RegExp(`(?:\\b${name}\\s*(?:[-+*/%&|^]|\\*\\*|<<|>>>?|&&|\\|\\||\\?\\?)?=(?!=)|\\b${name}\\s*(?:\\+\\+|--)|(?:\\+\\+|--)${name}\\b)`);
    return ls.some((l, i) => i !== declLine && re.test(l));
}

export function scan(opts = {}) {
    const findings = [];
    const files = walk().filter(f => !SKIP_FILES.has(path.basename(f)) && /\.(js|mjs|html|css|json|md)$/.test(f));
    const allow = JSON.parse(fs.readFileSync(path.join(root, 'tools', 'security.allow.json'), 'utf8'));
    for (const f of files) {
        const r = rel(f); const text = fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n'); const ls = lines(text);
        for (const rule of RULES) {
            if (!rule.files.test(r) || (rule.skipTests && isTest(r)) || r.startsWith('tools/security.') || r === 'tests/security.test.mjs') continue;
            ls.forEach((l, i) => { if (rule.pattern.test(l)) findings.push({ severity: rule.severity, rule: rule.id, file: r, line: i + 1, message: rule.message }); });
        }
        if (/\.(js|mjs)$/.test(r) && !isTest(r) && !r.startsWith('tools/security.')) {
            const hits = []; ls.forEach((l, i) => { for (const m of l.matchAll(SINK)) hits.push(i + 1); });
            const allowed = allow.htmlSinks[r]?.count ?? 0;
            if (hits.length > allowed) hits.slice(allowed).forEach(line => findings.push({ severity: 'medium', rule: 'html-sink-not-allow-listed', file: r, line, message: `innerHTML-style sink ${hits.length} > allowed ${allowed}; document its source in tools/security.allow.json or use textContent/DOM APIs` }));
            ls.forEach((l, i) => { if (/\bcreateElement\(\s*['"]script['"]\s*\)|\.src\s*=\s*['"`]?http/.test(l) && !allow.dynamicScript.includes(r)) findings.push({ severity: 'high', rule: 'dynamic-script-injection', file: r, line: i + 1, message: 'creates a script element dynamically' }); });
        }
        if (/\.html$/.test(r) && !r.startsWith('components/') && !r.startsWith('dist/')) {
            const inline = [...text.matchAll(/<script(?![^>]*\ssrc=)[^>]*>/g)];
            for (const m of inline) findings.push({ severity: 'low', rule: 'csp-inline-script', file: r, line: text.slice(0, m.index).split('\n').length, message: 'inline script: needs script-src \'unsafe-inline\' or a nonce; move it to a .js file for a strict CSP' });
            for (const m of text.matchAll(/<style[\s>]/g)) findings.push({ severity: 'high', rule: 'csp-inline-style', file: r, line: text.slice(0, m.index).split('\n').length, message: 'inline <style> block' });
        }
        if (/\.html$/.test(r) && !r.startsWith('dist/')) {
            const ids = [...text.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]); const seen = new Set();
            for (const id of ids) { if (seen.has(id)) findings.push({ severity: 'medium', rule: 'duplicate-id', file: r, line: 1, message: `duplicate id "${id}"` }); seen.add(id); }
            for (const m of text.matchAll(/aria-(?:labelledby|controls|describedby)="([^"]+)"/g)) for (const ref of m[1].split(/\s+/)) if (!seen.has(ref) && !/\$\{/.test(ref)) findings.push({ severity: 'low', rule: 'aria-reference-unresolved', file: r, line: text.slice(0, m.index).split('\n').length, message: `aria reference "${ref}" has no matching id in this file` });
        }
        if (/\.css$/.test(r) && !r.startsWith('dist/')) {
            const important = (text.match(/!important/g) ?? []).length;
            if (important) findings.push({ severity: 'low', rule: 'css-important', file: r, line: 1, message: `${important} !important`, count: important });
        }
        if (/\.(js|mjs)$/.test(r) && !isTest(r) && !r.startsWith('tools/')) {
            if (/\bstorage\.setItem|localStorage\.setItem/.test(text) && !/try\s*\{[^}]*(localStorage|storage)\./.test(text) && !/=> \{ try \{/.test(text)) findings.push({ severity: 'low', rule: 'storage-unguarded', file: r, line: 1, message: 'localStorage write with no try/catch nearby' });
            ls.forEach((l, i) => { if (/addEventListener\(\s*['"]message['"]/.test(l) && !/\.origin/.test(text)) findings.push({ severity: 'high', rule: 'postmessage-origin', file: r, line: i + 1, message: 'message listener without an origin check' }); });
            ls.forEach((l, i) => { const d = /^\s*(let|var)\s+(\w+)/.exec(l); if (d && !allow.legacyVar.includes(r) && !isReassigned(ls, d[2], i)) findings.push({ severity: 'low', rule: 'prefer-const', file: r, line: i + 1, message: 'let/var that is never reassigned: use const' }); });
        }
    }
    // supply chain: zero runtime dependencies
    for (const f of ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml']) if (fs.existsSync(path.join(root, f))) findings.push({ severity: 'high', rule: 'dependency-present', file: f, line: 1, message: 'the SDK must have zero runtime dependencies; audit any dev dependency (npm audit) before adding one' });
    // a package.json is allowed for publishing, but declares no dependencies
    if (fs.existsSync(path.join(root, 'package.json'))) { const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')); for (const k of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) if (pkg[k]) findings.push({ severity: 'high', rule: 'dependency-present', file: 'package.json', line: 1, message: `package.json declares ${k}` }); }
    return findings;
}

const ORDER = { critical: 0, high: 1, medium: 2, low: 3 };
export const bySeverity = f => f.reduce((o, x) => ({ ...o, [x.severity]: (o[x.severity] ?? 0) + 1 }), { critical: 0, high: 0, medium: 0, low: 0 });
export const worstFirst = f => [...f].sort((a, b) => ORDER[a.severity] - ORDER[b.severity] || a.file.localeCompare(b.file) || a.line - b.line);

export { unsafeRegex } from '../js/code-explorer/providers.js';

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const findings = worstFirst(scan());
    const counts = bySeverity(findings);
    console.log(counts);
    for (const f of findings.filter(x => x.severity === 'critical' || x.severity === 'high')) console.log(`${f.severity} ${f.rule} ${f.file}:${f.line} ${f.message}`);
    if (process.argv.includes('--write')) {
        fs.writeFileSync(path.join(root, 'site', 'scorecard', 'security-report.json'), JSON.stringify({ generated: 'see baseline', counts, findings }, null, 2) + '\n');
        fs.writeFileSync(path.join(root, 'site', 'scorecard', 'security.baseline.json'), JSON.stringify({ note: 'Counts per severity may only go down. Refresh with node tools/security.mjs --write after a fix.', counts }, null, 2) + '\n');
    }
}
