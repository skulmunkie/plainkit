// Inline suppression comments for the audit CLI (design 5.3, A-6b, #1518):
//   <!-- plainkit-audit-ignore D1 -- why this is fine -->   // plainkit-audit-ignore D1,T2 -- why   @* ... *@
// One comment suppresses a rule on its line and the next; needs an id and a `--` reason. Block: `-start RULE -- reason` ... `-end`.
const MARKER = /plainkit-audit-ignore(-start|-end)?\b(.*)$/;

export function scanIgnores(files, known) {   // known: optional Set of rule ids
    const ignores = [];
    const problems = [];
    for (const file of files) {
        let open = null;
        const lines = file.text.split(/\r?\n/);   // CRLF checkouts: a trailing \r would stop the marker's `.` (#1655)
        for (let i = 0; i < lines.length; i++) {
            const m = MARKER.exec(lines[i]);
            if (!m) continue;
            const problem = message => problems.push({ file: file.path, line: i + 1, message });
            if (m[1] === '-end') {
                if (open) { open.to = i + 1; open = null; } else problem('ends a block that was never started');
                continue;
            }
            const body = m[2].replace(/(-->|\*\/|\*@)\s*$/, '').trim();
            const [ruleText, ...rest] = body.split(/\s+--\s+/);
            const reason = rest.join(' -- ').trim();
            const rules = ruleText.split(',').map(s => s.trim()).filter(Boolean);
            const valid = rules.length > 0 && rules.every(r => /^[A-Za-z]\d+$/.test(r));
            const unknown = rules.find(r => known && !known.has(r));
            if (!valid || !reason || unknown) { problem(!valid ? 'names no rule id' : unknown ? `names unknown rule ${unknown}` : 'has no reason'); continue; }
            const g = { file: file.path, line: i + 1, rules, reason };
            if (m[1]) {
                if (open) problem('blocks cannot nest');
                open = g; g.to = Infinity;
            }
            ignores.push(g);
        }
        if (open) problems.push({ file: file.path, line: open.line, message: 'starts a block that is never ended' });
    }
    return { ignores, problems };
}

// Splits findings into kept and suppressed; `unused` are the ignores that matched nothing.
export function applyIgnores(findings, ignores) {
    const used = new Set();
    const kept = [];
    const suppressed = [];
    for (const f of findings) {
        const hit = ignores.find(g => g.file === f.file && g.rules.includes(f.rule) && (g.to ? f.line >= g.line && f.line <= g.to : f.line === g.line || f.line === g.line + 1));
        if (hit) { used.add(hit); suppressed.push({ ...f, reason: hit.reason }); } else kept.push(f);
    }
    return { kept, suppressed, unused: ignores.filter(g => !used.has(g)) };
}
