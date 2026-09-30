// The dev tools' Quality, Inspector and Theme panels, in the shape mountDevTools takes: { id, title, mount(element, context) }.
// Quality runs the SDK's own page checks (js/quality.js) on the live page and shows a score and every finding. Inspector lists the pk-*
// elements on the page with the attributes that configure them and highlights one when its row is chosen. Quality and Inspector are built only from
// SDK components (pk-stat, pk-table, pk-button, pk-cluster); Theme mounts the theme editor module against the live document, so a token edit restyles
// the page at once (its overrides persist under the same key as the SDK theme editor page). context.whileHidden(fn) runs fn with the dev tools out of the way, so they are not measured.

import { describeForInspector } from '../../js/inspect-logic.js';
import { loadElements } from '../../js/loader.js';
import { createLogger } from '../../js/log.js';
import { mountThemeEditor } from '../theme-editor/theme-editor.js';
import { mountQuality } from '../quality/quality.js';
import { mountLayoutBuilder } from '../layout-builder/layout-builder.js';
import { h } from '../../js/mount-support.js';
import { applyDynamic } from '../../js/dynamic.js';

const log = createLogger('devtools');

// The Quality tab is the standalone quality module (modules/quality) mounted in the dock; the dock hides itself while it measures.
export const qualityPanel = {
    id: 'quality',
    title: 'Quality',
    async mount(el, { whileHidden }) {
        const q = await mountQuality(el, { around: whileHidden });
        return { destroy: () => q.destroy() };
    },
};

export const inspectorPanel = {
    id: 'inspector',
    title: 'Inspector',
    async mount(el, { doc, win, isTool }) {
        const refresh = h(doc, 'pk-button', { size: 'mini', variant: 'ghost' }, 'Refresh');
        const status = h(doc, 'span', { class: 'muted', role: 'status' });
        const table = h(doc, 'pk-table', {
            label: 'pk-* elements on this page', density: 'compact', stickyHeader: true, clickable: true, maxHeight: '18rem',
            columns: JSON.stringify([{ key: 'tag', label: 'Element' }, { key: 'domId', label: 'Id' }, { key: 'props', label: 'Set with' }, { key: 'size', label: 'Size', align: 'end' }]),
        });
        el.append(h(doc, 'pk-cluster', {}, refresh, status), h(doc, 'div', { class: 'u-mt-3' }, table));
        loadElements(el).catch(err => log.debug('elements did not load (loadElements reports it)', err));

        let found = [];
        let outlined = null;
        function list() {
            found = [...doc.querySelectorAll('*')].filter(e => e.localName.startsWith('pk-') && !isTool(e));
            table.setAttribute('rows', JSON.stringify(found.map((e, id) => ({ id, ...describeForInspector(e) }))));
            status.textContent = `${found.length} elements. Choose a row to highlight it on the page.`;
        }
        // The outline is a dynamic value (temporary, never in a copy-paste snippet), so it goes through
        // data-dyn/applyDynamic() (core/js/dynamic.js) rather than target.style directly - same convention
        // theme-editor.js and code-explorer.js use. `before` is target's own data-dyn text (if any), owned by
        // whatever mounted it; restoring puts that text back once the outline entries are removed, instead of
        // reading/writing target.style to snapshot a prior manual outline (not a pattern any pk-* element uses).
        function highlight(e) {
            outlined?.restore();
            const target = found[Number(e.detail?.id)];
            if (!target) return;
            target.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
            const before = target.dataset.dyn;
            const withOutline = (before ? `${before.replace(/;\s*$/, '')}; ` : '') + 'outline:3px solid var(--color-accent); outline-offset:2px';
            target.dataset.dyn = withOutline;
            applyDynamic(target);
            const restore = () => {
                target.dataset.dyn = (before ? `${before.replace(/;\s*$/, '')}; ` : '') + 'outline:; outline-offset:';
                applyDynamic(target);
                if (before) target.dataset.dyn = before; else delete target.dataset.dyn;
            };
            const timer = win.setTimeout(() => { restore(); outlined = null; }, 2000);
            outlined = { restore: () => { win.clearTimeout(timer); restore(); } };
        }
        refresh.addEventListener('click', list);
        table.addEventListener('pk-row-click', highlight);
        return {
            activate: list,
            destroy() { outlined?.restore(); refresh.removeEventListener('click', list); table.removeEventListener('pk-row-click', highlight); },
        };
    },
};

export const themePanel = {
    id: 'theme',
    title: 'Theme',
    async mount(el, { doc }) {
        const editor = await mountThemeEditor(el, { target: doc, preview: false, storageKey: 'pk-theme-overrides' });
        return { destroy: () => editor.destroy() };
    },
};

// The Layout builder tab is a scratch instance of the module (an empty page): mounted once like every other panel, so it keeps whatever the
// visitor built for as long as the dock stays in the page, but nothing is persisted (the module itself stores no page; a host that wants a
// draft kept across reloads passes its own onchange, the way site/layout-builder/layout-builder.js does).
export const layoutBuilderPanel = {
    id: 'layout-builder',
    title: 'Layout builder',
    async mount(el, { theme }) {
        const builder = await mountLayoutBuilder(el, { height: '100%', theme });
        return { destroy: () => builder.destroy() };
    },
};
