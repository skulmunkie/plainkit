// The Gallery's slim page bar on pk-toolbar (#682), in the real app: a full-page sample (Back, title, Display, theme, Open) must stay one row
// at desktop and phone width, with its Display menu open. The preview bar is covered by app-gallery.
import { mountApp } from '../../../js/app.js';

export default {
    name: 'gallery-toolbars',
    issue: [682],
    elements: ['toolbar'],
    html: '<div id="app"></div>',
    setup(frame) {
        history.replaceState(null, '', '#/gallery/samples/layouts/shell');
        globalThis.__app = mountApp(frame.querySelector('#app'), {
            brand: { text: 'Plainkit' }, home: 'gallery', search: false,
            modules: [{ id: 'gallery', title: 'Gallery', load: () => import('../../../site/modules/gallery.js') }],
        });
    },
    steps: [
        { wait: 'settle' }, { wait: 2500 }, { shot: 'pagebar' },
        { click: '#gx-pagebar pk-dropdown pk-button' }, { wait: 500 }, { shot: 'pagebar-menu' },
    ],
    expect(t) {
        t.visible('#gx-pagebar'); t.visible('#gx-title'); t.visible('#gx-open');
        t.noOverlap('#gx-back', '#gx-title'); t.noOverlap('#gx-title', '#gx-open');
        t.inViewport('#gx-open');
    },
};
