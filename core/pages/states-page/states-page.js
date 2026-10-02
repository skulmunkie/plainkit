import { showState } from '../../js/page-shell.js';

// The drawn state (pk-skeleton, pk-empty-state or pk-alert) is a light-DOM child this element creates and owns itself (never a host-given
// node), self-assigned to the drawn slot - not a shadow-root child - because the SDK's on-demand element loader watches the document's own
// light DOM for pk-* tags it has not seen yet (js/loader.js's observeElements): a shadow root is outside a MutationObserver's reach, so anything
// drawn there would sit undefined and unstyled forever. See core/STANDARDS.md, "Ownership and reactivity" rule 3.
export default Base => class extends Base {
    connected() { if (!this.$s) { this.$s = this.ownerDocument.createElement('div'); this.$s.slot = 'drawn'; this.append(this.$s); } }
    updated() {
        const state = this.state || 'ready';
        this.part('content').hidden = state !== 'ready';
        this.$s ??= (() => { const d = this.ownerDocument.createElement('div'); d.slot = 'drawn'; this.append(d); return d; })();
        showState(this.$s, state, { heading: [...(this.children ?? [])].some(c => c.getAttribute?.('slot') === 'title') && state !== 'loading' ? null : this.heading, description: this.description, label: this.label, retry: () => this.emit('pk-retry', null, { cancelable: false }) });
    }
};
