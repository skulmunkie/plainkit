// Pure logic behind the audit dashboard's UI-review panel (docs/superpowers/specs/2026-09-30-audit-dashboard-design.md): reading the
// review-output/manifest.json that scripts/ui-review.mjs writes, turning its grouped findings into table rows, filtering them and describing one
// for the Properties panel. No browser API, so node tests cover it. The dashboard never runs the review: node scripts/ui-review.mjs is the
// regen command, named in the panel's empty state.

export const REVIEW_COMMAND = 'node scripts/ui-review.mjs --elements <names>';

// The manifest document -> { findings, summary, generated, notSeen }, or throws a message naming what is wrong (the panel shows it).
export function parseReviewManifest(json) {
    if (!json || typeof json !== 'object') throw new Error('not a UI review manifest: expected an object');
    if (!Array.isArray(json.findings)) throw new Error('not a UI review manifest: expected a "findings" array (was it written by scripts/ui-review.mjs?)');
    for (const f of json.findings) {
        if (!f || typeof f.rule !== 'string' || typeof f.severity !== 'string') throw new Error('not a UI review manifest: every finding needs a rule and a severity');
    }
    return { findings: json.findings, summary: json.summary ?? null, generated: json.generated ?? null, notSeen: Array.isArray(json.notSeen) ? json.notSeen : [] };
}

const where = f => [f.tag, f.example !== undefined && f.example !== null ? `example ${f.example}` : null].filter(Boolean).join(', ');

// One row per finding; the id is its position (the manifest has already merged the same finding seen in several viewports and themes into one line).
export function reviewRows(findings) {
    return findings.map((f, i) => ({ id: String(i), severity: f.severity, rule: f.rule, element: f.tag ?? '', where: where(f), seen: (f.seen ?? []).join(', ') }));
}

// Findings whose severity matches (empty = all) and whose element/rule/message contain the text, case-insensitively.
export function filterReview(findings, { severity = '', text = '' } = {}) {
    const t = text.trim().toLowerCase();
    return findings.filter(f => (!severity || f.severity === severity)
        && (!t || [f.tag, f.rule, f.message, f.path].some(s => typeof s === 'string' && s.toLowerCase().includes(t))));
}

// "3 errors, 2 warnings" from the manifest's summary, falling back to counting the findings.
export function describeReview({ findings, summary, generated }) {
    const errors = summary?.errors ?? findings.filter(f => f.severity === 'error').length;
    const warnings = summary?.warnings ?? findings.filter(f => f.severity !== 'error').length;
    const when = generated && !Number.isNaN(new Date(generated).getTime()) ? `, generated ${new Date(generated).toISOString().replace('T', ' ').slice(0, 19)} UTC` : '';
    return `${errors} error${errors === 1 ? '' : 's'}, ${warnings} warning${warnings === 1 ? '' : 's'}${when}`;
}

// The detail shown in the Properties panel when a review finding is selected (finding = the manifest entry, not the row).
export function reviewDetail(finding) {
    if (!finding) return null;
    const fields = [
        { label: 'Severity', value: finding.severity },
        { label: 'Rule', value: finding.rule },
        { label: 'Element', value: finding.tag ?? '' },
        { label: 'Where', value: finding.path ?? where(finding) },
        { label: 'Seen in', value: (finding.seen ?? []).join(', ') },
        { label: 'Message', value: finding.message ?? '' },
    ].filter(f => f.value);
    return { heading: finding.rule, fields, fix: finding.fix ? `FIX: ${finding.fix}` : `Re-run ${REVIEW_COMMAND} after changing the element.` };
}
