// The UI-review panel of the audit dashboard, loaded on demand (a dynamic import from audit-dashboard.js) so the module's entry stays small:
// a read-only pk-table of the findings in review-output/manifest.json (written by scripts/ui-review.mjs), with a severity and text filter. An absent
// or malformed file shows an empty state that names the command to write it, and is logged; nothing here runs a script.

import { loadJson, h, on } from '../../js/mount-support.js';
import { loadElements } from '../../js/loader.js';
import { createLogger } from '../../js/log.js';
import { parseReviewManifest, reviewRows, filterReview, describeReview, reviewDetail, REVIEW_COMMAND } from './review-logic.js';

const log = createLogger('audit-dashboard');
const COLUMNS = [{ key: 'severity', label: 'Severity' }, { key: 'rule', label: 'Rule' }, { key: 'element', label: 'Element' }, { key: 'where', label: 'Where' }];

// Returns { panel, load(), detail }. `onSelect(finding|null)` is called when a row is chosen or the data is reloaded.
export function createReviewPanel(doc, { reviewUrl, onSelect }) {
    let parsed = { findings: [], summary: null, generated: null, notSeen: [] };
    let filtered = [], severity = '', text = '';
    const sourceLabel = typeof reviewUrl === 'string' ? reviewUrl : 'review-output/manifest.json';

    const empty = h(doc, 'pk-empty-state', { slot: 'empty', heading: 'No findings', tone: 'compact', description: `Nothing matches, or ${sourceLabel} has no findings.` });
    const table = h(doc, 'pk-table', { label: 'UI review findings', density: 'compact', stickyHeader: true, clickable: true, manual: true, cards: true, maxHeight: '20rem', columns: JSON.stringify(COLUMNS) }, empty);
    const search = h(doc, 'pk-input', { type: 'search', label: 'Filter review findings', placeholder: 'Filter by element, rule or message', clearable: true, debounce: 150 });
    const errorsOnly = h(doc, 'pk-checkbox', {}, 'Errors only');
    const refreshBtn = h(doc, 'pk-button', { size: 'mini', variant: 'ghost' }, 'Refresh (re-reads the file, never re-runs the review)');
    const statusEl = h(doc, 'span', { class: 'ad-status', role: 'status' }, 'Loading...');
    const panel = h(doc, 'div', { slot: 'review', 'data-heading': 'UI review', 'data-group': 'center', class: 'ad-panel' },
        h(doc, 'pk-stack', { gap: 'sm' },
            h(doc, 'p', { class: 'ad-header' }, `Reads ${sourceLabel}, the findings of the last UI review. Regenerate with: ${REVIEW_COMMAND}`),
            h(doc, 'pk-cluster', {}, search, errorsOnly, refreshBtn, statusEl),
            table));

    function draw() {
        filtered = filterReview(parsed.findings, { severity, text });
        table.setAttribute('rows', JSON.stringify(reviewRows(filtered)));
        statusEl.textContent = `${filtered.length} of ${parsed.findings.length} findings shown (${describeReview(parsed)})`;
    }

    function showMissing(err) {
        parsed = { findings: [], summary: null, generated: null, notSeen: [] };
        filtered = [];
        empty.setAttribute('heading', 'No UI review found');
        empty.setAttribute('description', `Could not read ${sourceLabel} (${err.message}). Run ${REVIEW_COMMAND} to write it, then refresh.`);
        table.setAttribute('rows', '[]');
        statusEl.textContent = 'No UI review output yet';
    }

    async function load() {
        statusEl.textContent = 'Loading...';
        try {
            parsed = parseReviewManifest(await loadJson(reviewUrl));
            empty.setAttribute('heading', 'No findings');
            empty.setAttribute('description', `Nothing matches, or ${sourceLabel} has no findings.`);
            draw();
        } catch (err) {
            log.warn('could not load the UI review manifest', err);
            showMissing(err);
        }
        onSelect(null);
    }

    on(search, 'pk-search', e => { text = e.detail.value ?? ''; draw(); });
    on(errorsOnly, 'pk-change', e => { severity = e.detail?.checked ? 'error' : ''; draw(); });
    on(refreshBtn, 'click', () => load());
    on(table, 'pk-row-click', e => onSelect(filtered[Number(e.detail?.id)] ?? null));
    loadElements(panel).catch(err => log.debug('elements did not load (loadElements reports it)', err));

    return { panel, load, detail: reviewDetail };
}
