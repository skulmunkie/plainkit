// The code explorer as a module: mountCodeExplorer(container, options) puts a file tree, tabs, a code viewer, search and an outline in
// `container`, fed by a snapshot (see tools/snapshot.mjs for producing one and modules/code-explorer/providers.js for the format).
//
//   const explorer = await mountCodeExplorer(el, { snapshot: 'snapshot.json', file: 'src/app.js', search: 'TODO', theme: 'light', height: '32rem' });
//
// Options: snapshot (a URL of a snapshot JSON, or the parsed object), provider (a ready provider instead of a snapshot), file (open
// this path, `line` picks the row), search (run this query), theme ('dark' | 'light'), height (any CSS length, or 'fill'; default 32rem).
// Returns { element, openFile(path, { line }), search(query), destroy() }. The document must be able to load the SDK stylesheets; any
// that are missing are added (the explorer's own stylesheet is added by the element).

import './element.js';
import { SnapshotProvider } from './providers.js';
import { ensureStyles, styleUrls, loadJson } from '../js/mount-support.js';

const STYLES = ['../plainkit.css'];

export async function mountCodeExplorer(container, options = {}) {
    const { snapshot, provider, file, line, search, theme, height } = options;
    if (!snapshot && !provider) throw new Error('mountCodeExplorer needs a snapshot (a URL or an object) or a provider');
    await ensureStyles(styleUrls(STYLES, import.meta.url), container.ownerDocument);
    const source = provider ?? new SnapshotProvider(await loadJson(snapshot));
    const element = container.ownerDocument.createElement('code-explorer');
    element.setAttribute('height', height ?? '32rem');
    if (theme) element.setAttribute('theme', theme);
    if (file) element.setAttribute('initial', file);
    if (file && line) element.setAttribute('initial-line', String(line));
    if (search) element.setAttribute('search', search);
    element.provider = source;
    container.replaceChildren(element);
    return { element, openFile: (path, o) => element.openFile(path, o), search: q => element.search(q), destroy: () => element.remove() };
}
