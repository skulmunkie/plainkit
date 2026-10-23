// Hang protections for scripts/blazor-browser.mjs (#1764): a per-case timeout, a whole-run watchdog that kills only the process trees the run recorded,
// and a bounded stop of a child (graceful, then a tree kill). Pure of any browser; the unit tests drive it with fake children and timers.
import { spawnSync } from 'node:child_process';

export const CASE_TIMEOUT_MS = 180000;

/** Resolves like `promise`, or rejects naming `label` when it has not settled within `ms`. A hung CDP call has no timeout of its own. */
export function withTimeout(promise, ms, label) {
    let t;
    const timer = new Promise((_, rej) => { t = setTimeout(() => rej(new Error(`${label} did not finish within ${ms / 1000} s (a hung browser or host call); stopped.`)), ms); });
    return Promise.race([promise, timer]).finally(() => clearTimeout(t));
}

export const runWatchdogMs = env => { const n = Number(env.PK_BB_TIMEOUT_MS); return Number.isInteger(n) && n > 0 ? n : 25 * 60 * 1000; };

/** Kills the process tree of one pid. */
export function killPidTree(pid) {
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore', timeout: 15000 });
    else { try { process.kill(-pid, 'SIGKILL'); } catch { try { process.kill(pid, 'SIGKILL'); } catch { /* already gone */ } } }
}

/** The whole-run watchdog. `record(pid)` notes a child this run started; on expiry only those are killed. */
export function createRunGuard({ ms, log = console.error, killPid = killPidTree, exit = process.exit, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
    const pids = new Set();
    let phase = 'starting', last = '(none yet)';
    const timer = setTimer(() => {
        log(`WATCHDOG: the blazor browser run did not finish within ${ms / 1000} s; last case: ${last}; phase: ${phase}. Killing the host and browser it started (pids ${[...pids].join(', ') || 'none'}).`);
        for (const p of pids) { try { killPid(p); } catch (e) { log(`WATCHDOG: could not kill ${p}: ${e.message}`); } }
        exit(3);
    }, ms);
    timer?.unref?.();
    return {
        record: pid => { if (pid) pids.add(pid); },
        forget: pid => pids.delete(pid),
        pids: () => [...pids],
        phase: p => { phase = p; },
        caseName: n => { last = n; },
        disarm: () => clearTimer(timer),
    };
}

/** Stops a child: asks it to exit, waits `graceMs`, then kills its tree and waits `waitAfterKillMs`. Resolves 'none' | 'graceful' | 'killed' | 'unconfirmed'; never hangs. */
export async function stopChild(child, { graceMs = 5000, waitAfterKillMs = 5000, killTree = c => killPidTree(c.pid) } = {}) {
    if (!child || child.exitCode !== null) return 'none';
    const exited = ms => new Promise(res => {
        if (child.exitCode !== null) return res(true);
        const t = setTimeout(() => { child.off('exit', on); res(false); }, ms);
        const on = () => { clearTimeout(t); res(true); };
        child.once('exit', on);
    });
    child.kill();
    if (await exited(graceMs)) return 'graceful';
    killTree(child);
    return (await exited(waitAfterKillMs)) ? 'killed' : 'unconfirmed';
}
