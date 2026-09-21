// The logging settings as a module: mountLogSettings(container, options) edits how js/log.js behaves: the global level, a level for any
// scope (the scopes that have logged so far are listed; add one by name), and which outputs each level is sent to (console, toast,
// alert and any output registered with registerLogOutput). "Send a test" logs one entry per level under the scope settings-test, using
// the settings as edited (for this page only); Save keeps them in localStorage (configureLogging(..., { persist: true })); Reset goes
// back to the defaults (resetLogging()). ?pk-log= in the address and <html data-pk-log> still decide the level when the page loads.
// Built only from SDK components (pk-select, pk-input, pk-field, pk-table, pk-checkbox, pk-button, pk-badge, pk-alert, pk-stack,
// pk-cluster); it draws nothing itself. Every value is checked with normalizeConfig before it is applied.
//
//   const settings = await mountLogSettings(el, { onsave: config => console.log(config) });
//
// Options: theme, height (any CSS length, or 'fill'), onsave(config), onchange(draft). Returns { config(), refresh(), save(), reset(), test(), destroy() }.
// Pure logic is js/log-settings-logic.js.

import { configureLogging, getLoggingConfig, resetLogging, getLogBuffer, getLogOutputs, addLogSink, createLogger } from '../js/log.js';
import { INHERIT, draftFrom, configFrom, scopeRows, addScope, removeScope, setScopeLevel, setGlobalLevel, setRoute, routeRows, sameDraft, levelOverride, describeOverride, outputsFor, testMessages, TEST_SCOPE } from '../js/log-settings-logic.js';
import { ensureStyles, styleUrls } from '../js/mount-support.js';
import { loadElements } from '../js/loader.js';

const STYLES = ['../plainkit.css'];
const OWN_STYLES = ['./log-settings.css'];

const LEVEL_OPTIONS = [['debug', 'Debug (everything)'], ['info', 'Info'], ['warn', 'Warn'], ['error', 'Error (errors only)'], ['silent', 'Silent (nothing)']];
const LEVEL_NAMES = { debug: 'Debug', info: 'Info', warn: 'Warn', error: 'Error' };

function h(doc, tag, props = {}, ...children) {
    const el = doc.createElement(tag);
    for (const [k, v] of Object.entries(props)) if (v !== undefined && v !== null && v !== false) el.setAttribute(k, v === true ? '' : v);
    el.append(...children.filter(c => c !== null && c !== undefined));
    return el;
}
const options = (doc, list, selected) => list.map(([value, label]) => h(doc, 'option', { value, selected: value === selected }, label));

