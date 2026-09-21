// PlainKit.Blazor's own dev tools panels, in the shape mountDevTools takes: { id, title, mount(element, context) }. Blazor owns this file; the SDK knows nothing
// about it. Everything shown is read from something that can be observed: the .NET side (PkDevToolsHost: the circuit handler's events, the runtime, the bridge's
// call log), the browser (the reconnect UI's events) and the SDK's log buffer. Nothing is estimated. Built from SDK components only (pk-card, pk-table, pk-button,
// pk-select, pk-cluster, pk-badge) plus the SDK's element inspector for the Components panel.
//
//   blazorPanels(host)        -> [Blazor panel, Components panel]; host is the DotNetObjectReference of a PkDevToolsHost
//   blazorInspectorSections(host) -> the extraSections for createElementInspector(...).show({ meta, element, extraSections }): a "Blazor" section with the
//                                    component, its parameters (type, element default, two-way) and the equivalent Razor markup, built from blazor/mappings on the .NET side.
import { getLogBuffer } from './plainkit/js/log.js';
import { loadElements } from './plainkit/js/loader.js';
import { createElementInspector } from './plainkit/js/element-inspector.js';

const API_URL = new URL('./plainkit/elements/api.json', import.meta.url);

function h(doc, tag, props = {}, ...children) {
    const el = doc.createElement(tag);
    for (const [k, v] of Object.entries(props)) if (v !== undefined && v !== null && v !== false) el.setAttribute(k, v === true ? '' : v);
    el.append(...children.filter(c => c !== null && c !== undefined));
    return el;
}

// replaceChildren turns a null into the text "null": drop the ones that are not there.
export const compact = (...nodes) => nodes.filter(n => n !== null && n !== undefined && n !== false);

const table = (doc, label, columns, rows, extra = {}) =>
    h(doc, 'pk-table', { label, density: 'compact', columns: JSON.stringify(columns), rows: JSON.stringify(rows), ...extra });

// "3 s", "2 min", "1 h": how long ago an ISO time was.
export function ago(iso, now = Date.now()) {
    if (!iso) return '-';
    const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
    return s < 60 ? `${s} s` : s < 3600 ? `${Math.round(s / 60)} min` : `${Math.round(s / 3600)} h`;
}

// Facts about the host, the circuit and the runtime as label/value rows.
export function factRows(snap, reconnectUi, now = Date.now()) {
    const c = snap.circuit;
    const rows = [
        { name: 'Host', value: snap.host },
        { name: '.NET', value: snap.framework },
        { name: 'PlainKit.Blazor', value: snap.packageVersion },
        { name: 'Plainkit JavaScript', value: snap.sdkVersion ? `${snap.sdkVersion}${snap.sdkVersion === snap.packageVersion ? '' : ' (differs from the package)'}` : 'unknown' },
        { name: 'Runtime initialized', value: snap.runtimeInitialized ? 'yes' : 'no' },
        { name: 'SDK log forwarded to ILogger', value: snap.forwardingToILogger ? 'yes' : 'no' },
    ];
    if (c) {
        rows.push(
            { name: 'Circuit', value: c.phase },
            { name: 'Circuit id', value: c.id ?? '-' },
            { name: 'Open for', value: ago(c.openedAt, now) },
            { name: 'Connected since', value: c.connectedAt ? `${ago(c.connectedAt, now)} ago` : '-' },
            { name: 'Connection drops / reconnects', value: `${c.disconnects} / ${c.reconnects}` },
        );
    } else rows.push({ name: 'Circuit', value: 'none (not Blazor Server)' });
    rows.push({ name: 'Reconnect UI events (this browser)', value: reconnectUi.count ? `${reconnectUi.count}, last: ${reconnectUi.last}` : 'none seen' });
    return rows;
}

// The SDK log buffer, counted per level, and its newest problems.
export function logSummary(entries) {
    const counts = { debug: 0, info: 0, warn: 0, error: 0 };
    for (const e of entries) if (e.level in counts) counts[e.level]++;
    return { total: entries.length, counts, problems: entries.filter(e => e.level === 'warn' || e.level === 'error').slice(-8).reverse() };
}

