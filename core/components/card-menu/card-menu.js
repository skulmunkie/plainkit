import { loadElements } from '../../js/loader.js';

// pk-card-menu: a pk-dropdown opened by an icon-only pk-button, for the actions slot of a pk-card. The keyboard, the placement and the focus return are the dropdown's;
// this only keeps its own open prop in step with the dropdown's (pk-open, pk-close and pk-select are composed, so they reach the host). Items are the slotted pk-menu-items.
export default Base => class extends Base {
    connected() {
        loadElements(this.shadowRoot); // the dropdown and the button are pk-* elements in this shadow tree
        if (this.$w) return;
        this.$w = true;
        const menu = this.part('menu');
        menu.addEventListener('pk-open', () => { this.open = true; });
        // A listener may cancel pk-close after this one: read the dropdown's own state once the event is over.
        menu.addEventListener('pk-close', () => queueMicrotask(() => { this.open = menu.open; }));
        if (this.open) menu.open = true;
    }
    changed(name) { if (name === 'open') this.part('menu').open = this.open; }
};
