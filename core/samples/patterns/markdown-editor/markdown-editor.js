// The markdown-editor pattern, made live: the Preview tab draws the textarea's text with DOM APIs only (textContent only), so
// the stored value stays Markdown and nothing typed can inject markup. Supports #, ##, ###, "- " lists and **bold**. mount(root) returns { destroy() }.
import { createLogger } from '../../../js/log.js';

const log = createLogger('pattern:markdown-editor');

// Text with **bold** runs appended to a parent as text nodes and <strong> elements.
function inline(parent, text) {
    text.split(/\*\*(.+?)\*\*/).forEach((part, i) => {
        if (i % 2) { const b = document.createElement('strong'); b.textContent = part; parent.append(b); } else parent.append(part);
    });
}

function render(md) {
    const out = [];
    let list = null;
    for (const line of md.split(/\r?\n/)) {
        const h = /^(#{1,3}) (.*)$/.exec(line), li = /^[-*] (.*)$/.exec(line);
        if (li) { if (!list) { list = document.createElement('ul'); out.push(list); } const item = document.createElement('li'); inline(item, li[1]); list.append(item); continue; }
        list = null;
        if (!line.trim()) continue;
        const el = document.createElement(h ? `h${h[1].length + 2}` : 'p');
        inline(el, h ? h[2] : line);
        out.push(el);
    }
    return out;
}

export default function mount(root) {
    const ac = new AbortController();
    const source = root.querySelector('[data-source]'), preview = root.querySelector('[data-preview]'), tabs = root.querySelector('[data-tabs]');
    if (!source || !preview || !tabs) { log.warn('the markdown-editor sample needs [data-source], [data-preview] and [data-tabs]', { root }); return { destroy() {} }; }
    tabs.addEventListener('pk-tab-change', e => { if (e.detail.value === 'preview') preview.replaceChildren(...render(source.value ?? '')); }, { signal: ac.signal });
    return { destroy() { ac.abort(); } };
}
