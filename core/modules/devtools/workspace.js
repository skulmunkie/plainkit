// The dev tools workspace as a module: mountDevToolsWorkspace(container, options) is the toolkit's own dev tools page in one call. A tab strip (Gallery, Files, Scorecard)
// above the chosen workspace, and the dev tools dock (the console, logs, performance and the other tools of devtools.js) over the page. Built only from SDK parts:
// pk-tabs and pk-empty-state around the <pk-gallery> element, the code explorer module and the scorecard module, and mountDevTools for the dock. Nothing is drawn here.
// Each workspace loads on first use (the explorer and the scorecard are separate modules, imported when their tab is first chosen), so a deep link to one loads only that one.
//
//   const page = await mountDevToolsWorkspace(el, {
//       workspace: 'files',                                                    // the first tab: 'gallery' (default), 'files' or 'scorecard'
//       gallery: { sections: [{ tag: 'pk-button', title: 'Blazor', lines: ['<PkButton />'] }], height: 760 },
//       files: { snapshot },                                                   // or { provider } or { load: async () => provider } (a host that reads the files elsewhere)
//       scorecard: { targets: [{ name: 'Form', url: '/gallery/templates/form/form.html' }], historyKey: 'my-devtools-scorecard' },
//       tool: 'console',                                                       // open the dock on this tab
//       onworkspace: key => history.pushState({}, '', `/_plainkit/${key}`),    // the reader chose a tab (not called for select() or update())
//   });
//   page.select('scorecard'); page.update({ files: { snapshot: newer } }); page.destroy();
//
// Options (all optional):
//   workspace      the first workspace, one of `workspaces`; an unknown name falls back to the first one.
//   workspaces     which tabs to offer and their order, a subset of ['gallery', 'files', 'scorecard'] (default all three).
//   gallery        { sections, src, chrome, height, ...attributes } for <pk-gallery>. sections is a list of { tag?, title, open?, lines?, columns?, rows?, code? } for the Details drawer
//                  (js/gallery-sections.js); chrome defaults to 'full' and height to 760. src is the address of the gallery's embed.html when it is not next to the SDK.
//   files          { snapshot | provider | load, height, file, line, count }. snapshot is a URL or the parsed object, provider a ready code explorer provider (modules/code-explorer/
//                  providers.js), load an async function returning a provider. With none of them the Files tab says there is no source to browse. count shows "N files" above
//                  the explorer. height defaults to 42rem.
//   scorecard      { targets, checks, historyKey, autorun, height }, as mountScorecard; height defaults to 42rem. Without targets the tab says there is nothing to score.
//   dock           false leaves the dock out (default true: the dock is mounted, open).
//   tool           the dock tab to show (console, logs, logging, performance, quality, inspector, theme, layout-builder, or one of `panels`).
//   open           whether the dock starts open (default true).
//   panels         extra dock panels, as mountDevTools takes them ({ id, title, mount(element, context) }).
//   theme          'dark' | 'light', passed to the gallery, the explorer, the scorecard and the dock.
//   label          the accessible name of the tab strip (default 'Workspaces').
//   onworkspace    called with the key when the reader chooses a tab.
// Returns { ready, select(key), workspace(), update(patch), dock, destroy() }. ready settles once the first workspace is shown (the mount itself does not wait for it). dock is the dock's handle ({ open, close, toggle, select(id), tabs() ... }) or null. update(patch) merges
// the options named in it (gallery, files, scorecard, theme) one level deep and shows the current workspace again from them, which is how a host that learns its data later hands it over.
// A workspace that fails to load shows an empty state naming the problem and logs it; the others keep working.

import { mountDevTools } from './devtools.js';
import { ensureStyles, styleUrls, h, on } from '../../js/mount-support.js';
import { loadElements } from '../../js/loader.js';
import { createLogger } from '../../js/log.js';

const log = createLogger('devtools-workspace');
const STYLES = ['../../plainkit.css'];

export const WORKSPACES = Object.freeze([['gallery', 'Gallery'], ['files', 'Files'], ['scorecard', 'Scorecard']]);

const EMPTY = {
    files: ['No source to browse', 'The Files workspace reads a folder on the server, so it is not available in a browser-only app. Give it a snapshot or a provider, or run server side.'],
    scorecard: ['Nothing to score', 'Give the Scorecard workspace targets: pages of this origin, or markup, to render at every theme and width.'],
};

