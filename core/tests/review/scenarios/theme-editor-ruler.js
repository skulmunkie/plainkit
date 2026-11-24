// The theme editor's breakpoint ruler (#124, step 5): presets added, a row renamed, an empty one flagged. The ruler list, the rows and the presets must fit the width at desktop and phone,
// in both themes, with nothing overlapping.
import { mountThemeEditor } from '../../../modules/theme-editor/theme-editor.js';

const A = '#te-r';

export default {
    name: 'theme-editor-ruler',
    issue: [124],
    elements: ['tabs', 'input', 'button', 'badge', 'alert', 'card', 'cluster'],
    html: '<pk-card heading="Theme editor"><div id="te-r"></div></pk-card>',
    async setup(frame) {
        const a = frame.querySelector(A);
        await mountThemeEditor(a, { target: a, storageKey: false, preview: false, savedKey: false, height: '40rem' });
    },
    steps: [
        { waitFor: `${A} pk-tab[value=sdk]` }, { click: `${A} pk-tab[value=sdk]`, on: ['desktop'] }, { focus: `${A} pk-tab[value=tokens]`, on: ['phone'] }, { key: 'End', on: ['phone'] }, { key: 'Enter', on: ['phone'] },
        { waitFor: `${A} [data-preset=laptop]` }, { shot: 'start' },
        { click: `${A} [data-preset=laptop]` }, { click: `${A} [data-preset=slate]` }, { click: `${A} [data-preset=ultrawide]` }, { wait: 200 }, { scroll: `${A} pk-tabs`, to: 300 }, { wait: 100 }, { shot: 'presets' },
        { click: `${A} [data-sdk=add-extra]` }, { wait: 200 }, { scroll: `${A} pk-tabs`, to: 560 }, { wait: 100 }, { shot: 'invalid' },
    ],
    expect(t) {
        t.ok(t.metric('html', 'scrollWidth') <= t.metric('html', 'clientWidth') + 1, 'the page scrolls sideways');
        t.visible(`${A} [data-preset=laptop]`, 'the presets');
        if (t.shot !== 'start') t.visible(`${A} [data-ruler-mark=laptop]`, 'a breakpoint of your own in the ruler');
    },
};
