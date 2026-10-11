import test from 'node:test';
import assert from 'node:assert/strict';
import { parseReviewManifest, reviewRows, filterReview, describeReview, reviewDetail } from '../modules/audit-dashboard/review-logic.js';

// The real shape of review-output/manifest.json (scripts/ui-review.mjs groupFindings + summarize), trimmed.
const MANIFEST = {
    generated: '2026-10-11T08:30:00.000Z',
    summary: { errors: 1, warnings: 2, ok: false },
    notSeen: [],
    findings: [
        { rule: 'overflow', severity: 'error', tag: 'pk-card', example: 2, path: 'pk-card > p', message: 'text overflows its box', fix: 'allow the text to wrap', seen: ['phone/light', 'phone/dark'] },
        { rule: 'contrast', severity: 'warning', tag: 'pk-table', example: 1, path: 'pk-table th', message: 'low contrast 3.9:1', fix: 'use a stronger token', seen: ['desktop/dark'] },
        { rule: 'tap-target', severity: 'warning', tag: 'pk-tabs', example: 'rest, open', path: 'pk-tabs button', message: 'target is 30px', seen: ['phone/light'] },
    ],
};

test('parseReviewManifest reads a manifest and rejects a malformed one with a message', () => {
    const parsed = parseReviewManifest(MANIFEST);
    assert.equal(parsed.findings.length, 3);
    assert.equal(parsed.summary.errors, 1);
    assert.throws(() => parseReviewManifest(null), /not a UI review manifest/);
    assert.throws(() => parseReviewManifest({}), /findings/);
    assert.throws(() => parseReviewManifest({ findings: [{ rule: 'x' }] }), /rule and a severity/);
    assert.deepEqual(parseReviewManifest({ findings: [] }).notSeen, []);
});

test('reviewRows gives one row per finding with a positional id, the element, where it was seen and the viewports', () => {
    const rows = reviewRows(MANIFEST.findings);
    assert.equal(rows.length, 3);
    assert.deepEqual(rows[0], { id: '0', severity: 'error', rule: 'overflow', element: 'pk-card', where: 'pk-card, example 2', seen: 'phone/light, phone/dark' });
    assert.equal(rows[2].where, 'pk-tabs, example rest, open');
    assert.deepEqual(reviewRows([]), []);
});

test('filterReview filters by severity and by text in element, rule, message or path', () => {
    assert.equal(filterReview(MANIFEST.findings, { severity: 'error' }).length, 1);
    assert.equal(filterReview(MANIFEST.findings, { text: 'PK-TABLE' }).length, 1);
    assert.equal(filterReview(MANIFEST.findings, { text: 'overflows' })[0].rule, 'overflow');
    assert.equal(filterReview(MANIFEST.findings, { severity: 'error', text: 'contrast' }).length, 0);
    assert.equal(filterReview(MANIFEST.findings).length, 3);
});

test('describeReview counts from the summary, else from the findings, and shows the generated time', () => {
    assert.equal(describeReview(parseReviewManifest(MANIFEST)), '1 error, 2 warnings, generated 2026-10-11 08:30:00 UTC');
    assert.equal(describeReview(parseReviewManifest({ findings: MANIFEST.findings })), '1 error, 2 warnings');
});

test('reviewDetail lists the fields and the FIX line, or the regen command when the finding has none', () => {
    const d = reviewDetail(MANIFEST.findings[0]);
    assert.equal(d.heading, 'overflow');
    assert.ok(d.fields.some(f => f.label === 'Where' && f.value === 'pk-card > p'));
    assert.equal(d.fix, 'FIX: allow the text to wrap');
    assert.match(reviewDetail(MANIFEST.findings[2]).fix, /ui-review\.mjs/);
    assert.equal(reviewDetail(null), null);
});
