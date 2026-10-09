// Put a screenshot on the orphan branch `issue-images` and print the markdown that embeds it in an issue (GitHub has no API for issue attachments).
//
//   node scripts/issue-image.mjs <issue> <file.png> [--name found|expected|...] [--comment]
//
// The image lands at issue-<n>/<name>.<ext> on `issue-images` (only screenshots live there; it is never merged into main). The work happens in a
// temporary worktree, so the caller's checkout is untouched. A non-fast-forward push is fetched, rebased and retried once; never forced.
// `--comment` also posts the markdown to the issue with `gh issue comment`. The pure pieces are tested in scripts/tests/issue-image.test.mjs.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const BRANCH = 'issue-images';
export const REPO = 'skulmunkie/plainkit';
export const MAX_BYTES = 2 * 1024 * 1024;
export const EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];

/** Thrown for anything the caller can fix; `fix` is printed as the FIX line. */
export class UsageError extends Error {
    constructor(message, fix) { super(message); this.fix = fix; }
}

/** A name safe for a path and a URL: lowercase letters, digits, dot, dash, underscore. */
export const safeName = s => String(s).toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^[-.]+|[-.]+$/g, '');

export function parseArgs(argv) {
    const out = { issue: null, file: null, name: null, comment: false };
    const pos = [];
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--comment') out.comment = true;
        else if (a === '--name') { out.name = argv[++i]; if (!out.name) throw new UsageError('--name needs a value', 'pass --name found (or expected, after, ...)'); }
        else if (a.startsWith('--')) throw new UsageError(`unknown option ${a}`, 'usage: node scripts/issue-image.mjs <issue> <file.png> [--name found|expected] [--comment]');
        else pos.push(a);
    }
    if (pos.length !== 2) throw new UsageError('expected an issue number and an image file', 'usage: node scripts/issue-image.mjs <issue> <file.png> [--name found|expected] [--comment]');
    if (!/^\d+$/.test(pos[0])) throw new UsageError(`"${pos[0]}" is not an issue number`, 'give the issue number, for example 52');
    out.issue = Number(pos[0]);
    out.file = pos[1];
    return out;
}

/** Validate a file by extension and size; returns the lowercase extension. */
export function validateImage(file, size) {
    const ext = path.extname(file).toLowerCase();
    if (!EXTENSIONS.includes(ext)) throw new UsageError(`${file} is not an image type we upload (${ext || 'no extension'})`, `use one of ${EXTENSIONS.join(' ')}`);
    if (size > MAX_BYTES) throw new UsageError(`${file} is ${(size / 1048576).toFixed(1)} MB, over the 2 MB limit`, 'crop the screenshot or save it as a smaller png/webp');
    if (size === 0) throw new UsageError(`${file} is empty`, 'take the screenshot again');
    return ext;
}

/** The path inside the branch: issue-<n>/<name>.<ext>. The name defaults to the file's own name. */
export function targetPath(issue, file, name) {
    const ext = path.extname(file).toLowerCase();
    const base = safeName(name ?? path.basename(file, path.extname(file)));
    if (!base) throw new UsageError('the image name is empty after cleaning', 'pass --name with letters or digits');
    return `issue-${issue}/${base}${ext === '.jpeg' ? '.jpg' : ext}`;
}

export const rawUrl = rel => `https://raw.githubusercontent.com/${REPO}/${BRANCH}/${rel}`;
export const markdown = rel => `![${path.basename(rel, path.extname(rel))}](${rawUrl(rel)})`;

const git = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

function publish(file, rel) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'issue-images-'));
    const wt = path.join(tmp, 'wt');
    try {
        git(['fetch', 'origin', BRANCH]);
        git(['worktree', 'add', '--detach', wt, `origin/${BRANCH}`]);
        fs.mkdirSync(path.dirname(path.join(wt, rel)), { recursive: true });
        fs.copyFileSync(file, path.join(wt, rel));
        git(['add', '--', rel], wt);
        if (!git(['status', '--porcelain', '--', rel], wt).trim()) return;
        git(['commit', '-m', `Add ${rel}`, '-m', 'Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>'], wt);
        try {
            git(['push', 'origin', `HEAD:refs/heads/${BRANCH}`], wt);
        } catch (first) {
            console.warn(`push was rejected (${String(first.stderr || first.message).split('\n')[0]}); fetching, rebasing and retrying once`);
            git(['fetch', 'origin', BRANCH], wt);
            git(['rebase', `origin/${BRANCH}`], wt);
            git(['push', 'origin', `HEAD:refs/heads/${BRANCH}`], wt);
        }
    } finally {
        try { git(['worktree', 'remove', '--force', wt]); } catch (e) { console.warn(`could not remove the temporary worktree ${wt}: ${e.message}`); }
        fs.rmSync(tmp, { recursive: true, force: true });
    }
}

function main() {
    const args = parseArgs(process.argv.slice(2));
    if (!fs.existsSync(args.file)) throw new UsageError(`${args.file} does not exist`, 'check the path of the screenshot');
    validateImage(args.file, fs.statSync(args.file).size);
    const rel = targetPath(args.issue, args.file, args.name);
    publish(args.file, rel);
    const md = markdown(rel);
    if (args.comment) execFileSync('gh', ['issue', 'comment', String(args.issue), '--repo', REPO, '--body', md], { stdio: ['ignore', 'inherit', 'inherit'] });
    console.log(md);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try { main(); } catch (e) {
        console.error(`issue-image: ${e.message}`);
        if (e.fix) console.error(`FIX: ${e.fix}`);
        else {
            if (e.stderr) console.error(String(e.stderr).trim());
            console.error('FIX: check that git and gh work and that you can push to origin (gh auth status); nothing was forced, run the command again.');
        }
        process.exit(1);
    }
}
