// The Layout builder in the gallery (#1996): the builder is an app of its own (site/builder/), so this module is only the way to it.
// The same code mounts as a module in any host: modules/layout-builder's mountLayoutBuilder.
import { defineModule } from '../../js/app.js';

const mount = async host => {
    const h = (tag, text, attrs = {}) => Object.assign(host.ownerDocument.createElement(tag), { textContent: text }, attrs);
    host.replaceChildren(h('h2', 'Layout builder'), h('p', 'The builder is an app of its own and fills the whole screen.'), h('a', 'Open the layout builder', { href: 'site/builder/index.html' }));
};

export default defineModule({
    id: 'layout-builder', title: 'Layout builder', icon: 'layout',
    routes: [{ path: '*', page: 'custom', config: { mount } }],
});
