// The dev tools page: the same tabs as the dock, inline, watching this very page. The dock itself is available on any page with
// mountDevTools(null, { mode: 'dock' }) (Ctrl+` toggles it); this page passes mode 'inline' so the tools fill the page.
import { mountShell } from '../shell.js';
import { mountDevTools } from '../../modules/devtools/devtools.js';

mountShell({ page: 'devtools', title: 'Dev tools' });
await mountDevTools(document.getElementById('devtools'), { mode: 'inline' });
console.info('Dev tools mounted: this line was captured by the console panel.');
