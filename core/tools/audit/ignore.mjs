// Inline suppression comments for the audit CLI (design 5.3, A-6b, #1518):
//   <!-- plainkit-audit-ignore D1 -- why this is fine -->   // plainkit-audit-ignore D1,T2 -- why   @* ... *@
// A comment suppresses the named rule(s) on its own line and on the line right after it. The rule id and a
// reason after `--` are required; a comment without either is reported (and suppresses nothing), so a bare
// ignore can never hide a finding silently. Pure functions; no I/O.
const MARKER = /plainkit-audit-ignore\b(.*)$/;

export function scanIgnores(files) {
    const ignores = [];
    const problems = [];
    for (const file of files) {
        const lines = file.text.split(/\r?\n/);   // CRLF checkouts: a trailing \r would stop the marker's `.` (#1655)
        for (let i = 0; i < lines.length; i++) {
            const m = MARKER.exec(lines[i]);
            if (!m) continue;
            const body = m[1].replace(/(-->|\*\/|\*@)\s*$/, '').trim();
            const [ruleText, ...rest] = body.split(/\s+--\s+/);
            const reason = rest.join(' -- ').trim();
            const rules = ruleText.split(',').map(s => s.trim()).filter(Boolean);
            const valid = rules.length > 0 && rules.every(r => /^[A-Za-z]\d+$/.test(r));
            if (!valid || !reason) {
                problems.push({ file: file.path, line: i + 1, message: !valid ? 'names no rule id' : 'has no reason' });
                continue;
            }
            ignores.push({ file: file.path, line: i + 1, rules, reason });
        }
    }
    return { ignores, problems };
}

// Splits findings into kept and suppressed; `unused` are the ignores that matched nothing.
export function applyIgnores(findings, ignores) {
    const used = new Set();
    const kept = [];
    const suppressed = [];
    for (const f of findings) {
        const hit = ignores.find(g => g.file === f.file && g.rules.includes(f.rule) && (f.line === g.line || f.line === g.line + 1));
        if (hit) { used.add(hit); suppressed.push(f); } else kept.push(f);
    }
    return { kept, suppressed, unused: ignores.filter(g => !used.has(g)) };
}