export async function mountDevToolsWorkspace(container, options = {}) {
    const doc = container.ownerDocument;
    const known = new Map(WORKSPACES);
    let config = { ...options };
    const keys = (options.workspaces ?? WORKSPACES.map(([k]) => k)).filter(k => known.has(k));
    if (!keys.length) throw new TypeError('mountDevToolsWorkspace: workspaces names no known workspace (gallery, files, scorecard)');
    let current = keys.includes(options.workspace) ? options.workspace : keys[0];
    let child = null;       // the mounted workspace's handle, if it has a destroy
    let turn = 0;           // a newer choice makes an older, slower load stop and clean up
    let gone = false;

    await ensureStyles(styleUrls(STYLES, import.meta.url), doc);
    const tabs = h(doc, 'pk-tabs', { value: current, label: options.label ?? 'Workspaces' }, ...keys.map(k => h(doc, 'pk-tab', { value: k }, known.get(k))));
    const body = h(doc, 'div', { 'data-devtools-workspace': current });
    container.replaceChildren(tabs, body);
    await loadElements(container).catch(err => log.debug('elements did not load (loadElements reports it)', err));

    const empty = (heading, description) => h(doc, 'pk-empty-state', { heading, description });
    const release = () => { try { child?.destroy?.(); } catch (err) { log.warn('a workspace did not tear down cleanly', err); } child = null; };

    const builders = {
        async gallery() {
            const { sections, chrome = 'full', height = 760, ...attrs } = config.gallery ?? {};
            return { node: h(doc, 'pk-gallery', { chrome, height, theme: config.theme, ...attrs, sections: sections?.length ? JSON.stringify(sections) : null }) };
        },
        async files(mine) {
            const f = config.files ?? {};
            const provider = f.provider ?? (f.load ? await f.load() : null);
            if (!mine()) return null;
            if (!provider && !f.snapshot) return { node: empty(...EMPTY.files) };
            const { mountCodeExplorer } = await import('../code-explorer/code-explorer.js');
            const host = h(doc, 'div');
            const note = f.count ? h(doc, 'pk-text', { tone: 'muted' }, `${f.count} files under the app's source root.`) : null;
            body.replaceChildren(...[note, host].filter(Boolean));
            const handle = await mountCodeExplorer(host, { provider, snapshot: provider ? undefined : f.snapshot, height: f.height ?? '42rem', file: f.file, line: f.line, theme: config.theme });
            return mine() ? { handle } : (handle.destroy?.(), null);
        },
        async scorecard(mine) {
            const s = config.scorecard ?? {};
            if (!s.targets?.length) return { node: empty(...EMPTY.scorecard) };
            const { mountScorecard } = await import('../scorecard/scorecard.js');
            const host = h(doc, 'div');
            body.replaceChildren(host);
            const handle = await mountScorecard(host, { ...s, height: s.height ?? '42rem', theme: config.theme });
            return mine() ? { handle } : (handle.destroy?.(), null);
        },
    };

    async function show() {
        const id = ++turn;
        const mine = () => !gone && id === turn;
        release();
        body.replaceChildren();
        body.setAttribute('data-devtools-workspace', current);
        try {
            const built = await builders[current](mine);
            if (!built || !mine()) return;
            child = built.handle ?? null;
            if (built.node) body.replaceChildren(built.node);
        } catch (err) {
            log.error(`the ${current} workspace could not load`, err);
            if (mine()) body.replaceChildren(empty(`The ${known.get(current)} workspace could not load`, err?.message ?? String(err)));
        }
    }

    const stop = on(tabs, 'pk-tab-change', e => {
        const key = e.detail.value;
        if (e.detail.fallback || key === current || !keys.includes(key)) return;
        current = key;
        show();
        config.onworkspace?.(key);
    });
    const ready = show();   // not awaited: a slow workspace must not hold the dock back; `ready` settles when the first one is shown

    const dock = config.dock === false ? null : await mountDevTools(null, { mode: 'dock', open: config.open ?? true, tab: config.tool, theme: config.theme, panels: config.panels });

    return {
        ready,
        dock,
        workspace: () => current,
        select(key) {
            if (!keys.includes(key) || key === current) return undefined;
            current = key;
            tabs.setAttribute('value', key);
            return show();
        },
        update(patch = {}) {
            for (const k of ['gallery', 'files', 'scorecard']) if (patch[k]) config = { ...config, [k]: { ...config[k], ...patch[k] } };
            if (patch.theme !== undefined) config = { ...config, theme: patch.theme };
            return show();
        },
        destroy() {
            gone = true; turn++;
            stop();
            release();
            dock?.destroy?.();
            container.replaceChildren();
        },
    };
}
