// pk-record-form behaviour (see meta.json): the page layout of a create-or-edit record around the consumer's own <form>. It owns no values, no load and no save. The form sits in
// a pk-form (a summary of the problems, focus on the first, live checks); the toolbar (Cancel, the host's actions, Delete, Save), the tabs, an error alert and an optional sidebar
// are laid out around it. pk-form finds the form through the nested slots (assignedElements flattens a slot inside a slot), and the consumer's controls stay in the light tree
// under their own form, so form ownership, FormData and a form-associated pk-field-group all work with no change. The Save button submits that form from here (a button in
// the shadow tree is outside it), the same way pk-record-page does.
import { loadElements } from '../../js/loader.js';

export default Base => class extends Base {
    connected() {
        if (this.$w) return;
        this.$w = true;
        loadElements(this.shadowRoot);
        const on = (name, fn) => this.part(name).addEventListener('click', fn);
        on('cancel', () => this.emit('pk-record-cancel', null));
        on('delete', () => this.emit('pk-record-delete', null));
        on('save', () => this.submit());
        // pk-form validated the submit: this element's own event, and pk-form's stops here.
        this.part('form').addEventListener('pk-valid', e => { e.stopPropagation(); this.emit('pk-record-save', null); });
        this.watchSlot('sidebar', () => this.part('layout').toggleAttribute('data-bare', this.slotted('sidebar').length === 0));
        this.part('layout').toggleAttribute('data-bare', this.slotted('sidebar').length === 0);
    }
    form_() { return this.slotted().find(e => e.localName === 'form') ?? this.querySelector('form'); }
    /** Submits the consumer's form as its own submit button would: pk-form checks it, and a valid one raises pk-record-save. Call it from a button outside this element (the page header's). */
    submit() { this.form_()?.requestSubmit(); }
};
