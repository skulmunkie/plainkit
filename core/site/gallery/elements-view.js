// The gallery page of a custom element, generated entirely from its meta API: a live playground (props become controls, the slot content
// is editable markup, events land in a log, custom properties are settable) and the examples rendered live, as two pk-tabs panels. Built
// with DOM APIs; the only markup parsed is the element's own examples from its meta. The page itself is made of pk-* elements (page header,
// tabs, cards, accordions, fields, code blocks). The API reference (Properties, Slots, Events, Parts, Custom properties, Methods,
// Accessibility) is drawn once, by the Details flyout (js/element-inspector.js) - this page does not repeat it.

import { cleanMarkup } from '../../js/element-inspector-logic.js';

const h = (tag, attrs = {}, ...kids) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) { if (v === false || v === null || v === undefined) continue; if (k === 'class') el.className = v; else el.setAttribute(k, v === true ? '' : v); }
    el.append(...kids.flat().filter(k => k !== null && k !== undefined && k !== false));
    return el;
};
const code = text => h('code', {}, text);
const disclose = (title, ...body) => h('pk-accordion-item', { class: 'gx-disclose', heading: title }, ...body);
// Parsed with an element of the main document, so an pk-* tag is created against its registry and can be upgraded before it is attached.
const fromHtml = html => { const d = document.createElement('div'); d.innerHTML = html; const f = document.createDocumentFragment(); f.append(...d.childNodes); return f; };
// A code viewer: the code is the element's text content, so a change of text is a change of code.
const codeBlock = (label, text = '') => h('pk-code-block', { label, wrap: true }, text);

// options.onLive(element) hands the playground's live element to the caller (the gallery's inspector shows it); options.onChange() runs after
// every change of its markup.
export function renderElement(meta, options = {}) {
    const page = h('pk-stack', { class: 'gx-page' });
    page.append(h('pk-page-header', { class: 'gx-head', level: 1, heading: meta.title }, h('p', { class: 'muted', slot: 'meta' }, meta.summary), h('p', { class: 'muted', slot: 'meta' }, code(`<${meta.tag}>`), ' - ', meta.group)));

    // ---- playground
    const example = meta.examples[0];
    const stage = h('div', { class: 'gx-el-stage' });
    stage.append(fromHtml(example.html));
    const live = stage.querySelector(meta.tag) ?? stage.firstElementChild;
    // An example that lists several instances (one per kind) would push the controls off screen: the playground drives ONE, the Examples section shows the rest.
    for (const sib of [...(live.parentElement?.children ?? [])]) if (sib !== live && sib.localName === meta.tag) sib.remove();
    const controls = h('pk-grid', { class: 'gx-el-controls', min: '9rem', gap: 'sm' });
    const snippet = codeBlock('Markup');
    const refresh = () => { snippet.textContent = cleanMarkup(live.outerHTML); options.onChange?.(); };
    options.onLive?.(live);

    // A control starts from the attribute the example carries, else the declared default: read from the markup, so it does not depend on the element being upgraded yet.
    const initial = d => { const a = d.name.replace(/[A-Z]/g, c => '-' + c.toLowerCase()); return d.type === 'boolean' ? live.hasAttribute(a) : live.hasAttribute(a) ? live.getAttribute(a) : d.default; };
    for (const d of meta.props) {
        const id = `pg-${meta.tag}-${d.name}`;
        const start = initial(d);
        // A checkbox sits inline with its label; every other control carries its label above it, both in one grid cell.
        const input = d.type === 'boolean' ? h('pk-checkbox', { id, class: 'gx-el-check', title: d.description, checked: Boolean(start) }, d.name)
            : d.type === 'enum' ? h('pk-select', { id, value: start }, ...d.values.map(v => h('option', { value: v }, v)))
            : h('pk-input', { id, type: d.type === 'number' ? 'number' : 'text', value: start });
        input.addEventListener(d.type === 'boolean' || d.type === 'enum' ? 'change' : 'input', () => { live[d.name] = d.type === 'boolean' ? input.checked : input.value; refresh(); });
        controls.append(d.type === 'boolean' ? input : h('pk-field', { label: d.name, title: d.description }, input));
    }
    const content = h('pk-textarea', { rows: 4, id: `pg-${meta.tag}-content` }); content.setAttribute('value', live.innerHTML.trim());
    content.addEventListener('input', () => { live.innerHTML = content.value; refresh(); });
    const slotField = disclose('Content and slots (markup)', h('pk-field', { label: 'Content and slots (markup)' }, content));

    const log = h('ol', { class: 'gx-el-log', 'aria-live': 'polite' });
    const logBox = h('div', { class: 'gx-el-events', hidden: true }, h('h3', {}, 'Events'), log);
    for (const ev of meta.events) live.addEventListener(ev.name, e => {
        logBox.hidden = false;
        log.prepend(h('li', {}, code(ev.name), e.detail === null || e.detail === undefined ? '' : ' ' + JSON.stringify(e.detail)));
        while (log.children.length > 12) log.lastChild.remove();
        refresh();
        // An element that hides itself (an alert's dismiss) would leave an empty stage: bring it back so the playground stays usable.
        setTimeout(() => { if (live.hidden) { live.hidden = false; refresh(); } }, 900);
    });
    const theming = h('pk-stack', { gap: 'sm' });
    for (const c of meta.cssProperties) {
        const input = h('pk-input', { placeholder: c.default ?? '' });
        input.addEventListener('input', () => { if (input.value) live.style.setProperty(c.name, input.value); else live.style.removeProperty(c.name); refresh(); });
        theming.append(h('pk-field', { label: c.name }, input));
    }
    const playground = h('pk-card', { class: 'gx-entry' },
        h('div', { class: 'gx-el-play' }, h('pk-card', {}, h('div', { class: 'gx-el-live' }, stage)), controls),
        slotField,
        disclose('Markup', snippet),
        meta.events.length ? logBox : null,
        meta.cssProperties.length ? disclose(`Theme it (${meta.cssProperties.length} custom ${meta.cssProperties.length === 1 ? 'property' : 'properties'})`, theming) : null);
    refresh();
    customElements.whenDefined(meta.tag).then(refresh);

    // ---- examples
    const examples = h('pk-card', { class: 'gx-entry' }, ...meta.examples.map(x => h('pk-stack', { gap: 'sm' }, h('h3', {}, x.title), h('pk-card', {}, h('div', { class: 'gx-el-live' }, fromHtml(x.html))), disclose('Markup', codeBlock('HTML', x.html)))));

    // ---- Playground / Examples tabs. The API reference (Properties, Slots, Events, Parts, Custom properties, Methods, Accessibility) lives
    // only in the Details flyout (js/element-inspector.js): showing it here too would draw every element page's API twice.
    page.append(h('pk-tabs', { value: 'playground', label: `${meta.title} views` },
        h('pk-tab', { value: 'playground' }, 'Playground'), h('pk-tab-panel', { value: 'playground' }, playground),
        h('pk-tab', { value: 'examples' }, 'Examples'), h('pk-tab-panel', { value: 'examples' }, examples)));
    return page;
}
