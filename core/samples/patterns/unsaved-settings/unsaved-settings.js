// The unsaved-settings pattern, made live: the save bar appears when a field differs from what was last saved, Save keeps the values
// and hides it, Discard puts the saved values back. mount(root) works on this sample's own DOM and returns { destroy() }.
import { createLogger } from '../../../js/log.js';

const log = createLogger('pattern:unsaved-settings');

const FIELDS = 'pk-input, pk-select, pk-switch, pk-range';
// The value a field holds, in the shape its element commits it.
const read = f => (f.localName === 'pk-switch' ? f.checked : f.value);
const write = (f, v) => { if (f.localName === 'pk-switch') f.checked = v; else f.value = v; };

export default function mount(root) {
    const ac = new AbortController();
    const form = root.querySelector('form');
    const bar = root.querySelector('[data-bar]');
    const saved = root.querySelector('[data-saved]');
    if (!form || !bar) { log.warn('the unsaved-settings sample needs a form and a [data-bar]', { root }); return { destroy() {} }; }

    const fields = [...form.querySelectorAll(FIELDS)];
    let base = new Map();
    const snapshot = () => { base = new Map(fields.map(f => [f, read(f)])); };
    const dirty = () => fields.some(f => read(f) !== base.get(f));
    const paint = () => { bar.hidden = !dirty(); };

    // Elements upgrade on load: take the saved values once every field element is defined.
    Promise.all([...new Set(fields.map(f => f.localName))].map(t => customElements.whenDefined(t))).then(() => {
        if (ac.signal.aborted) return;
        snapshot(); paint();
    });
    bar.hidden = true;

    const onChange = () => { if (saved) saved.hidden = true; paint(); };
    for (const type of ['input', 'change', 'pk-change', 'pk-range']) form.addEventListener(type, onChange, { signal: ac.signal });
    root.addEventListener('click', e => {
        if (e.target.closest?.('[data-save]')) { snapshot(); paint(); if (saved) saved.hidden = false; }
        else if (e.target.closest?.('[data-discard]')) { for (const [f, v] of base) write(f, v); paint(); }
    }, { signal: ac.signal });

    return { destroy() { ac.abort(); } };
}
