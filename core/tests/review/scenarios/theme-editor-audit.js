// The theme editor's "Audit gallery pages" (#107, step 4): after the button is pressed with a failing edit, the results list each colour pair below AA with its jump buttons.
// The pair list holds only text on the page background, so the failing link colour is a pair only the audit finds. The list must fit the width at desktop and phone, in both themes, with nothing overlapping.
import { mountThemeEditor } from '../../../modules/theme-editor/theme-editor.js';

const A = '#te-a';

export default {
    name: 'theme-editor-audit',
    issue: [107],
    elements: ['tabs', 'alert', 'button', 'badge', 'card'],
    html: '<pk-card heading="Theme editor"><div id="te-a"></div></pk-card>',
    async setup(frame) {
        const a = frame.querySelector(A);
        await mountThemeEditor(a, { target: a, storageKey: false, preview: false, auditSettleMs: 300, pairs: [['--color-text', '--color-bg']], initial: { shared: {}, dark: { '--color-link': '#2a2a55' }, light: {} } });
    },
    steps: [
        { waitFor: `${A} pk-tab[value=contrast]` }, { click: `${A} pk-tab[value=contrast]`, on: ['desktop'] }, { focus: `${A} pk-tab[value=tokens]`, on: ['phone'] }, { key: 'End', on: ['phone'] }, { key: 'ArrowLeft', on: ['phone'] }, { key: 'ArrowLeft', on: ['phone'] }, { key: 'Enter', on: ['phone'] },
        { waitFor: `${A} [data-audit=run]` }, { shot: 'idle' },
        { click: `${A} [data-audit=run]` }, { waitFor: `${A} [data-audit-row]` }, { wait: 300 }, { shot: 'results' },
    ],
    expect(t) {
        t.ok(t.metric('html', 'scrollWidth') <= t.metric('html', 'clientWidth') + 1, 'the page scrolls sideways');
        t.visible(`${A} [data-audit=run]`, 'the audit button');
        if (t.shot === 'results') t.visible(`${A} [data-audit-row]`, 'a failing colour pair');
    },
};
