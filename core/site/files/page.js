import { mountShell } from '../shell.js';
import { mountCodeExplorer } from '../../modules/code-explorer/code-explorer.js';
import { LazyProvider } from '../../modules/code-explorer/providers.js';
mountShell({ page: 'files', title: 'SDK files' });

// Deep link: files/#path=elements/tabs/tabs.js&line=12 opens that file at that line.
const link = new URLSearchParams(location.hash.slice(1));
// The live default (issue 196): a lean file list up front, each file's real text fetched same-origin, on demand, from this
// page's own copy of core/ (../../ from here, both locally and in the Pages deploy: build-pages.mjs mirrors core/'s own
// top-level layout, so the same relative path resolves either way). A page that wants the whole tree embedded up front
// instead (offline, no fetch per file) can still pass { snapshot: 'snapshot.json' } to mountCodeExplorer.
const explorer = LazyProvider.connect('index.json', new URL('../../', import.meta.url)).then(provider => mountCodeExplorer(document.querySelector('.site-body'), {
    provider, height: 'fill', file: link.get('path') || 'tokens/tokens.css', line: Number(link.get('line')) || undefined,
    theme: document.documentElement.getAttribute('data-theme'),
}));
explorer.catch(error => {
    const n = document.createElement('pk-alert');
    n.setAttribute('kind', 'danger');
    n.className = 'gx-notice-file';
    n.textContent = `Could not load index.json: ${error.message}. Run node core/tools/snapshot.mjs to regenerate it.`;
    document.body.append(n);
});
document.addEventListener('site-theme', async e => (await explorer).element.setAttribute('theme', e.detail));
