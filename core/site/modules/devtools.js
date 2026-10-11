// The dev tools page: the same tabs as the dock, inline, watching this very page.
import { moduleFromMount } from '../../js/app.js';
import { mountDevTools } from '../../modules/devtools/devtools.js';

export default moduleFromMount(mountDevTools, { id: 'devtools', title: 'Dev tools', options: { mode: 'inline' } });
