// A small, dependency-free secret scanner for the working tree and the whole git history (a gitleaks-style pass without installing anything).
//
//   node scripts/secret-scan.mjs              scan every tracked file
//   node scripts/secret-scan.mjs --history    also scan every line ever added on any branch (git log --all -p)
//
// Exit code 0 when nothing looks like a credential, 1 when something does (each hit prints its rule, place and a masked excerpt: the secret itself is never
// printed). It is a tripwire, not a guarantee: enable GitHub secret scanning and push protection for the real coverage (.github/REPO-SETTINGS.md).
// A line that is a deliberate fixture ends with `secret-scan:allow`.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const RULES = [
    { id: 'private-key', pattern: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY(?: BLOCK)?-----/ },
    { id: 'aws-access-key', pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/ },
    { id: 'github-token', pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/ },
    { id: 'npm-token', pattern: /\bnpm_[A-Za-z0-9]{36}\b/ },
    { id: 'nuget-api-key', pattern: /\boy2[a-z0-9]{43}\b/ },
    { id: 'slack-token', pattern: /\bxox[abposr]-[A-Za-z0-9-]{10,}\b/ },
    { id: 'google-api-key', pattern: /\bAIza[0-9A-Za-z_-]{35}\b/ },
    { id: 'openai-style-key', pattern: /\bsk-[A-Za-z0-9_-]{32,}\b/ },
    { id: 'jwt', pattern: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/ },
    { id: 'connection-string-password', pattern: /\b(?:Password|Pwd)\s*=\s*[^;\s'"{$<][^;\s'"]{5,}/i },
    { id: 'url-with-credentials', pattern: /\b[a-z][a-z0-9+.-]*:\/\/[^\s/:@'"]+:[^\s/@'"$<{]{4,}@[^\s'"]+/i },
    { id: 'credential-assignment', pattern: /\b(?:password|passwd|secret|api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret)\b["']?\s*[:=]\s*["'][^"'\s]{12,}["']/i },
];

// A value that is obviously not a secret: a placeholder, an example, a reference to an environment variable or a secrets store.
const PLACEHOLDER = /(?:example|placeholder|changeme|change-me|your[_-]|xxxx|\*{4}|<[^>]+>|\$\{|\$\(|secrets\.|process\.env|env\.|hunter2|dummy|sample|redacted)/i;

/** The rules a line breaks: [{ rule, excerpt }], with the matched text masked. */
export function scanLine(line) {
    if (line.length > 2000 || line.includes('secret-scan:allow')) return [];
    const hits = [];
    for (const { id, pattern } of RULES) {
        const m = pattern.exec(line);
        if (!m || PLACEHOLDER.test(m[0])) continue;
        hits.push({ rule: id, excerpt: `${m[0].slice(0, 6)}${'*'.repeat(Math.min(12, Math.max(0, m[0].length - 6)))}` });
    }
    return hits;
}

/** Every hit in a block of text: [{ line, rule, excerpt }]. */
export function scanText(text) {
    return text.split(/\r?\n/).flatMap((l, i) => scanLine(l).map(h => ({ line: i + 1, ...h })));
}

const BINARY = /\.(png|jpe?g|gif|webp|ico|woff2?|ttf|zip|nupkg|snk|pdf)$/i;
const git = (args, opts = {}) => spawnSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28, ...opts });

export function scanTree() {
    const hits = [];
    for (const file of git(['ls-files', '-z']).stdout.split('\0').filter(Boolean)) {
        if (BINARY.test(file) || !fs.existsSync(path.join(root, file))) continue;
        for (const h of scanText(fs.readFileSync(path.join(root, file), 'utf8'))) hits.push({ where: `${file}:${h.line}`, ...h });
    }
    return hits;
}

export function scanHistory() {
    return new Promise(resolve => {
        const proc = spawn('git', ['log', '--all', '-p', '--no-color', '--no-ext-diff', '--format=commit %H'], { cwd: root });
        const hits = []; let commit = '', file = '';
        readline.createInterface({ input: proc.stdout, crlfDelay: Infinity }).on('line', line => {
            if (line.startsWith('commit ')) { commit = line.slice(7, 14); return; }
            if (line.startsWith('+++ ')) { file = line.slice(6); return; }
            if (!line.startsWith('+') || BINARY.test(file)) return;
            for (const h of scanLine(line.slice(1))) hits.push({ where: `${commit} ${file}`, ...h });
        }).on('close', () => resolve(hits));
    });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const hits = scanTree();
    if (process.argv.includes('--history')) hits.push(...await scanHistory());
    for (const h of hits) console.log(`${h.rule}  ${h.where}${h.line ? '' : ''}  ${h.excerpt}`);
    console.log(hits.length ? `${hits.length} possible secret(s): rotate anything real, then remove it from the tree (and the history if it is real)` : `no secrets found${process.argv.includes('--history') ? ' in the tree or the history' : ' in the tree'}`);
    process.exit(hits.length ? 1 : 0);
}
