// The theme editor module (issue 682): an editor in a card, scoped to that card (it edits a theme on the card, not on the page) with a fixed height so the tabs scroll inside it. The
// states: the token list, the Presets tab and the Preview tab (the sample the preview frame renders). The storage-blocked state is the scenario theme-editor-blocked. Every state must fit
// the width at desktop and phone, in both themes, with nothing overlapping.
import { mountThemeEditor } from '../../../modules/theme-editor/theme-editor.js';

const A = '#te-a';

export default {
    name: 'theme-editor',
    issue: [682],
    elements: ['tabs', 'table', 'input', 'card'],
    html: '<pk-card heading="Theme editor"><div id="te-a"></div></pk-card>',
    async setup(frame) {
        const a = frame.querySelector(A);
        await mountThemeEditor(a, { target: a, storageKey: false, height: '34rem' });
    },
    steps: [
        { wait: 800 }, { shot: 'tokens' },
        { click: `${A} pk-tab[value=presets]` }, { wait: 300 }, { shot: 'presets' },
        { click: `${A} pk-tab[value=preview]`, on: ['desktop'] }, { wait: 1200, on: ['desktop'] }, { shot: 'preview', on: ['desktop'] },
    ],
    expect(t) {
        t.ok(t.metric('html', 'scrollWidth') <= t.metric('html', 'clientWidth') + 1, 'the page scrolls sideways');
        t.visible(`${A} pk-tabs`, 'the tab bar'); t.inViewport(`${A} pk-tabs`);
        if (t.shot === 'tokens') t.visible(`${A} pk-input, ${A} pk-colour-input`, 'a token control');
        if (t.shot === 'preview') { t.visible(`${A} iframe`, 'the preview frame'); t.inViewport(`${A} iframe`); }
    },
};
