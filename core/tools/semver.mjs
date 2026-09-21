// SemVer 2.0 helpers shared by the versioning tool and the element API validator (no imports, so neither has to load the other).

export const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

// { major, minor, patch, pre: [identifiers] } or null when the text is not a SemVer 2.0 version.
export function parseVersion(text) {
    const m = SEMVER.exec(String(text ?? '').trim());
    return m ? { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]), pre: m[4] ? m[4].split('.') : [] } : null;
}

export const isPrerelease = v => (parseVersion(v)?.pre.length ?? 0) > 0;

// SemVer precedence: -1, 0 or 1. A pre-release sorts before its release; identifiers compare numerically when both are numbers, else as text,
// and a shorter list sorts first when the rest is equal.
export function compareVersions(a, b) {
    const x = parseVersion(a), y = parseVersion(b);
    if (!x || !y) throw new Error(`not a version: ${!x ? a : b}`);
    for (const k of ['major', 'minor', 'patch']) if (x[k] !== y[k]) return x[k] < y[k] ? -1 : 1;
    if (!x.pre.length && !y.pre.length) return 0;
    if (!x.pre.length) return 1;
    if (!y.pre.length) return -1;
    for (let i = 0; i < Math.max(x.pre.length, y.pre.length); i++) {
        const p = x.pre[i], q = y.pre[i];
        if (p === undefined) return -1;
        if (q === undefined) return 1;
        if (p === q) continue;
        const pn = /^\d+$/.test(p), qn = /^\d+$/.test(q);
        if (pn && qn) return Number(p) < Number(q) ? -1 : 1;
        if (pn !== qn) return pn ? -1 : 1;
        return p < q ? -1 : 1;
    }
    return 0;
}

// How far `to` is from `from`: 'major', 'minor', 'patch', 'prerelease' (same numbers, a later pre-release or the release of one), 'none' (equal)
// or 'downgrade'.
export function changeLevel(from, to) {
    const c = compareVersions(from, to);
    if (c === 0) return 'none';
    if (c > 0) return 'downgrade';
    const x = parseVersion(from), y = parseVersion(to);
    if (x.major !== y.major) return 'major';
    if (x.minor !== y.minor) return 'minor';
    if (x.patch !== y.patch) return 'patch';
    return 'prerelease';
}
