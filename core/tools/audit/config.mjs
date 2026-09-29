// Loads and validates plainkit.audit.json (design section 5.3). Kept deliberately small for this PR (A-5): the
// `allow`/`rules`/`options` shape is accepted and passed through, but the allow-list ratchet, ratchet
// enforcement and ratchet-specific errors are the strict engine's `checkFiles({ allow })` (already wired) -
// the baseline/ratchet CLI surface itself (`--baseline`, `--update-baseline`) is A-6, and is refused here with
// a clear message rather than silently ignored (issue #629 scope note).
import fs from 'node:fs';
import path from 'node:path';

export const DEFAULT_CONFIG_NAME = 'plainkit.audit.json';

// A config-shaped error: the CLI turns this into exit code 2 with a FIX line naming the file and key.
export class ConfigError extends Error {}

// Searches upward from `startDir` for `plainkit.audit.json`, the way tsconfig/eslintrc discovery works. Returns
// `null` when none is found (an audit run without a config is valid: it just uses the built-in defaults).
export function findConfig(startDir, name = DEFAULT_CONFIG_NAME) {
    let dir = path.resolve(startDir);
    for (;;) {
        const candidate = path.join(dir, name);
        if (fs.existsSync(candidate)) return candidate;
        const parent = path.dirname(dir);
        if (parent === dir) return null;
        dir = parent;
    }
}

function assertArrayOfStrings(value, key) {
    if (value === undefined) return [];
    if (!Array.isArray(value) || !value.every(v => typeof v === 'string')) {
        throw new ConfigError(`"${key}" must be an array of strings`);
    }
    return value;
}

// Validates the shape the design documents (5.3), without yet enforcing the allow-list ratchet itself (the
// engine's `applyAllow` already does that at scan time). Throws `ConfigError` naming the bad key.
export function loadConfig(file) {
    let raw;
    try {
        raw = fs.readFileSync(file, 'utf8');
    } catch (err) {
        throw new ConfigError(`cannot read config file: ${err.message}`);
    }
    let json;
    try {
        json = JSON.parse(raw);
    } catch (err) {
        throw new ConfigError(`"${file}" is not valid JSON: ${err.message}`);
    }
    if (json === null || typeof json !== 'object' || Array.isArray(json)) {
        throw new ConfigError(`"${file}" must be a JSON object`);
    }
    const config = {
        file,
        dir: path.dirname(file),
        include: assertArrayOfStrings(json.include, 'include'),
        ignore: assertArrayOfStrings(json.ignore, 'ignore'),
        strict: json.strict === undefined ? false : Boolean(json.strict),
        options: json.options && typeof json.options === 'object' ? json.options : {},
        rules: json.rules && typeof json.rules === 'object' ? json.rules : {},
        allow: [],
    };
    if (json.allow !== undefined) {
        if (!Array.isArray(json.allow)) throw new ConfigError('"allow" must be an array');
        config.allow = json.allow.map((entry, i) => validateAllowEntry(entry, i));
    }
    return config;
}

function validateAllowEntry(entry, index) {
    const where = `allow[${index}]`;
    if (!entry || typeof entry !== 'object') throw new ConfigError(`${where} must be an object`);
    if (typeof entry.rule !== 'string' || !entry.rule) throw new ConfigError(`${where}.rule is required`);
    if (typeof entry.path !== 'string' || !entry.path) throw new ConfigError(`${where}.path is required`);
    if (typeof entry.reason !== 'string' || entry.reason.length < 20) {
        throw new ConfigError(`${where}.reason is required and must be at least 20 characters`);
    }
    if (!entry.issue && !entry.until) throw new ConfigError(`${where} needs "issue" or "until" (a tracking reference)`);
    const count = entry.count === undefined ? 1 : entry.count;
    if (!Number.isInteger(count) || count < 0) throw new ConfigError(`${where}.count must be a non-negative integer`);
    return { rule: entry.rule, path: entry.path, count, reason: entry.reason, issue: entry.issue, until: entry.until };
}
