// The theme editor module when localStorage is blocked (a private window): saved themes cannot be read, so the Presets tab says "this browser blocks storage" and the editor still works
// until the page closes. The note must be visible and fit the width at desktop and phone, in both themes.
import { mountThemeEditor } from '../../../modules/theme-editor/theme-editor.js';

const B = '#te-b';

export default {
    name: 'theme-editor-blocked',
    issue: [682],
    elements: ['tabs', 'alert', 'card'],
    html: '<pk-card heading="Theme editor, storage blocked"><div id="te-b"></div></pk-card>',
    async setup(frame) {
        const b = frame.querySelector(B);
        const real = Storage.prototype.getItem;
        Storage.prototype.getItem = () => { throw new Error('storage is blocked'); };
        try { await mountThemeEditor(b, { target: b, storageKey: false, height: '34rem' }); } finally { Storage.prototype.getItem = real; }
    },
    steps: [{ wait: 800 }, { click: `${B} pk-tab[value=presets]` }, { wait: 400 }, { shot: 'presets' }],
    expect(t) {
        t.ok(t.metric('html', 'scrollWidth') <= t.metric('html', 'clientWidth') + 1, 'the page scrolls sideways');
        t.visible(`${B} pk-tab-panel[value=presets] pk-alert`, 'the storage note');
        t.hasText(`${B} pk-tab-panel[value=presets] pk-alert`, 'blocks storage');
    },
};
