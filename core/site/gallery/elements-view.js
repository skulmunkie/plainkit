// The gallery page of a custom element, generated entirely from its meta API: a live playground (props become controls, the slot content
// is editable markup, events land in a log, custom properties are settable), the usage snippet with its Blazor equivalent, the examples
// rendered live, and the API tables. Built with DOM APIs; the only markup parsed is the element's own examples from its meta.

const h = (tag, attrs = {}, ...kids) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) { if (v === false || v === null || v === undefined) continue; if (k === 'class') el.className = v; else el.setAttribute(k, v === true ? '' : v); }
    el.append(...kids.flat().filter(k => k !== null && k !== undefined && k !== false));
    return el;
};
const code = text => h('code', {}, text);
// Reference sections fold on a phone (open on a wide screen) so the page opens on the playground, not on six tables.
const compact = () => matchMedia('(max-width: 640px)').matches;
const fold = (title, ...body) => h('details', { class: 'card gx-entry gx-fold', open: !compact() }, h('summary', { class: 'gx-fold-title' }, title), ...body);
const disclose = (title, ...body) => h('details', { class: 'gx-disclose' }, h('summary', {}, title), ...body);
const section = (title, ...body) => h('section', { class: 'card gx-entry' }, h('div', { class: 'card-header section-header' }, h('h2', { class: 'section-header-title' }, title)), ...body);
// Parsed with an element of the main document, so an pk-* tag is created against its registry and can be upgraded before it is attached.
const fromHtml = html => { const d = document.createElement('div'); d.innerHTML = html; const f = document.createDocumentFragment(); f.append(...d.childNodes); return f; };

// Each cell carries its column name (data-label) so a phone can lay a row out as a labelled card instead of a wide table (gallery.css).
function table(cols, rows) {
    return h('div', { class: 'u-scroll-x' }, h('table', { class: 'data gx-table' },
        h('thead', {}, h('tr', {}, ...cols.map(c => h('th', {}, c)))),
        h('tbody', {}, ...rows.map(r => h('tr', {}, ...r.map((c, i) => h('td', { 'data-label': cols[i] }, c)))))));
}

const show = v => (v === '' ? '""' : String(v));

export function blazorSnippet(meta, root) {
    const b = meta.blazor; const attrs = [];
    for (const p of b.params.filter(x => x.prop)) {
        const def = meta.props.find(d => d.name === p.prop);
        const attr = p.prop.replace(/[A-Z]/g, c => '-' + c.toLowerCase());
        if (!root.hasAttribute(attr)) continue;
        const raw = root.getAttribute(attr); const member = p.enum && Object.keys(p.enum).find(k => p.enum[k] === raw);
        attrs.push(def?.type === 'boolean' ? p.name : member ? `${p.name}="@(${p.type.replace('?', '')}.${member})"` : `${p.name}="${raw}"`);
    }
    const events = b.params.filter(x => x.event).map(x => `${x.name}="Handle${x.name}"`);
    const open = `<${b.component}${[...attrs, ...events].map(a => ' ' + a).join('')}>`;
    return `${open}\n    @* ChildContent and named slots as RenderFragments *@\n</${b.component}>`;
}

