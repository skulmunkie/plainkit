// Safety nets for scripts/verify.mjs (#1754): a watchdog for a run that stops making progress, a lock so two runs do not share one checkout, and the
// stamps that say which tree a browser, UI-review or Blazor-browser run was made on (checked by scripts/gate-check.mjs).
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/** Stops a process and everything it started (on Windows `node --test` children survive a plain kill). Never throws. */
export function killTree(pid) {
    try {
        if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true });
        else process.kill(pid, 'SIGKILL');
    } catch (e) { process.stderr.write(`killTree ${pid}: ${e.message}\n`); }
}

/** From the progress lines of scripts/test-progress-reporter.mjs ("start|end<TAB>file<TAB>name"): the files with a test that started and has not finished. */
export function runningFiles(progress) {
    const open = new Map();
    for (const line of String(progress).split('\n')) {
        const [kind, file, name] = line.split('\t');
        if (!file || !name) continue;
        const key = `${file}\t${name}`;
        if (kind === 'start') open.set(key, file); else if (kind === 'end') open.delete(key);
    }
    return [...new Set(open.values())].sort();
}

/** The message appended to a run the watchdog ended. */
export function stallMessage({ reason, seconds, files }) {
    const where = files.length ? `files with a test still running: ${files.join(', ')}` : 'no test was running that the reporter could name (the runner itself, or a file that never started)';
    return `\nverify: WATCHDOG ended this run: ${reason} (${seconds} s). ${where}\n`;
}

const hash12 = s => crypto.createHash('sha1').update(path.resolve(s)).digest('hex').slice(0, 12);
export const lockPath = root => path.join(os.tmpdir(), `pk-verify-${hash12(root)}.lock`);
export const pidAlive = pid => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };

/**
 * Takes the per-checkout lock. Returns { ok: true, release } or { ok: false, holder, message }. A lock whose process is gone (or unreadable) is stale and replaced.
 * `waitMs` > 0 polls until the holder finishes.
 */
export async function acquireLock(root, { file = lockPath(root), pid = process.pid, alive = pidAlive, waitMs = 0, pollMs = 1000, sleep = ms => new Promise(r => setTimeout(r, ms)) } = {}) {
    const deadline = Date.now() + waitMs;
    for (;;) {
        try {
            fs.writeFileSync(file, JSON.stringify({ pid, started: new Date().toISOString(), root: path.resolve(root) }), { flag: 'wx' });
            return { ok: true, release: () => { try { if (JSON.parse(fs.readFileSync(file, 'utf8')).pid === pid) fs.rmSync(file, { force: true }); } catch (e) { if (e.code !== 'ENOENT') process.stderr.write(`lock release: ${e.message}\n`); } } };
        } catch (e) { if (e.code !== 'EEXIST') throw e; }
        let holder = null;
        try { holder = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { if (e.code !== 'ENOENT' && !(e instanceof SyntaxError)) throw e; }
        if (!holder || !Number.isInteger(holder.pid) || !alive(holder.pid)) { fs.rmSync(file, { force: true }); continue; }
        if (Date.now() >= deadline) return { ok: false, holder, message: `another verify run holds this checkout (pid ${holder.pid}, started ${holder.started}). Two runs at once thrash memory and stall (#1754): wait for it, or set PK_VERIFY_LOCK_WAIT=<seconds> to queue behind it.` };
        await sleep(pollMs);
    }
}

// ---------- stamps ----------

const git = (root, args) => spawnSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28 });

/** An id for the tree under `root`: the HEAD tree hash, plus a hash of the uncommitted tracked changes when there are any. null outside a git checkout. */
export function treeId(root) {
    const t = git(root, ['rev-parse', 'HEAD^{tree}']);
    if (t.status !== 0) return null;
    const tree = t.stdout.trim();
    const d = git(root, ['diff', 'HEAD']);
    if (d.status !== 0 || !d.stdout) return tree;
    return `${tree}+dirty-${crypto.createHash('sha1').update(d.stdout).digest('hex').slice(0, 12)}`;
}

export const STAMP_KINDS = ['browser', 'ui-review', 'blazor-browser'];
export const stampDir = root => path.join(os.tmpdir(), `pk-run-stamps-${hash12(root)}`);

/** Records that a `kind` run finished on the current tree. Never throws (a stamp is evidence, not a gate on the run). Returns the stamp. */
export function writeRunStamp(root, kind, ok, { dir = stampDir(root), id = treeId(root) } = {}) {
    const stamp = { kind, tree: id, ok: Boolean(ok), at: new Date().toISOString() };
    try { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, `${kind}.json`), JSON.stringify(stamp, null, 2)); } catch (e) { process.stderr.write(`run stamp not written: ${e.message}\n`); }
    return stamp;
}

/** Compares the stamps of `kinds` with `current`. Returns { ok, lines } (a kind is fine when stamped on this tree and that run passed). */
export function checkStamps(kinds, current, { dir, read = k => { try { return JSON.parse(fs.readFileSync(path.join(dir, `${k}.json`), 'utf8')); } catch (e) { if (e.code === 'ENOENT' || e instanceof SyntaxError) return null; throw e; } } } = {}) {
    const lines = []; let ok = true;
    for (const k of kinds) {
        const s = read(k);
        if (!s) { ok = false; lines.push(`MISSING ${k}: no run recorded here`); }
        else if (s.tree !== current) { ok = false; lines.push(`STALE   ${k}: made on ${s.tree} at ${s.at}, the tree is ${current}`); }
        else if (!s.ok) { ok = false; lines.push(`FAILED  ${k}: the run on this tree (${s.at}) did not pass`); }
        else lines.push(`ok      ${k}: passed on this tree (${s.at})`);
    }
    return { ok, lines };
}
