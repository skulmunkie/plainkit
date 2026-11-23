import { drawState } from '../../js/page-shell.js';

// The drawn state (pk-skeleton, pk-empty-state or pk-alert) is a light-DOM child this element creates and owns itself (never a host-given
// node), self-assigned to the drawn slot - not a shadow-root child - because the SDK's on-demand element loader watches the document's own
// light DOM for pk-* tags it has not seen yet (js/loader.js's observeElements): a shadow root is outside a MutationObserver's reach, so anything
// drawn there would sit undefined and unstyled forever. See core/STANDARDS.md, "Ownership and reactivity" rule 3.
export default Base => class extends Base {
    connected() { if (!this.$s) { this.$s = this.ownerDocument.createElement('div'); this.$s.slot = 'drawn'; this.append(this.$s); } }
    updated() {
        this.connected();
        const state = this.state || 'ready';
        const content = this.part('content'); // a preset that extends this element (pk-not-found-page) has no content part
        if (content) content.hidden = state !== 'ready';
        drawState(this, state, { heading: this.heading || this.$fb?.heading, description: this.description || this.$fb?.description, label: this.label, retry: () => this.emit('pk-retry', null, { cancelable: false }) });
    }
};