export async function mountLogSettings(container, opts = {}) {
    const { theme, height, onsave, onchange } = opts;
    const doc = container.ownerDocument;
    const win = doc.defaultView;
    await ensureStyles([...styleUrls(STYLES, import.meta.url), ...styleUrls(OWN_STYLES, import.meta.url)], doc);

    const seen = new Set(getLogBuffer().map(e => e.scope));
    const unsink = addLogSink(e => { if (!seen.has(e.scope)) { seen.add(e.scope); } });
    let saved = draftFrom(getLoggingConfig(), [...seen]);
    let draft = saved;
    let message = '';

    // ---- the shell: SDK components only ---------------------------------------------------------------------------------------
    const overrideNote = h(doc, 'pk-alert', { kind: 'info', hidden: true });
    const levelSelect = h(doc, 'pk-select', { label: 'Global level' }, ...options(doc, LEVEL_OPTIONS, draft.level));
    const levelField = h(doc, 'pk-field', { label: 'Global level', description: 'Entries below this level are kept in the logs viewer but not sent to any output. A scope below can override it.' }, levelSelect);
    const scopeTable = h(doc, 'pk-table', { label: 'Level per scope', density: 'compact', cards: true, manual: true, columns: JSON.stringify([{ key: 'scope', label: 'Scope' }, { key: 'level', label: 'Level' }, { key: 'remove', label: '' }]) },
        h(doc, 'pk-empty-state', { slot: 'empty', tone: 'compact', heading: 'No scopes yet', description: 'A scope is listed once it has logged. Add one by name to set its level ahead of time.' }));
    const newScope = h(doc, 'pk-input', { label: 'Add a scope', placeholder: 'checkout' });
    const addBtn = h(doc, 'pk-button', { variant: 'secondary' }, 'Add scope');
    const routeTable = h(doc, 'pk-table', { label: 'Where each level is sent', density: 'compact', manual: true });
    const status = h(doc, 'span', { class: 'muted', role: 'status' });
    const testBtn = h(doc, 'pk-button', { variant: 'secondary' }, 'Send a test');
    const saveBtn = h(doc, 'pk-button', { variant: 'primary' }, 'Save');
    const resetBtn = h(doc, 'pk-button', { variant: 'ghost' }, 'Reset');
    const root = h(doc, 'section', { class: 'ls-module', 'aria-label': 'Logging settings' },
        h(doc, 'pk-stack', { gap: 'md' },
            overrideNote,
            levelField,
            h(doc, 'pk-stack', { gap: 'sm' }, h(doc, 'h3', { class: 'ls-heading' }, 'Level per scope'), scopeTable, h(doc, 'pk-cluster', { align: 'end' }, newScope, addBtn)),
            h(doc, 'pk-stack', { gap: 'sm' }, h(doc, 'h3', { class: 'ls-heading' }, 'Where each level goes'), routeTable),
            h(doc, 'pk-cluster', {}, testBtn, saveBtn, resetBtn, status)));
    if (theme) root.setAttribute('data-theme', theme);
    if (height) { root.style.setProperty('height', height === 'fill' ? '100%' : height); root.style.setProperty('overflow', 'auto'); }
    container.replaceChildren(root);
    loadElements(root).catch(() => { /* loadElements logs its own failures */ });

    // ---- drawing: rebuilt from the draft; the table cells are slotted SDK controls ---------------------------------------------
    const changed = () => !sameDraft(draft, saved);
    function drawOverride() {
        const o = levelOverride({ search: win.location?.search ?? '', attr: doc.documentElement.getAttribute('data-pk-log') });
        overrideNote.hidden = !o;
        overrideNote.textContent = o ? `The level is being set by ${describeOverride(o)} whenever this page loads, so it wins over the saved level. Scope levels and outputs below still apply.` : '';
    }

    function drawScopes() {
        const rows = scopeRows(draft);
        const cells = [];
        for (const r of rows) {
            const select = h(doc, 'pk-select', { slot: `cell-${r.id}-level`, label: `Level for ${r.scope}`, value: r.level }, ...options(doc, [[INHERIT, 'Same as global'], ...LEVEL_OPTIONS], r.level));
            select.addEventListener('pk-value-change', e => { draft = setScopeLevel(draft, r.scope, e.detail.value); touched(); });
            const remove = h(doc, 'pk-button', { slot: `cell-${r.id}-remove`, variant: 'ghost', size: 'mini', label: `Remove ${r.scope}` }, 'Remove');
            remove.addEventListener('click', () => { draft = removeScope(draft, r.scope); drawScopes(); touched(); });
            cells.push(select, remove);
        }
        scopeTable.replaceChildren(...cells, h(doc, 'pk-empty-state', { slot: 'empty', tone: 'compact', heading: 'No scopes yet', description: 'A scope is listed once it has logged. Add one by name to set its level ahead of time.' }));
        scopeTable.setAttribute('rows', JSON.stringify(rows.map(r => ({ id: r.id, scope: r.scope }))));
        loadElements(scopeTable).catch(() => { /* loadElements logs its own failures */ });
    }

    function drawRoutes() {
        const outputs = outputsFor(getLogOutputs(), draft.routes);
        const rows = routeRows(draft, outputs);
        routeTable.setAttribute('columns', JSON.stringify([{ key: 'level', label: 'Level' }, ...outputs.map(o => ({ key: o, label: o }))]));
        const cells = [];
        for (const r of rows) {
            for (const o of outputs) {
                const box = h(doc, 'pk-checkbox', { slot: `cell-${r.id}-${o}`, label: `${LEVEL_NAMES[r.level]} to ${o}`, checked: r[o] });
                box.addEventListener('pk-change', e => { draft = setRoute(draft, r.level, o, Boolean(e.detail.checked)); touched(); });
                cells.push(box);
            }
        }
        routeTable.replaceChildren(...cells);
        routeTable.setAttribute('rows', JSON.stringify(rows.map(r => ({ id: r.id, level: LEVEL_NAMES[r.level] }))));
        loadElements(routeTable).catch(() => { /* loadElements logs its own failures */ });
    }

    function touched() {
        status.textContent = message || (changed() ? 'Changes not applied yet: Save applies and keeps them' : 'Settings in use');
        saveBtn.toggleAttribute('disabled', !changed());
        onchange?.(configFrom(draft));
    }
    const say = text => { message = text; touched(); message = ''; };

    function drawAll() {
        levelSelect.setAttribute('value', draft.level);
        drawOverride(); drawScopes(); drawRoutes(); touched();
    }

    // ---- controls -------------------------------------------------------------------------------------------------------------
    levelSelect.addEventListener('pk-value-change', e => { draft = setGlobalLevel(draft, e.detail.value); touched(); });
    const add = () => {
        const r = addScope(draft, newScope.value ?? newScope.getAttribute('value'));
        if (r.error) { newScope.setAttribute('invalid', ''); say(r.error); return; }
        newScope.removeAttribute('invalid'); newScope.value = ''; newScope.setAttribute('value', '');
        draft = r.draft; drawScopes(); touched();
    };
    addBtn.addEventListener('click', add);
    newScope.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); add(); } });

    const api = {
        config: () => configFrom(draft),
        refresh() { saved = draftFrom(getLoggingConfig(), [...seen]); draft = saved; drawAll(); },
        // Applies the draft to this page only (not saved) and logs one entry per level, so a route or level can be tried out before saving.
        test() {
            configureLogging(configFrom(draft), { replace: true });
            const log = createLogger(TEST_SCOPE);
            for (const [level, text] of testMessages()) log[level](text, { sentAt: new Date().toISOString() });
            seen.add(TEST_SCOPE);
            say('Sent one message per level, using these settings for this page. Save keeps them.');
        },
        save() {
            const config = configureLogging(configFrom(draft), { persist: true, replace: true });
            saved = draftFrom(config, [...seen]); draft = saved;
            drawAll(); say('Saved');
            onsave?.(config);
            return config;
        },
        reset() {
            resetLogging();
            saved = draftFrom(getLoggingConfig(), [...seen]); draft = saved;
            drawAll(); say('Back to the defaults');
        },
        destroy() { unsink(); root.remove(); },
    };
    testBtn.addEventListener('click', () => api.test());
    saveBtn.addEventListener('click', () => api.save());
    resetBtn.addEventListener('click', () => api.reset());

    drawAll();
    return api;
}
