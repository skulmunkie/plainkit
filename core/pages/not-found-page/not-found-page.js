import { showState } from '../../js/page-shell.js';

// pk-not-found-page: a purely presentational "this route doesn't exist" / "you don't have access" screen - built on the SAME shared
// js/page-states.js module pk-states-page already uses (the "an EmptyPageBase" idea from #351), never duplicating its markup. Always
// draws the 'empty' state's own pk-empty-state markup with a sensible default heading/description, so a consumer can use it with zero
// config; an optional `label` adds a real pk-button action (e.g. "Go home") into pk-empty-state's own actions slot, which raises
// pk-action instead of calling location/navigate itself - the host decides what "Go home" means (STANDARDS.md: elements talk back
// through events, never callback props).
export default Base => class extends Base {
    connected() { if (!this.$s) { this.$s = this.ownerDocument.createElement('div'); this.$s.slot = 'drawn'; this.append(this.$s); } }
    updated() {
        this.$s ??= (() => { const d = this.ownerDocument.createElement('div'); d.slot = 'drawn'; this.append(d); return d; })();
        showState(this.$s, 'empty', {
            heading: [...(this.children ?? [])].some(c => c.getAttribute?.('slot') === 'title') ? null : this.heading || 'Page not found', // a factory-supplied title (slot "title") is the page's one heading
            description: this.description || "The page you're looking for doesn't exist or you don't have access to it.",
        });
        const drawn = this.$s.firstElementChild;
        if (this.label && drawn) {
            const btn = this.ownerDocument.createElement('pk-button');
            btn.slot = 'actions';
            btn.textContent = this.label;
            btn.addEventListener('click', () => this.emit('pk-action', null, { cancelable: false }));
            drawn.append(btn);
        }
    }
};