export function blazorPanels(host) {
    return [blazorPanel(host), componentsPanel(host)];
}

function blazorPanel(host) {
    return {
        id: 'blazor',
        title: 'Blazor',
        async mount(el, { doc }) {
            const reconnectUi = { count: 0, last: '' };
            const onReconnect = e => { reconnectUi.count++; reconnectUi.last = e.detail?.state ?? 'changed'; };
            doc.addEventListener('components-reconnect-state-changed', onReconnect);

            const refresh = h(doc, 'pk-button', { size: 'mini', variant: 'ghost' }, 'Refresh');
            const status = h(doc, 'span', { class: 'muted', role: 'status' }, 'Reading...');
            const facts = h(doc, 'div');
            const interop = h(doc, 'div');
            const errors = h(doc, 'div');
            const logs = h(doc, 'div');
            el.append(
                h(doc, 'pk-cluster', {}, refresh, status),
                h(doc, 'div', { class: 'u-mt-3' }, h(doc, 'pk-card', { heading: 'Circuit and runtime' }, facts)),
                h(doc, 'div', { class: 'u-mt-3' }, h(doc, 'pk-card', { heading: 'JS interop through the PlainKit bridge' }, interop,
                    h(doc, 'p', { class: 'muted' }, 'Counted and timed on the .NET side for every call PlainKit components make. A mount call\'s time is that tool\'s mount time, including the network hop on Blazor Server. Blazor\'s own render timings are not observable from here, so none are shown.'), errors)),
                h(doc, 'div', { class: 'u-mt-3' }, h(doc, 'pk-card', { heading: 'SDK log buffer' }, logs)));
            loadElements(el).catch(() => { /* loadElements logs its own failures */ });

            let timer = 0;
            let destroyed = false;
            async function load() {
                try {
                    const snap = await host.invokeMethodAsync('Snapshot');
                    if (destroyed) return;
                    facts.replaceChildren(table(doc, 'Circuit and runtime', [{ key: 'name', label: 'Fact' }, { key: 'value', label: 'Value' }], factRows(snap, reconnectUi)));
                    const i = snap.interop;
                    interop.replaceChildren(table(doc, 'JS interop by function',
                        [{ key: 'identifier', label: 'Function' }, { key: 'calls', label: 'Calls', align: 'end' }, { key: 'averageMs', label: 'Average ms', align: 'end' }, { key: 'maxMs', label: 'Slowest ms', align: 'end' }, { key: 'errors', label: 'Errors', align: 'end' }],
                        i.byIdentifier.map(c => ({ ...c, id: c.identifier }))));
                    errors.replaceChildren(i.recentErrors.length
                        ? table(doc, 'JS interop errors', [{ key: 'at', label: 'When' }, { key: 'identifier', label: 'Function' }, { key: 'type', label: 'Error' }, { key: 'message', label: 'Message' }], i.recentErrors.map((e, id) => ({ id, ...e, at: `${ago(e.at)} ago` })).reverse())
                        : h(doc, 'p', { class: 'muted' }, `No interop errors in ${i.calls} calls.`));
                    const l = logSummary(getLogBuffer());
                    logs.replaceChildren(...compact(
                        h(doc, 'p', {}, `${l.total} entries: ${l.counts.error} error, ${l.counts.warn} warn, ${l.counts.info} info, ${l.counts.debug} debug.`),
                        l.problems.length ? table(doc, 'Newest warnings and errors', [{ key: 'level', label: 'Level' }, { key: 'scope', label: 'Scope' }, { key: 'message', label: 'Message' }], l.problems.map((e, id) => ({ id, level: e.level, scope: e.scope, message: e.message }))) : null));
                    status.textContent = `Updated ${new Date().toLocaleTimeString()}`;
                } catch (error) {
                    status.textContent = `The .NET side did not answer (the circuit may have ended): ${error?.message ?? error}`;
                }
            }
            const stop = () => { win().clearInterval(timer); timer = 0; };
            const win = () => doc.defaultView;
            refresh.addEventListener('click', load);
            return {
                activate() { load(); if (!timer) timer = win().setInterval(load, 1000); },
                deactivate: stop,
                destroy() { destroyed = true; stop(); refresh.removeEventListener('click', load); doc.removeEventListener('components-reconnect-state-changed', onReconnect); },
            };
        },
    };
}

