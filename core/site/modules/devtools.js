// The dev tools page: the same tabs as the dock, inline, watching this very page.
import { defineModule } from '../../js/app.js';
import { observeElements } from '../../js/loader.js';
import { mountDevTools } from '../../modules/devtools/devtools.js';

const mount = async host => {
    // the tabs draw their accordions after the app scanned the page: load the elements as they are added
    const watch = observeElements(host);
    const handle = await mountDevTools(host, { mode: 'inline' });
    return () => { watch?.disconnect(); handle?.destroy?.(); };
};

export default defineModule({ id: 'devtools', title: 'Dev tools', routes: [{ path: '*', page: 'custom', config: { mount } }] });
