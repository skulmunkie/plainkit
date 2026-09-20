// The dev tools' Quality, Inspector and Theme panels, in the shape mountDevTools takes: { id, title, mount(element, context) }.
// Quality runs the SDK's own page checks (js/quality.js) on the live page and shows a score and every finding. Inspector lists the pk-*
// elements on the page with the attributes that configure them and highlights one when its row is chosen. Quality and Inspector are built only from
// SDK components (pk-stat, pk-table, pk-button, pk-cluster); Theme mounts the theme editor module against the live document, so a token edit restyles
// the page at once (its overrides persist under the same key as the SDK theme editor page). context.whileHidden(fn) runs fn with the dev tools out of the way, so they are not measured.

import { describeForInspector } from '../../js/inspect-logic.js';
import { loadElements } from '../../js/loader.js';
import { mountThemeEditor } from '../theme-editor/theme-editor.js';
import { mountQuality } from '../quality/quality.js';

function h(doc, tag, props = {}, ...children) {
    const el = doc.createElement(tag);
    for (const [k, v] of Object.entries(props)) if (v !== undefined && v !== null && v !== false) el.setAttribute(k, v === true ? '' : v);
    el.append(...children.filter(c => c !== null && c !== undefined));
    return el;
}

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
        loadElements(el).catch(() => {});

        let found = [];
        let outlined = null;
        function list() {
            found = [...doc.querySelectorAll('*')].filter(e => e.localName.startsWith('pk-') && !isTool(e));
            table.setAttribute('rows', JSON.stringify(found.map((e, id) => ({ id, ...describeForInspector(e) }))));
            status.textContent = `${found.length} elements. Choose a row to highlight it on the page.`;
        }
        function highlight(e) {
            outlined?.restore();
            const target = found[Number(e.detail?.id)];
            if (!target) return;
            const before = target.style.getPropertyValue('outline');
            const beforeOffset = target.style.getPropertyValue('outline-offset');
            target.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
            target.style.setProperty('outline', '3px solid var(--color-accent)');
            target.style.setProperty('outline-offset', '2px');
            const restore = () => { target.style.setProperty('outline', before); target.style.setProperty('outline-offset', beforeOffset); if (!before) target.style.removeProperty('outline'); if (!beforeOffset) target.style.removeProperty('outline-offset'); };
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
