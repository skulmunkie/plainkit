// Deprecation warnings (issue #23). An element whose meta declares `deprecated` on itself, a prop, an event or a slot gets its generated module
// wrapped in deprecations(Base, spec); an element that declares nothing never imports this file, so the base runtime (element.js) carries no cost.
//
//   deprecations(behaviour(PkElement), { tag, element, props, events, slots })   spec: { since, remove, message } per deprecated item (tools/element-api.mjs deprecationSpec)
//
// A warning goes through the element's logger (scope: its tag) once per page and item: when the element connects (whole element), when a
// deprecated prop is set as an attribute or a property, when a listener is added to the element for a deprecated event, and when a deprecated
// slot is filled (at connect and when children are added later). Nothing is overridden that the base does not already offer.
import { kebab } from './element-core.js';

const said = new Set();

function say(el, key, what, d) {
    const id = `${el.constructor.tag}:${key}`;
    if (said.has(id)) return;
    said.add(id);
    el.log.warn(`${what} is deprecated since ${d.since} and will be removed in ${d.remove}: ${d.message}`, { deprecated: key, since: d.since, remove: d.remove });
}

export const deprecations = (Base, spec) => class extends Base {
    coerceProp(name, def, raw, fromAttr) {
        const d = spec.props[name];
        if (d && raw !== null && raw !== undefined && (fromAttr || raw !== def.default)) say(this, `prop:${name}`, `<${spec.tag}> attribute "${kebab(name)}"`, d);
        return super.coerceProp(name, def, raw, fromAttr);
    }

    addEventListener(type, ...rest) {
        const d = spec.events[type];
        if (d) say(this, `event:${type}`, `<${spec.tag}> event "${type}"`, d);
        return super.addEventListener(type, ...rest);
    }

    connectedCallback() {
        super.connectedCallback();
        if (spec.element) say(this, 'element', `<${spec.tag}>`, spec.element);
        const slots = Object.entries(spec.slots);
        if (!slots.length) return;
        const scan = () => {
            for (const [name, d] of slots) {
                const used = [...this.childNodes].some(c => (c.nodeType === 1 ? (c.getAttribute('slot') ?? '') === name : c.nodeType === 3 && !name && c.nodeValue.trim() !== ''));
                if (used) say(this, `slot:${name}`, `<${spec.tag}> slot "${name || 'default'}"`, d);
            }
        };
        scan();
        this.$dep ??= new MutationObserver(scan);
        this.$dep.observe(this, { childList: true });
    }

    disconnectedCallback() {
        this.$dep?.disconnect();
        super.disconnectedCallback();
    }
};
