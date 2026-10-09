import { loadElements } from '../../js/loader.js';
import { matchesHotkey } from '../../js/hotkey.js';
import { initInvokers } from '../../js/invokers.js';

// Tray logic. Pure, so it can be tested without a DOM.
export const SIZES = ['small', 'medium', 'large'];
export const EDGES = ['bottom', 'top', 'start', 'end'];

// The size a value asks for, or null when it is not one of the three.
export const sizeOf = v => (SIZES.includes(v) ? v : null);

// The hover text of the launcher: its name, and the chord that toggles the tray when there is one.
export const launcherTitle = (label, hotkey) => (hotkey ? `${label} (${hotkey})` : label);

// pk-tray: a non-modal tool panel pinned to a viewport edge, opened by a floating launcher or a chord. No backdrop, no focus trap, no inert page.
export default Base => class extends Base {
    connected() {
        initInvokers(this.ownerDocument); // data-open / data-toggle work on a page that never calls initPlainkit (once per document)
        if (!this.$w) {
            this.$w = true;
            const panel = this.part('panel');
            this.part('launcher').addEventListener('click', () => { this.ask(!this.open, 'launcher'); this.requestUpdate(); }); // the button flipped its own pressed; a vetoed close puts it back
            this.part('close').addEventListener('click', () => this.ask(false, 'close'));
            panel.addEventListener('keydown', e => { if (e.key === 'Escape' && !e.defaultPrevented) this.ask(false, 'escape'); });
            // The size choice and the launcher are this element's own buttons: their pk-toggle is not news to the page.
            this.shadowRoot.addEventListener('pk-toggle', e => {
                e.stopPropagation();
                const size = this.part('sizes').contains(e.target) ? sizeOf(e.target.getAttribute('value')) : null;
                if (size && size !== this.size) { this.size = size; this.emit('pk-size-change', { size }, { cancelable: false }); }
            });
        }
        this.$k ??= e => { if (!e.repeat && matchesHotkey(e, this.hotkey)) { e.preventDefault(); this.ask(!this.open, 'hotkey'); } };
        this.ownerDocument.addEventListener('keydown', this.$k);
        for (let a = this.parentElement; a; a = a.parentElement) {
            if (getComputedStyle(a).transform !== 'none') { this.warnOnce('transform', 'sits inside an element with a transform, which makes position: fixed relative to that element: place it as a direct child of body or of a container without one', { ancestor: a.localName }); break; }
        }
        loadElements(this.shadowRoot);
    }
    disconnected() { this.ownerDocument.removeEventListener('keydown', this.$k); }
    // A change the user asked for (launcher, Close, Escape, the chord): a close can be vetoed; focus follows as the contract says.
    ask(open, reason) {
        if (open === this.open) return;
        if (!open && !this.emit('pk-close', { reason })) return;
        const inside = this.contains(this.ownerDocument.activeElement); // the document's active element is this host when focus is in its shadow tree
        this.open = open;
        if (open) {
            this.emit('pk-open', { reason }, { cancelable: false });
            if (reason === 'launcher') this.part('header').querySelector('pk-button:not([hidden])')?.focus();
        } else if (inside || reason !== 'hotkey') this.part('launcher').focus();
    }
    show() { this.open = true; }
    hide() { this.open = false; }
    toggle() { this.open = !this.open; }
    updated() {
        for (const b of this.part('sizes').children) b.pressed = b.getAttribute('value') === this.size;
        const launcher = this.part('launcher');
        launcher.pressed = this.open;
        if (this.hotkey) { launcher.setAttribute('title', launcherTitle(this.launcherLabel, this.hotkey)); launcher.setAttribute('aria-keyshortcuts', this.hotkey); }
        else { launcher.removeAttribute('title'); launcher.removeAttribute('aria-keyshortcuts'); }
        if (!this.label) this.warnOnce('label', 'has no label: the panel has no accessible name');
        if (!this.launcherLabel) this.warnOnce('launcherLabel', 'has no launcher-label: the launcher button has no name');
    }
};
