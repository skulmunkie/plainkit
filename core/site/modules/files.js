// The Files page as a module of the site app (#355, step 6a): the code explorer on the SDK's own source. The file list is the lean index.json and each file's text is fetched
// same-origin on demand (LazyProvider), as the standalone page did. Address: #/files, #/files?path=components/tabs/tabs.js&line=12 opens that file at that line.
import { defineModule } from '../../js/app.js';
import { mountCodeExplorer } from '../../modules/code-explorer/code-explorer.js';
import { LazyProvider } from '../../modules/code-explorer/providers.js';

// 75dvh keeps the explorer, the bar and the breadcrumb inside one screen (a 'fill' height overflowed the content area by the breadcrumb). core/ is two folders up from here
const mount = query => async (host, ctx) => {
    const provider = await LazyProvider.connect(new URL('../files/index.json', import.meta.url).href, new URL('../../', import.meta.url));
    const explorer = await mountCodeExplorer(host, { provider, height: '75dvh', file: query.path || 'tokens/tokens.css', line: Number(query.line) || undefined, theme: ctx.theme.name });
    const stop = ctx.theme.subscribe(name => explorer.element.setAttribute('theme', name));
    return () => { stop(); explorer.destroy?.(); };
};

export default defineModule({
    id: 'files', title: 'Files', icon: 'docs',
    routes: [{ path: '*', page: 'custom', config: ({ query }) => ({ mount: mount(query ?? {}) }) }],
});