export function renderElement(meta) {
    const page = h('div', { class: 'stack' });
    page.append(h('header', { class: 'gx-head' }, h('h1', {}, meta.title), h('p', { class: 'muted' }, meta.summary), h('p', { class: 'muted' }, code(`<${meta.tag}>`), ' - ', meta.group)));

    // ---- playground
    const example = meta.examples[0];
    const stage = h('div', { class: 'gx-el-stage' });
    stage.append(fromHtml(example.html));
    const live = stage.querySelector(meta.tag) ?? stage.firstElementChild;
    // An example that lists several instances (one per kind) would push the controls off screen: the playground drives ONE, the Examples section shows the rest.
    for (const sib of [...(live.parentElement?.children ?? [])]) if (sib !== live && sib.localName === meta.tag) sib.remove();
    const controls = h('div', { class: 'gx-el-controls' });
    const snippet = h('pre', { class: 'gx-code' }); const codeEl = code(''); snippet.append(codeEl);
    const blazor = h('pre', { class: 'gx-code' }); const blazorCode = code(''); blazor.append(blazorCode);
    const refresh = () => { codeEl.textContent = live.outerHTML.replace(/\s(data-[\w-]+="[^"]*")/g, '').replace(/\shidden(="")?(?=[\s>])/g, ''); blazorCode.textContent = blazorSnippet(meta, live); };

    // A control starts from the attribute the example carries, else the declared default: read from the markup, so it does not depend on the element being upgraded yet.
    const initial = d => { const a = d.name.replace(/[A-Z]/g, c => '-' + c.toLowerCase()); return d.type === 'boolean' ? live.hasAttribute(a) : live.hasAttribute(a) ? live.getAttribute(a) : d.default; };
    for (const d of meta.props) {
        const id = `pg-${meta.tag}-${d.name}`;
        const input = d.type === 'boolean' ? h('input', { type: 'checkbox', id }) : d.type === 'enum' ? h('select', { id }, ...d.values.map(v => h('option', { value: v }, v))) : h('input', { id, type: d.type === 'number' ? 'number' : 'text' });
        if (d.type === 'boolean') input.checked = initial(d); else input.value = initial(d);
        input.addEventListener(d.type === 'boolean' || d.type === 'enum' ? 'change' : 'input', () => { live[d.name] = d.type === 'boolean' ? input.checked : input.value; refresh(); });
        // A checkbox sits inline with its label; every other control gets its label above it, both in one grid cell.
        controls.append(d.type === 'boolean' ? h('label', { class: 'chk gx-el-check', title: d.description }, input, h('span', {}, d.name)) : h('label', { class: 'ff', title: d.description }, h('span', {}, d.name), input));
    }
    const content = h('textarea', { rows: 4, class: 'sql-input', id: `pg-${meta.tag}-content`, 'aria-label': 'Slot content (markup)' }); content.value = live.innerHTML.trim();
    content.addEventListener('input', () => { live.innerHTML = content.value; refresh(); });
    const slotField = disclose('Content and slots (markup)', h('label', { class: 'ff ff--wide' }, h('span', { class: 'u-sr-only' }, 'Content and slots (markup)'), content));

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
    const theming = h('div', { class: 'stack-sm' });
    for (const c of meta.cssProperties) {
        const input = h('input', { type: 'text', placeholder: c.default ?? '', 'aria-label': c.name });
        input.addEventListener('input', () => { if (input.value) live.style.setProperty(c.name, input.value); else live.style.removeProperty(c.name); });
        theming.append(h('label', { class: 'ff' }, h('span', {}, code(c.name)), input));
    }
    page.append(section('Playground',
        h('div', { class: 'gx-el-play' }, h('div', { class: 'gx-el-live card' }, stage), controls),
        slotField,
        disclose('Markup', snippet),
        disclose('Blazor equivalent', blazor),
        meta.events.length ? logBox : null,
        meta.cssProperties.length ? disclose(`Theme it (${meta.cssProperties.length} custom ${meta.cssProperties.length === 1 ? 'property' : 'properties'})`, theming) : null));
    refresh();
    customElements.whenDefined(meta.tag).then(refresh);

    // ---- examples
    page.append(section('Examples', ...meta.examples.map(x => h('div', { class: 'stack-sm' }, h('h3', {}, x.title), h('div', { class: 'gx-el-live card' }, fromHtml(x.html)), disclose('Markup', h('pre', { class: 'gx-code' }, code(x.html)))))));

    // ---- API
    page.append(fold('Properties', table(['Name', 'Attribute', 'Type', 'Default', 'Reflects', 'Description'],
        meta.props.map(d => [code(d.name), code(d.name.replace(/[A-Z]/g, c => '-' + c.toLowerCase())), d.type === 'enum' ? d.values.join(' | ') : d.type, code(show(d.default)), d.reflect ? 'yes' : 'no', d.description]))));
    page.append(fold('Slots', meta.slots.length ? table(['Name', 'Description'], meta.slots.map(s => [code(s.name || '(default)'), s.description])) : h('p', { class: 'muted' }, 'None.')));
    page.append(fold('Events', meta.events.length ? table(['Name', 'Detail', 'Description'], meta.events.map(e => [code(e.name), code(show(e.detail)), e.description])) : h('p', { class: 'muted' }, 'None beyond the native ones.')));
    page.append(fold('Styling hooks',
        h('h3', {}, 'Parts'), meta.parts.length ? table(['Selector', 'Description'], meta.parts.map(p => [code(`${meta.tag}::part(${p.name})`), p.description])) : h('p', { class: 'muted' }, 'None.'),
        h('h3', {}, 'Custom properties'), meta.cssProperties.length ? table(['Name', 'Default', 'Description'], meta.cssProperties.map(c => [code(c.name), code(c.default ?? ''), c.description])) : h('p', { class: 'muted' }, 'None. Design tokens (--color-*, --space-*, ...) inherit into the element.')));
    if (meta.methods.length) page.append(fold('Methods', table(['Name', 'Description'], meta.methods.map(m => [code(m.name), m.description]))));
    page.append(fold('Accessibility', h('p', {}, meta.a11y)));
    page.append(fold('Blazor mapping', h('p', { class: 'muted' }, `The ${meta.blazor.component} component maps its parameters one to one:`), table(['Parameter', 'Becomes'], meta.blazor.params.map(p => [code(p.name), p.prop ? `property ${p.prop}` : p.event ? `event ${p.event}` : `slot ${p.slot === '' ? '(default)' : p.slot}`]))));
    return page;
}
