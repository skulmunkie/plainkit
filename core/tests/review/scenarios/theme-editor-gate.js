// The theme editor's export gate (#107): a theme with a failing text pair lists it on the Export tab, and Copy CSS opens the "Export anyway" confirm.
// Both states must fit the width at desktop and phone, in both themes, with nothing overlapping.
import { mountThemeEditor } from '../../../modules/theme-editor/theme-editor.js';

const A = '#te-g';

export default {
    name: 'theme-editor-gate',
    issue: [107],
    elements: ['tabs', 'dialog', 'alert', 'button', 'card'],
    html: '<pk-card heading="Theme editor"><div id="te-g"></div></pk-card>',
    async setup(frame) {
        const a = frame.querySelector(A);
        await mountThemeEditor(a, { target: a, storageKey: false, preview: false, height: '34rem', initial: { shared: {}, dark: { '--color-link': '#2a2a55' }, light: {} } });
    },
    steps: [
        { waitFor: `${A} pk-tab[value=export]` }, { click: `${A} pk-tab[value=export]`, on: ['desktop'] }, { focus: `${A} pk-tab[value=tokens]`, on: ['phone'] }, { key: 'End', on: ['phone'] }, { key: 'ArrowLeft', on: ['phone'] }, { key: 'Enter', on: ['phone'] }, { waitFor: `${A} [data-export-gate] pk-alert` }, { shot: 'listed' },
        { click: `${A} pk-button[data-export=css]` }, { wait: 300 }, { shot: 'confirm' },
    ],
    expect(t) {
        t.ok(t.metric('html', 'scrollWidth') <= t.metric('html', 'clientWidth') + 1, 'the page scrolls sideways');
        t.visible(`${A} [data-export-gate] pk-alert`, 'the failing pairs');
        if (t.shot === 'confirm') { t.visible('pk-dialog[open] pk-button[data-result=ok]', 'the confirm button'); t.inViewport('pk-dialog[open] pk-button[data-result=ok]'); }
    },
};
