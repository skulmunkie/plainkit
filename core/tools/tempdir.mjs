// Temporary folders that always go away (#1507). Every dev-tool and test folder in the OS temp dir comes from makeTempDir(): it is
// registered, removed by the caller's own removeTree() or, at the latest, when the process exits (success, failure or a thrown error).
// Removal survives Windows: read-only attributes are cleared, EBUSY/EPERM/ENOTEMPTY (a browser child still closing its profile) are
// retried with a growing wait, and a junction or symlink at the root or inside is unlinked, never followed.
// PK_TMPDIR overrides the parent folder (the tests use it to prove nothing is left behind).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const tempRoot = () => process.env.PK_TMPDIR || os.tmpdir();
const live = new Set();
const sleepSync = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const sleep = ms => new Promise(r => setTimeout(r, ms));

function makeWritable(p) {
    let st;
    try { st = fs.lstatSync(p); } catch (e) { if (e.code === 'ENOENT') return; throw e; }
    if (st.isSymbolicLink()) return;
    try { fs.chmodSync(p, st.isDirectory() ? 0o777 : 0o666); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    if (st.isDirectory()) for (const n of fs.readdirSync(p)) makeWritable(path.join(p, n));
}

// One removal attempt. Returns true when the folder is gone.
function attempt(dir) {
    try {
        const st = fs.lstatSync(dir, { throwIfNoEntry: false });
        if (!st) return true;
        if (st.isSymbolicLink()) { fs.unlinkSync(dir); return true; }
        // a junction inside (a copied checkout's node_modules) is unlinked, never followed
        for (const n of fs.readdirSync(dir)) {
            const p = path.join(dir, n);
            if (fs.lstatSync(p, { throwIfNoEntry: false })?.isSymbolicLink()) fs.rmSync(p, { force: true });
        }
        fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
        return !fs.existsSync(dir);
    } catch {
        try { makeWritable(dir); } catch { /* the caller retries; the final false is the report */ }
        return false;
    }
}

export function removeTree(dir, { attempts = 12 } = {}) {
    if (!dir) return true;
    for (let i = 0; i < attempts; i++) {
        if (attempt(dir)) { live.delete(dir); return true; }
        sleepSync(Math.min(2000, 100 * 2 ** Math.min(i, 5)));
    }
    return false;
}

// Same, without blocking the event loop (a browser being shut down by the same process). `kill` runs once, before the third try.
export async function removeTreeAsync(dir, { attempts = 20, kill } = {}) {
    if (!dir) return true;
    for (let i = 0; i < attempts; i++) {
        if (attempt(dir)) { live.delete(dir); return true; }
        if (i === 1) kill?.();
        await sleep(Math.min(1000, 100 * 2 ** Math.min(i, 4)));
    }
    return false;
}

let hooked = false;
export function makeTempDir(prefix) {
    const dir = fs.mkdtempSync(path.join(tempRoot(), prefix));
    live.add(dir);
    if (!hooked) { hooked = true; process.on('exit', () => { for (const d of [...live]) removeTree(d, { attempts: 6 }); }); }
    return dir;
}

export const liveTempDirs = () => [...live];
