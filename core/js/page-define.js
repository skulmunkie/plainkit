// definePage (#1929 step 5; STANDARDS "Page types"): the one place a built-in page type factory's boilerplate lives. Not in the app entry graph: the page-type chunks import it.
//   export default definePage({ tag: 'pk-tool-page', data: c => ({ ... }), wire: (el, c, ctx) => { el.run = v => c.run(v, ctx); } });
// tag: the page element. data(config, ctx): what becomes el.config (default: the config as given). wire(el, config, ctx, host): sets the callbacks and listeners; it may return
// a cleanup that runs when the page unmounts (before the element is removed). title: the config key of the h1 (default 'heading'). plain: keep the heading's own size.
// The result is the factory (host, config, ctx) => cleanup, which is also a thenable once the page is in (mountTitled).
import { mountTitled } from './page-shell.js';
import { disposeWith } from './page-lifecycle.js';

export const definePage = ({ tag, data, wire, title = 'heading', plain }) => (host, config = {}, ctx) => {
    const el = host.ownerDocument.createElement(tag);
    el.config = data ? data(config, ctx) : config;
    const end = wire?.(el, config, ctx, host);
    const mounted = mountTitled(host, el, config[title], plain ? { plain } : undefined);
    return typeof end === 'function' ? disposeWith(mounted, end) : mounted;
};
