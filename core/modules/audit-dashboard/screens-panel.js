// The Screenshots panel of the audit dashboard, a lazy chunk imported at mount: the shots of the last UI review (review-output/, written by
// scripts/ui-review.mjs) as a pk-image-gallery you filter by element or scenario, viewport and theme, with a toggle to show only the shots that have
// findings and a table of those findings (severity, rule, message, FIX). A click on a thumbnail enlarges it in the gallery's pk-lightbox. The images
// are same-origin files from core/tools/serve.mjs (/_audit/review/<name>.png); where that route does not exist (the hosted site) it shows an empty
// state naming the two commands and logs only at debug level. Nothing here runs a script.

import { loadJson, h, on } from '../../js/mount-support.js';
import { loadElements } from '../../js/loader.js';
import { createLogger } from '../../js/log.js';
import { screenShots, shotItems, filterShots, sortShots, galleryImages, findingRows, countText, VIEWPORTS, THEMES, SCREENS_COMMAND, SERVE_COMMAND } from './screens-logic.js';

const log = createLogger('audit-dashboard');
const COLUMNS = [{ key: 'shot', label: 'Screenshot' }, { key: 'severity', label: 'Severity' }, { key: 'rule', label: 'Rule' }, { key: 'message', label: 'Message' }, { key: 'fix', label: 'Fix' }];
const option = (value, label) => ({ value, label });
const HELP = 'The screenshots of the last UI review, read from review-output/ by the local server. Choose an element and leave viewport and theme on All to compare light and dark, desktop and phone side by side; click a thumbnail to enlarge it.';

// Returns { panel, load() }. `reviewUrl` is the manifest (a URL or the object); `screensBase` is where the PNG files are served from.
export function createScreensPanel(doc, { reviewUrl, screensBase }) {
    let shots = [];
    const filters = { item: '', viewport: '', theme: '', onlyFindings: false };

    const itemSelect = h(doc, 'pk-select', { label: 'Element or scenario', 'show-label': true });
    const viewportSelect = h(doc, 'pk-select', { label: 'Viewport', 'show-label': true });
    const themeSelect = h(doc, 'pk-select', { label: 'Theme', 'show-label': true });
    const onlyFindings = h(doc, 'pk-checkbox', {}, 'Only shots with findings');
    const statusEl = h(doc, 'span', { class: 'ad-status', role: 'status' }, 'Loading...');
    const gallery = h(doc, 'pk-image-gallery', { min: '12rem' });
    const findings = h(doc, 'pk-table', { label: 'Findings of the shown screenshots', density: 'compact', manual: true, cards: true, maxHeight: '16rem', columns: JSON.stringify(COLUMNS) },
        h(doc, 'pk-empty-state', { slot: 'empty', heading: 'No findings', tone: 'compact', description: 'None of the shown screenshots has a finding.' }));
    const empty = h(doc, 'pk-empty-state', { heading: 'No screenshots', description: SCREENS_COMMAND, hidden: true });
    const results = h(doc, 'pk-stack', { gap: 'sm', hidden: true }, gallery, findings);
    const panel = h(doc, 'div', { slot: 'screens', 'data-heading': 'Screenshots', 'data-group': 'center', class: 'ad-panel' },
        h(doc, 'pk-stack', { gap: 'sm' },
            h(doc, 'p', { class: 'ad-header' }, HELP),
            h(doc, 'pk-cluster', {}, itemSelect, viewportSelect, themeSelect, onlyFindings, statusEl),
            results, empty));

    function draw() {
        const shown = sortShots(filterShots(shots, filters));
        gallery.images = galleryImages(shown, screensBase);
        findings.setAttribute('rows', JSON.stringify(findingRows(shown)));
        findings.hidden = !shown.some(s => (s.findings ?? []).length);
        statusEl.textContent = countText(shown.length, shots.length);
    }

    function show(isEmpty, heading, description) {
        results.hidden = isEmpty; empty.hidden = !isEmpty;
        empty.setAttribute('heading', heading); empty.setAttribute('description', description);
    }

    async function load() {
        statusEl.textContent = 'Loading...';
        try {
            shots = screenShots(await loadJson(reviewUrl));
            itemSelect.options = [option('', 'All'), ...shotItems(shots).map(i => option(i, i))];
            viewportSelect.options = [option('', 'All'), ...VIEWPORTS.map(v => option(v, v))];
            themeSelect.options = [option('', 'All'), ...THEMES.map(v => option(v, v))];
            if (!shots.length) { statusEl.textContent = 'No screenshots in the last review'; show(true, 'No screenshots', `The last review wrote no screenshot files. Run ${SCREENS_COMMAND} --elements <names>, then refresh.`); return; }
            show(false, '', '');
            draw();
        } catch (err) {
            // The hosted site has no /_audit/ route (a 404): that is the normal empty state, not a fault.
            log.debug('no screenshots to show (the review route answered nothing)', err);
            shots = [];
            statusEl.textContent = 'No screenshots here';
            show(true, 'No screenshots here', `Screenshots are read from review-output/ by the local server. Run ${SCREENS_COMMAND} to write them, then ${SERVE_COMMAND} and open this page on that server. A downloaded CI artifact works too: ${SERVE_COMMAND} --review-dir=<unzipped folder>.`);
        }
    }

    on(itemSelect, 'pk-value-change', e => { filters.item = e.detail.value ?? ''; draw(); });
    on(viewportSelect, 'pk-value-change', e => { filters.viewport = e.detail.value ?? ''; draw(); });
    on(themeSelect, 'pk-value-change', e => { filters.theme = e.detail.value ?? ''; draw(); });
    on(onlyFindings, 'pk-change', e => { filters.onlyFindings = e.detail?.checked === true; draw(); });
    loadElements(panel).catch(err => log.debug('elements did not load (loadElements reports it)', err));

    return { panel, load };
}
