import { mountShell } from '../shell.js';
import { mountCodeExplorer } from '../../modules/code-explorer/code-explorer.js';
mountShell({ page: 'files', title: 'SDK files' });

// Deep link: files/#path=components/tabs/tabs.js&line=12 opens that file at that line.
const link = new URLSearchParams(location.hash.slice(1));
const explorer = mountCodeExplorer(document.querySelector('.site-body'), {
    snapshot: 'snapshot.json', height: 'fill', file: link.get('path') || 'tokens/tokens.css', line: Number(link.get('line')) || undefined,
    theme: document.documentElement.getAttribute('data-theme'),
});
explorer.catch(error => {
    const n = document.createElement('div');
    n.className = 'notice notice--error gx-notice-file';
    n.textContent = `Could not load snapshot.json: ${error.message}. Run node core/tools/snapshot.mjs to regenerate it.`;
    document.body.append(n);
});
document.addEventListener('site-theme', async e => (await explorer).element.setAttribute('theme', e.detail));
