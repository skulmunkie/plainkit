import { loadElements } from '../../js/loader.js';

// <pk-note-page>: a static informational page - a heading and a block of prose in a card, no data, no callbacks (#678). Formalizes the
// pk-stack > h1/pk-heading + pk-card shape every hand-rolled "About"/"Overview"-style page reached for as page: 'custom'.
export default Base => class extends Base {
    connected() {
        if (this.$w) return;
        this.$w = true;
        loadElements(this.shadowRoot);
        this.build();
    }
    changed(name) { if (name === 'config') this.build(); }

    build() {
        // A title the host supplied (slot "title", appended by the factory, possibly after the config was set) leads the stack and replaces the built-in heading.
        const own = [...(this.children ?? [])].some(c => c.getAttribute('slot') === 'title');
        const key = JSON.stringify(this.config ?? {}) + own;
        if (key === this.$builtFor) return;
        this.$builtFor = key;
        const doc = this.ownerDocument;
        const body = this.part('body');
        body.replaceChildren();
        const { heading = '', body: text = '', cardHeading = '' } = this.config ?? {};
        const stack = doc.createElement('pk-stack');
        stack.setAttribute('gap', 'md');
        const h = doc.createElement('pk-heading');
        h.setAttribute('level', '1');
        h.textContent = heading;
        const card = doc.createElement('pk-card');
        if (cardHeading) card.setAttribute('heading', cardHeading);
        const p = doc.createElement('p');
        p.textContent = text;
        card.append(p);
        const title = doc.createElement('slot');
        title.setAttribute('name', 'title');
        if (own) stack.append(card, title); else stack.append(h, card, title);
        body.append(stack);
        loadElements(body);
    }
};