// The example of an element (the first in its API entry) as a detached element, so its attributes and text can be translated to Razor.
export function exampleElement(doc, meta) {
    const html = meta?.examples?.[0]?.html;
    if (!html) return null;
    const template = doc.createElement('template');
    template.innerHTML = html;
    return template.content.querySelector(meta.tag);
}

// extraSections for the SDK's element inspector: the Razor side of an element, from the mappings the .NET side holds.
export function blazorInspectorSections(host) {
    return [{
        title: 'Blazor',
        open: true,
        render(container, { meta, element }) {
            const doc = container.ownerDocument;
            container.replaceChildren(h(doc, 'span', { class: 'muted' }, 'Reading the mapping...'));
            const defaults = Object.fromEntries((meta.props ?? []).filter(p => p.default !== undefined && p.default !== null && p.default !== '').map(p => [p.name, String(p.default)]));
            const attributes = element ? Object.fromEntries([...element.attributes].map(a => [a.name.toLowerCase(), a.value])) : {};
            const text = element ? (element.children.length ? '...' : element.textContent) : null;
            host.invokeMethodAsync('Describe', meta.tag, defaults, attributes, text).then(info => {
                if (!container.isConnected) return;
                if (!info) { container.replaceChildren(h(doc, 'p', { class: 'muted' }, `${meta.tag} has no Blazor mapping.`)); return; }
                const code = h(doc, 'pk-code-block', { label: 'Razor', wrap: true });
                code.textContent = info.markup;
                const rows = info.parameters.map((p, id) => ({
                    id, name: p.name, kind: p.kind, type: p.type, default: p.default ?? '', twoWay: p.twoWay ? 'yes' : '', drives: p.attribute ?? '', note: p.notGenerated ? `not generated: ${p.notGenerated}` : '',
                }));
                container.replaceChildren(...compact(
                    h(doc, 'pk-cluster', {}, h(doc, 'code', {}, `<${info.component}>`), h(doc, 'pk-badge', { variant: info.status === 'not available' ? 'warn' : 'ok' }, info.status)),
                    info.note ? h(doc, 'p', { class: 'muted' }, info.note) : null,
                    h(doc, 'div', { class: 'u-mt-3' }, code),
                    h(doc, 'div', { class: 'u-mt-3' }, table(doc, `${info.component} parameters`,
                        [{ key: 'name', label: 'Parameter' }, { key: 'kind', label: 'Kind' }, { key: 'type', label: 'Type' }, { key: 'default', label: 'Element default' }, { key: 'twoWay', label: 'Two-way' }, { key: 'drives', label: 'Drives' }, { key: 'note', label: 'Note' }], rows))));
                loadElements(container).catch(() => { /* loadElements logs its own failures */ });
            }).catch(error => container.replaceChildren(h(doc, 'p', { class: 'muted' }, `The mapping could not be read: ${error?.message ?? error}`)));
        },
    }];
}

// A picker over every element, and the SDK's inspector for it with the Blazor section added: the same extension point the gallery's inspector would use.
function componentsPanel(host) {
    return {
        id: 'blazor-components',
        title: 'Components',
        async mount(el, { doc }) {
            const apis = await (await fetch(API_URL)).json();
            const select = h(doc, 'pk-select', { label: 'Element', value: apis[0]?.tag });
            for (const a of apis) select.append(h(doc, 'option', {}, a.tag));
            const body = h(doc, 'div', { class: 'u-mt-3' });
            el.append(select, body);
            loadElements(el).catch(() => { /* loadElements logs its own failures */ });
            const inspector = createElementInspector(body);
            const sections = blazorInspectorSections(host);
            const show = tag => {
                const meta = apis.find(a => a.tag === tag);
                if (meta) inspector.show({ meta, element: exampleElement(doc, meta), extraSections: sections });
            };
            const onChange = () => show(select.value ?? select.getAttribute('value'));
            select.addEventListener('change', onChange);
            show(apis[0]?.tag);
            return { destroy() { select.removeEventListener('change', onChange); inspector.destroy(); } };
        },
    };
}
