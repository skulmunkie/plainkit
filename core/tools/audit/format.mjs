// Text and JSON output for the audit CLI (design section 5.1). Kept separate from cli.mjs so the shape can be
// unit-tested without spawning a process.

const RESET = '\x1b[0m';
const COLORS = { error: '\x1b[31m', warn: '\x1b[33m' };

function paint(text, color, useColor) {
    return useColor && color ? `${color}${text}${RESET}` : text;
}

// One block per finding: `path:line:col  severity  [id]  message`, then the FIX line, per design 5.1.
export function formatText(findings, summary, { color = true } = {}) {
    const lines = [];
    for (const f of findings) {
        lines.push(`${f.file}:${f.line}:${f.column}  ${paint(f.severity, COLORS[f.severity], color)}  [${f.rule}]  ${f.message}`);
        if (f.fix) lines.push(`  ${f.fix}`);
    }
    if (lines.length) lines.push('');
    lines.push(formatSummaryLine(summary));
    return lines.join('\n');
}

export function formatSummaryLine(summary) {
    const skipped = summary.skippedRules && summary.skippedRules.length
        ? `; skipped rules: ${summary.skippedRules.join(', ')}`
        : '';
    return `plainkit audit: ${summary.errors} error${summary.errors === 1 ? '' : 's'}, ${summary.warnings} warning${summary.warnings === 1 ? '' : 's'}, ${summary.files} file${summary.files === 1 ? '' : 's'}, ${summary.seconds}s (${summary.mode}${skipped})`;
}

// JSON per design 5.1: `{ version, mode, parser, findings, summary, skipped }`.
export function formatJson(findings, summary, { version, mode, parser, skipped }) {
    return JSON.stringify({
        version,
        mode,
        parser,
        findings: findings.map(f => ({
            id: f.rule,
            category: f.category,
            severity: f.severity,
            file: f.file,
            line: f.line,
            column: f.column,
            message: f.message,
            fix: f.fix,
            docs: f.docs,
        })),
        summary,
        skipped,
    }, null, 2);
}

// SARIF 2.1.0 (design section 5.1), for `github/codeql-action/upload-sarif`. Only the fields GitHub code
// scanning and the schema require: `tool.driver.rules` (so the UI shows the fix text) and one `result` per
// finding with a `ruleId`, `level` and a `physicalLocation`. `version` is the package version, not the SARIF
// schema version (that is the fixed `1.0.0` in `driver.version` below matches nothing external; kept simple).
const SARIF_LEVEL = { error: 'error', warn: 'warning' };

export function formatSarif(findings, { version, rules }) {
    const ruleIds = [...new Set(findings.map(f => f.rule))];
    const driverRules = ruleIds.map(id => {
        const meta = rules.find(r => r.id === id);
        return {
            id,
            name: id,
            shortDescription: { text: meta?.detects ?? id },
            helpUri: meta?.docs,
            properties: { category: meta?.category },
        };
    });
    const results = findings.map(f => ({
        ruleId: f.rule,
        level: SARIF_LEVEL[f.severity] ?? 'note',
        message: { text: f.fix || f.message },
        locations: [{
            physicalLocation: {
                artifactLocation: { uri: f.file },
                region: { startLine: f.line, startColumn: f.column },
            },
        }],
    }));
    return JSON.stringify({
        version: '2.1.0',
        $schema: 'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json',
        runs: [{
            tool: { driver: { name: 'plainkit-audit', version, informationUri: 'https://github.com/skulmunkie/plainkit', rules: driverRules } },
            results,
        }],
    }, null, 2);
}

export function formatRuleList(rules) {
    const header = ['id', 'category', 'normal', 'strict', 'detects'];
    const rows = rules.map(r => [r.id, r.category, r.severity.normal, r.severity.strict, r.detects]);
    const widths = header.map((h, i) => Math.max(h.length, ...rows.map(r => String(r[i]).length)));
    const line = cells => cells.map((c, i) => String(c).padEnd(widths[i])).join('  ');
    return [line(header), ...rows.map(line)].join('\n');
}

export function formatExplain(rule) {
    return [
        `${rule.id} (${rule.category})`,
        `  detects: ${rule.detects}`,
        `  severity: normal=${rule.severity.normal}, strict=${rule.severity.strict}`,
        `  docs: ${rule.docs}`,
        `  fix: ${rule.fixTemplate}`,
    ].join('\n');
}
