// The dev tools as a module: mountDevTools(container, options) puts the SDK's live tools (console, logs, logging settings, performance, and any panel you add)
// in one tabbed surface, either docked over the page (Ctrl+` toggles it, like a browser's dev tools) or inline in a container.
// Built only from SDK components (pk-tabs, pk-button, pk-button-group) around the console, logs, log settings and performance modules, plus the Quality
// (the SDK page checks on the live page), Inspector (pk-* elements on the page), Theme (the theme editor, live on this page) and Layout builder
// (a scratch instance of the layout builder module) panels in panels.js. The floating/docking/resize/hotkey shell is the generic
// tool-dock module (../tool-dock/tool-dock.js); mountDevTools is a thin consumer of it, its own BUILT_IN panels passed in as tool-dock's `panels`.
//
//   const tools = await mountDevTools(null, { mode: 'dock' });      // a floating button and a bottom dock on any page
//   const page  = await mountDevTools(el, { mode: 'inline' });      // the same tabs, filling a container
//   tools.toggle(); tools.select('console');
//
// Options: mode ('dock' | 'inline'; default 'dock'), hotkey (dock only; default 'Ctrl+`', '' turns it off), tab (first tab), open (dock
// only; start open), size ('small' | 'medium' | 'large'; dock height, default 'medium'), theme, panels (extra tabs, below).
// A panel is { id, title, mount(element, context) } where mount returns nothing or { destroy(), activate(), deactivate() }; activate and
// deactivate are called as its tab is shown and hidden, so a panel can pause work while unseen. context is { doc, win, theme, whileHidden(fn), isTool(el) }.
// Returns { open(), close(), toggle(), isOpen(), select(id), tabs(), destroy() }.

import { mountPerformance } from '../performance/performance.js';
import { mountConsole } from '../console/console.js';
import { mountLogs } from '../logs/logs.js';
import { mountLogSettings } from '../log-settings/log-settings.js';
import { mountToolDock } from '../tool-dock/tool-dock.js';
import { qualityPanel, inspectorPanel, themePanel, layoutBuilderPanel } from './panels.js';

// The built-in panels, in the shape a panel of your own takes. Console mounts first so it records from the start.
export const BUILT_IN = Object.freeze([
    { id: 'console', title: 'Console', mount: async el => { const c = await mountConsole(el, {}); return { destroy: () => c.destroy() }; } },
    // Logs is the SDK logger's entries (js/log.js), not console output; Logging is where its level and outputs are set.
    { id: 'logs', title: 'Logs', mount: async el => { const l = await mountLogs(el, {}); return { destroy: () => l.destroy() }; } },
    { id: 'logging', title: 'Logging', mount: async el => { const s = await mountLogSettings(el, {}); return { destroy: () => s.destroy(), activate: () => s.refresh() }; } },
    {
        id: 'performance', title: 'Performance',
        mount: async el => { const p = await mountPerformance(el, { autostart: false }); return { destroy: () => p.destroy(), activate: () => p.start(), deactivate: () => p.stop() }; },
    },
    qualityPanel,
    inspectorPanel,
    themePanel,
    layoutBuilderPanel,
]);

export async function mountDevTools(container, options = {}) {
    const all = [...BUILT_IN, ...(options.panels ?? [])];
    return mountToolDock(container, { ...options, panels: all, label: 'Dev tools', launcherLabel: 'Dev tools' });
}
