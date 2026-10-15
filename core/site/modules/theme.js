// The Theme editor as a module of the site app (#355, step 6b): a thin host on modules/theme-editor. The module lists every token, edits the page live, grades the text pairs and
// exports or imports the override block; this adds the SDK scorecard's text pairs and the storage key the editor has always used. The editor's own Dark/Light switch sets data-theme
// on <html>, which the app's theme (ctx.theme) already follows and keeps, so no bridge is needed. Address: #/theme (a shared theme in the address fragment, #pk-theme=..., applies).
import { defineModule } from '../../js/app.js';
import { observeElements } from '../../js/loader.js';
import { mountThemeEditor } from '../../modules/theme-editor/theme-editor.js';
import { TEXT_PAIRS } from '../scorecard/scoring.data.js';

const mount = async host => {
    // the editor draws tables and accordions after the app scanned the page: load their elements as they are added
    const watch = observeElements(host);
    const editor = await mountThemeEditor(host, { pairs: TEXT_PAIRS, storageKey: 'pk-theme-overrides', readHash: true });
    return () => { watch?.disconnect(); editor.destroy?.(); };
};

export default defineModule({
    id: 'theme', title: 'Theme editor', icon: 'palette', widgets: { scheme: { load: async ({ ctx }) => ({ value: String(ctx.settings?.get('theme') ?? 'system'), subtext: 'switch it from the settings menu' }) } },
    routes: [{ path: '*', page: 'custom', config: { mount } }],
});
