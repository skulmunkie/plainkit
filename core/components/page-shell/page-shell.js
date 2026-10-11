import { loadElements } from '../../js/loader.js';
import { renderState } from '../../js/page-states.js';

// A whole-page state (loading, empty, error, forbidden) replaces the content. The content stays in the light DOM, only hidden, so the page type's own nodes and listeners survive.
export default Base => class extends Base {
    connected() { loadElements(this.shadowRoot); }
    updated() {
        const box = this.part('state'), on = this.state !== 'ready', key = [this.state, this.stateHeading, this.stateDescription].join('\n');
        box.hidden = !on;
        this.part('content').hidden = on;
        if (this.$k === key) return;
        this.$k = key;
        renderState(box, this.state, { label: this.stateHeading, heading: this.stateHeading, description: this.stateDescription, retry: () => this.emit('pk-page-shell-retry') });
        loadElements(box);
    }
};
