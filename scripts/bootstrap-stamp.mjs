// The local bootstrap short-circuit (#713): a hash of everything the bootstrap reads, stamped after a full run, so a repeated local run with no source change
// returns at once. The hash covers every tracked file and every untracked file git does not ignore (paths and bytes, generated paths excluded), the node version and the
// platform; package-lock.json is tracked, so the tool versions it pins are in it. It never short-circuits in CI, outside a git checkout, with --force or PK_BOOTSTRAP_FORCE=1,
// or when a generated sentinel is missing (the caller checks that). core/tests/generated-current.test.mjs stays the backstop for a hand-edited generated file.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { isGenerated } from './generated.mjs';

/** The hex hash of the bootstrap inputs of `root`, or null when it cannot be computed (not a git checkout). */
export function sourceHash(root) {
    const ls = args => spawnSync('git', ['ls-files', '-z', ...args], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28 });
    const tracked = ls([]), others = ls(['--others', '--exclude-standard']);
    if (tracked.status !== 0 || others.status !== 0) return null;
    const files = [...new Set([...tracked.stdout.split('\0'), ...others.stdout.split('\0')])].filter(f => f && !f.startsWith('node_modules/') && !isGenerated(f)).sort();
    const h = crypto.createHash('sha256');
    h.update(`node ${process.version} ${process.platform} ${process.arch}\0`);
    for (const f of files) {
        let bytes;
        try { bytes = fs.readFileSync(path.join(root, f)); } catch (e) { if (e.code === 'ENOENT') continue; throw e; } // a tracked file deleted in the working tree
        h.update(f + '\0'); h.update(crypto.createHash('sha256').update(bytes).digest());
    }
    return h.digest('hex');
}

export const stampFile = root => path.join(root, 'node_modules', '.cache', 'plainkit-bootstrap-stamp');
export const readStamp = root => { try { return fs.readFileSync(stampFile(root), 'utf8').trim(); } catch (e) { if (e.code === 'ENOENT') return null; throw e; } };
export function writeStamp(root, hash) {
    fs.mkdirSync(path.dirname(stampFile(root)), { recursive: true });
    fs.writeFileSync(stampFile(root), hash + '\n');
}
export const clearStamp = root => fs.rmSync(stampFile(root), { force: true });
