// PkElement: the base class of every SDK custom element (Shadow DOM, declared props, slots, events, parts). Dependency-free.
//
//   class extends PkElement { static tag = 'pk-x'; static props = { size: { type: 'enum', values: ['md', 'lg'], default: 'md', reflect: true } };
//                              static template = '<div part="box"><slot></slot></div>'; static css = ':host{display:block}' }
//   define(cls)
//
// Props: type string | boolean | number | enum. Attributes are kebab-case; a property and its attribute stay in step when reflect is set.
// Rendering: the template is cloned once into the shadow root; {{prop}} in text or attribute values, data-if="prop" and data-if-not="prop"
// are bound and re-applied in one microtask after any change. Anything richer overrides render(). Styles are adopted constructable
// sheets (shared and cached), never a style element or attribute, so a strict style-src holds. Design tokens are custom properties and
// inherit into the shadow root from :root / [data-theme]. Ids do not cross shadow boundaries: relate light-DOM siblings with aria-* on
// the light DOM, and use the internals (aria()) for the host's own role and state.

const sheets = new Map();
export const sheetFor = css => { let s = sheets.get(css); if (!s) { s = new CSSStyleSheet(); s.replaceSync(css); sheets.set(css, s); } return s; };
export const RESET = ':host{display:inline-block}:host([hidden]){display:none}*,*::before,*::after{box-sizing:border-box}[hidden]{display:none!important}';

import { kebab, camel, coerce, parseBindings, bindValue } from './element-core.js';
export { kebab, camel, coerce, parseBindings, bindValue };

export class PkElement extends HTMLElement {
    static props = {};
    static template = '';
    static css = '';
    static delegatesFocus = false;
    static get observedAttributes() { return Object.keys(this.props).map(kebab); }

    constructor() {
        super();
        const c = this.constructor;
        this.$ = {};
        this.internals = this.attachInternals?.();
        for (const [n, d] of Object.entries(c.props)) {
            this.$[n] = d.default;
            if (Object.hasOwn(this, n)) { const v = this[n]; delete this[n]; this.$[n] = coerce(d, v); }
        }
        const root = this.shadowRoot ?? this.attachShadow({ mode: 'open', delegatesFocus: c.delegatesFocus });
        root.adoptedStyleSheets = [sheetFor(RESET), sheetFor(c.css)];
        if (!Object.hasOwn(c, '$tpl')) { c.$tpl = document.createElement('template'); c.$tpl.innerHTML = c.template; }
        root.replaceChildren(c.$tpl.content.cloneNode(true));
        this.$b = [];
        const walk = document.createTreeWalker(root, 5);
        for (let n = walk.nextNode(); n; n = walk.nextNode()) {
            if (n.nodeType === 3) { if (n.nodeValue.includes('{{')) this.$b.push({ n, parts: parseBindings(n.nodeValue) }); continue; }
            for (const a of n.attributes) {
                if (a.value.includes('{{')) this.$b.push({ n, a: a.name, parts: parseBindings(a.value) });
                else if (a.name === 'data-if' || a.name === 'data-if-not') this.$b.push({ n, key: a.value, not: a.name === 'data-if-not' });
            }
        }
    }

    connectedCallback() { this.update(); this.connected?.(); }
    disconnectedCallback() { this.disconnected?.(); }

    attributeChangedCallback(attr, _old, val) {
        const name = camel(attr); const d = this.constructor.props[name];
        if (!d || this.$r === name) return;
        this.$[name] = coerce(d, val, true);
        this.changed?.(name, this.$[name]); this.requestUpdate();
    }

    requestUpdate() {
        if (this.$q) return;
        this.$q = true;
        queueMicrotask(() => { this.$q = false; this.update(); });
    }

    update() { this.render(); this.updated?.(); }

    render() {
        for (const b of this.$b) {
            if (b.parts) { const v = bindValue(b.parts, this.$, Boolean(b.a)); if (!b.a) b.n.nodeValue = v; else if (v === null) b.n.removeAttribute(b.a); else b.n.setAttribute(b.a, v); }
            else b.n.hidden = b.not ? Boolean(this.$[b.key]) : !this.$[b.key];
        }
    }

    // A bubbling, composed CustomEvent; false when a listener cancelled it.
    emit(name, detail, init = {}) { return this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true, cancelable: true, ...init })); }

    slotted(name = '') { return this.shadowRoot.querySelector(name ? `slot[name="${name}"]` : 'slot:not([name])')?.assignedElements({ flatten: true }) ?? []; }
    watchSlot(name, fn) { const s = this.shadowRoot.querySelector(name ? `slot[name="${name}"]` : 'slot:not([name])'); s?.addEventListener('slotchange', fn); return s; }
    part(name) { return this.shadowRoot.querySelector(`[part~="${name}"]`); }
    aria(map) { if (this.internals) Object.assign(this.internals, map); }

    // Form association (static formAssociated = true): value, validity and the reset / disabled / restore callbacks.
    get form() { return this.internals?.form ?? null; }
    get validity() { return this.internals?.validity; }
    get validationMessage() { return this.internals?.validationMessage ?? ''; }
    setFormValue(v, state) { this.internals?.setFormValue(v, state); }
    setValidity(flags, message, anchor) { this.internals?.setValidity(flags, message, anchor); }
    checkValidity() { return this.internals?.checkValidity() ?? true; }
    formResetCallback() { this.onReset?.(); }
    formDisabledCallback(disabled) { if ('disabled' in this.constructor.props) this.disabled = disabled; }
    formStateRestoreCallback(state) { this.onRestore?.(state); }
}

// Register a class: one accessor per declared prop (assignment reflects to the attribute when reflect is set).
export function define(cls) {
    for (const [name, def] of Object.entries(cls.props)) {
        if (Object.hasOwn(cls.prototype, name)) continue;
        Object.defineProperty(cls.prototype, name, {
            get() { return this.$[name]; },
            set(v) {
                const n = coerce(def, v);
                if (n === this.$[name]) return;
                this.$[name] = n;
                if (def.reflect) { this.$r = name; if (def.type === 'boolean') this.toggleAttribute(kebab(name), n); else this.setAttribute(kebab(name), String(n)); this.$r = null; }
                this.changed?.(name, n); this.requestUpdate();
            },
        });
    }
    if (!customElements.get(cls.tag)) customElements.define(cls.tag, cls);
    return cls;
}
