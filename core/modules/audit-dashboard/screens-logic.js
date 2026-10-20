// Pure logic behind the audit dashboard's Screenshots panel: the shots that scripts/ui-review.mjs lists in review-output/manifest.json
// ({ tag, example, title, scenario?, viewport, theme, file, findings }), turned into the filter options, the gallery images and the findings rows.
// No browser API, so node tests cover it. The panel only displays files already on disk; nothing here runs the review.

export const SCREENS_COMMAND = 'node scripts/ui-review.mjs';
export const SERVE_COMMAND = 'node core/tools/serve.mjs';
export const VIEWPORTS = ['desktop', 'phone'];
export const THEMES = ['light', 'dark'];

// Only a plain file name written by the review (shotName in scripts/ui-review.mjs) is ever requested: no separator, no dot first.
export const isShotFile = file => typeof file === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.-]*\.png$/.test(file);

// The shots that have a screenshot file; a manifest without a `shots` array has none (an older one, or the "nothing to review" run).
export const screenShots = manifest => (Array.isArray(manifest?.shots) ? manifest.shots : []).filter(s => s && isShotFile(s.file));

// What a shot belongs to: its scenario, or its element.
export const itemOf = shot => (shot.scenario ? `scenario ${shot.scenario}` : String(shot.tag ?? ''));

// The sorted item names (elements, then scenarios).
export function shotItems(shots) {
    return [...new Set(shots.map(itemOf))].sort((a, b) => (a.startsWith('scenario ') - b.startsWith('scenario ')) || a.localeCompare(b));
}

// Shots matching the filters; an empty filter matches all. `onlyFindings` keeps the shots with at least one finding.
export function filterShots(shots, { item = '', viewport = '', theme = '', onlyFindings = false } = {}) {
    return shots.filter(s => (!item || itemOf(s) === item) && (!viewport || s.viewport === viewport) && (!theme || s.theme === theme)
        && (!onlyFindings || (s.findings ?? []).length > 0));
}

const order = (list, v) => { const i = list.indexOf(v); return i < 0 ? list.length : i; };
// Items together, examples in order, then desktop before phone and light before dark: the four variants of one example sit side by side.
export function sortShots(shots) {
    return [...shots].sort((a, b) => itemOf(a).localeCompare(itemOf(b)) || String(a.example).localeCompare(String(b.example), undefined, { numeric: true })
        || order(VIEWPORTS, a.viewport) - order(VIEWPORTS, b.viewport) || order(THEMES, a.theme) - order(THEMES, b.theme));
}

export const shotLabel = s => `${itemOf(s)} ${s.scenario ? s.example : `example ${s.example}`}, ${s.viewport}, ${s.theme}`;

const errors = s => (s.findings ?? []).filter(f => f.severity === 'error').length;
// The badge text on a thumbnail: how many findings, errors first; nothing when clean.
export function shotStatus(s) {
    const n = (s.findings ?? []).length, e = errors(s);
    return n === 0 ? '' : e ? `${e} error${e === 1 ? '' : 's'}` : `${n} warning${n === 1 ? '' : 's'}`;
}

// The gallery images ({ src, alt, status }) for shots, their files under `base` (the review route, e.g. /_audit/review/).
export const galleryImages = (shots, base) => shots.map(s => ({ src: base + encodeURIComponent(s.file), alt: shotLabel(s), status: shotStatus(s) }));

// One row per finding of the shots: the table under the gallery (severity, rule, message and the FIX text).
export function findingRows(shots) {
    return shots.flatMap((s, i) => (s.findings ?? []).map((f, j) => ({ id: `${i}.${j}`, shot: shotLabel(s), severity: f.severity, rule: f.rule, message: f.message ?? '', fix: f.fix ? `FIX: ${f.fix}` : '' })));
}

export const countText = (shown, all) => `${shown} of ${all} screenshots shown`;
