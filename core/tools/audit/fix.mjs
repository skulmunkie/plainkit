// The opt-in `--fix` candidates of the audit CLI (design 5.4, issue #1519). Three deterministic edits, each
// previewed with `--dry-run`, none run unless named:
//   D1-simple  <hr> -> <pk-divider>, empty <progress value max> -> <pk-progress value max> (no other attributes)
//   A1-label   <pk-button icon title="x"></pk-button> -> adds label="x" (the title is kept, so the edit reverses)
//   allow      `--update-allow`: drop a dead allow entry, lower a stale `count` in plainkit.audit.json
// Pure functions; no I/O. A line carrying or following a `plainkit-audit-ignore` comment is never rewritten.
export const FIX_IDS = ['D1-simple', 'A1-label'];
export const FIXABLE_EXTENSIONS = ['.html', '.htm', '.razor', '.cshtml'];

const STATIC_NUMBER = '(?:"[0-9.]+"|\'[0-9.]+\')';
const PROGRESS = new RegExp(`<progress((?:\\s+(?:value|max)\\s*=\\s*${STATIC_NUMBER})*)\\s*>\\s*</progress>`, 'gi');
const HR = /<hr\s*\/?>/gi;
const BUTTON = /<pk-button\b([^<>]*)>(\s*)<\/pk-button>/gi;

function isIgnored(text, offset) {
    const before = text.slice(0, offset);   // inside an ignore block
    if (before.lastIndexOf('plainkit-audit-ignore-start') > before.lastIndexOf('plainkit-audit-ignore-end')) return true;
    const lineStart = text.lastIndexOf('\n', offset - 1) + 1;
    const prevStart = text.lastIndexOf('\n', lineStart - 2) + 1;
    const lineEnd = text.indexOf('\n', offset);
    return text.slice(prevStart, lineEnd < 0 ? text.length : lineEnd).includes('plainkit-audit-ignore');
}

function rewrite(text, regex, build) {
    let count = 0;
    const out = text.replace(regex, (...args) => {
        const offset = args.find(a => typeof a === 'number');
        const replacement = isIgnored(text, offset) ? null : build(args);
        if (replacement === null) return args[0];
        count++;
        return replacement;
    });
    return { text: out, count };
}

export function fixD1Simple(text) {
    const hr = rewrite(text, HR, () => '<pk-divider></pk-divider>');
    const progress = rewrite(hr.text, PROGRESS, ([, attrs]) => `<pk-progress${attrs}></pk-progress>`);
    return { text: progress.text, count: hr.count + progress.count };
}

export function fixA1Label(text) {
    return rewrite(text, BUTTON, ([whole, attrs]) => {
        const padded = ` ${attrs} `;
        if (!/\sicon(?=[\s=\/])/.test(padded)) return null;
        if (/\s(?:label|aria-label)\s*=/.test(padded)) return null;
        const title = /\stitle\s*=\s*(?:"([^"@{}]+)"|'([^'@{}]+)')/.exec(padded);
        const value = title && (title[1] ?? title[2]).trim();
        if (!value) return null;
        const quote = title[1] !== undefined ? '"' : "'";
        return whole.replace(/^<pk-button/i, `<pk-button label=${quote}${value}${quote}`);
    });
}

const FIXERS = { 'D1-simple': fixD1Simple, 'A1-label': fixA1Label };

// Applies the named fixes to one file's text. Returns the new text and the count per fix id.
export function applyFixes(text, ids) {
    const counts = {};
    let current = text;
    for (const id of ids) {
        const result = FIXERS[id](current);
        current = result.text;
        counts[id] = result.count;
    }
    return { text: current, counts };
}

// Drops dead allow entries and lowers stale counts in a plainkit.audit.json text, from the engine's allowReport
// rows ({ rule, path, status, actual }). Keeps the file's indent and line ending; touches nothing else.
export function updateAllowText(configText, report) {
    const json = JSON.parse(configText);
    const eol = configText.includes('\r\n') ? '\r\n' : '\n';
    const indent = /^([ \t]+)"/m.exec(configText)?.[1] ?? '  ';
    let removed = 0;
    let lowered = 0;
    json.allow = (json.allow || []).filter(entry => {
        const row = report.find(r => r.rule === entry.rule && r.path === entry.path);
        if (!row || row.status === 'ok') return true;
        if (row.status === 'dead') { removed++; return false; }
        entry.count = row.actual;
        lowered++;
        return true;
    });
    const text = JSON.stringify(json, null, indent).replace(/\n/g, eol) + eol;
    return { text, removed, lowered };
}

// A minimal line diff for --dry-run: the changed middle of the two texts, with a few lines of context.
export function formatDiff(file, before, after) {
    const a = before.split('\n');
    const b = after.split('\n');
    let head = 0;
    while (head < a.length && head < b.length && a[head] === b[head]) head++;
    let tail = 0;
    while (tail < a.length - head && tail < b.length - head && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail++;
    const ctx = 2;
    const from = Math.max(0, head - ctx);
    const line = s => s.replace(/\r$/, '');
    const out = [`--- ${file}`, `+++ ${file}`, `@@ line ${from + 1} @@`];
    for (let i = from; i < head; i++) out.push(` ${line(a[i])}`);
    for (let i = head; i < a.length - tail; i++) out.push(`-${line(a[i])}`);
    for (let i = head; i < b.length - tail; i++) out.push(`+${line(b[i])}`);
    for (let i = a.length - tail; i < Math.min(a.length, a.length - tail + ctx); i++) out.push(` ${line(a[i])}`);
    return out.join('\n');
}
