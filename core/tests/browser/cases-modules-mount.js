// A mount sweep of every tool module in dist (#682): each is mounted with its default options (and the options that change what runs: a theme, no network, blocked
// storage, the preview on) and must neither throw, reject or raise an uncaught error, nor log an error of its own. It exists because a mechanical edit once made one module throw on
// its default mount while every other case (which mounted it with the preview off) stayed green. Same shape as cases.js.
import { getLogBuffer } from '../../js/log.js';

const wait = ms => new Promise(r => setTimeout(r, ms));
// The shipped unit when it has the module (dist/modules), else the source (the audit dashboard and the field group are not in the modules unit).
const load = async name => { try { return await import(new URL(`../../dist/modules/${name}/${name}.js`, import.meta.url).href); } catch (e) { return import(new URL(`../../modules/${name}/${name}.js`, import.meta.url).href); } };

// What each module needs to mount at all (the options a caller must give), and the variants that change what runs.
const MODULES = [
    { name: 'audit-dashboard', fn: 'mountAuditDashboard', base: {} },
    { name: 'code-explorer', fn: 'mountCodeExplorer', base: { snapshot: { version: 1, files: [{ path: 'a.js', text: 'const a = 1;\n', size: 13 }] } } },
    { name: 'console', fn: 'mountConsole', base: {} },
    { name: 'devtools', fn: 'mountDevTools', base: { mode: 'inline' } },
    { name: 'field-group', fn: 'mountFieldGroup', base: { fields: [{ key: 'name', label: 'Name', kind: 'text' }], data: { name: 'a' } } },
    { name: 'layout-builder', fn: 'mountLayoutBuilder', base: {} },
    { name: 'log-settings', fn: 'mountLogSettings', base: {} },
    { name: 'logs', fn: 'mountLogs', base: {} },
    { name: 'performance', fn: 'mountPerformance', base: { autostart: false } },
    { name: 'quality', fn: 'mountQuality', base: {} },
    { name: 'scorecard', fn: 'mountScorecard', base: { sections: ['ranked'], targets: [{ name: 'Card', html: '<p>Fine</p>' }], themes: ['dark'], widths: [375] } },
    { name: 'theme-editor', fn: 'mountThemeEditor', base: {} },
    { name: 'tool-dock', fn: 'mountToolDock', base: { label: 'Tools', launcherLabel: 'Open tools', tabs: [] } },
];
const VARIANTS = {
    defaults: { opts: {}, errorsAllowed: false },
    themed: { opts: { theme: 'dark', height: '20rem' }, errorsAllowed: false },
    'every button pressed': { opts: {}, errorsAllowed: false, press: true },
    'no network': { opts: {}, errorsAllowed: true, offline: true },
    'storage blocked': { opts: {}, errorsAllowed: true, blocked: true },
};

async function sweep(t, mod, name, v) {
    const host = t.stage(''), problems = [];
    // A ResizeObserver loop notice is the browser's own benign warning (a layout settled in two frames), not an error of the module.
    const onError = e => /ResizeObserver loop/.test(e.message ?? '') || problems.push(`uncaught: ${e.message ?? e.reason?.message ?? e.reason}`);
    window.addEventListener('error', onError); window.addEventListener('unhandledrejection', onError);
    const realFetch = window.fetch, realGet = Storage.prototype.getItem, realSet = Storage.prototype.setItem;
    const logged = getLogBuffer().length;
    if (v.offline) window.fetch = () => Promise.reject(new TypeError('Failed to fetch'));
    if (v.blocked) { Storage.prototype.getItem = () => { throw new Error('blocked'); }; Storage.prototype.setItem = () => { throw new Error('blocked'); }; }
    let handle;
    try {
        const m = await load(mod.name);
        handle = await m[mod.fn](host, { ...mod.base, ...v.opts });
        await wait(700);
        // Press every enabled button once (not the ones that open a file picker or leave the page): each handler a module wires runs at least once.
        if (v.press) { for (const b of [...host.querySelectorAll('pk-button, button')]) { if (!b.hasAttribute('disabled') && !/import|export|copy|download|open in/i.test(b.textContent)) b.click(); await wait(30); } await wait(400); }
    } catch (e) { if (!(v.offline && /fetch/i.test(e.message))) problems.push(`threw: ${e.message}`); } // with no network a module that needs a file may refuse to mount: that is a rejection, not a crash
    finally {
        window.fetch = realFetch; Storage.prototype.getItem = realGet; Storage.prototype.setItem = realSet;
        window.removeEventListener('error', onError); window.removeEventListener('unhandledrejection', onError);
    }
    if (!v.errorsAllowed) for (const e of getLogBuffer().slice(logged)) if (e.level === 'error') problems.push(`logged error ${e.scope}: ${e.message}`);
    try { handle?.destroy?.(); } catch (e) { problems.push(`destroy threw: ${e.message}`); }
    t.eq(problems.join(' | '), '', `${mod.name} (${name})`);
}

export const moduleMountCases = MODULES.map(mod => [`module mount sweep: ${mod.name} mounts and tears down with its defaults, a theme, no network and blocked storage without a thrown or logged error`, async t => {
    for (const [name, v] of Object.entries(VARIANTS)) await sweep(t, mod, name, v);
}]);
