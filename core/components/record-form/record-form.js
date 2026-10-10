// pk-record-form behaviour (see meta.json): the page layout of a create-or-edit record around the consumer's own <form>. It owns no values, no load and no save. The form sits in
// a pk-form (a summary of the problems, focus on the first, live checks); the toolbar (Cancel, the host's actions, Delete, Save), the tabs, an error alert and an optional sidebar
// are laid out around it. pk-form finds the form through the nested slots (assignedElements flattens a slot inside a slot), and the consumer's controls stay in the light tree
// under their own form, so form ownership, FormData and a form-associated pk-field-group all work with no change. The Save button submits that form from here (a button in
// the shadow tree is outside it), the same way pk-record-page does.
import { loadElements } from '../../js/loader.js';
import { mediaBelow } from '../../js/breakpoints.js';

export default Base => class extends Base {
    connected() {
        this.$tabs ??= e => { this.keepTab_(e); this.syncTabs_(); };
        this.addEventListener('pk-tab-change', this.$tabs);
        this.bindTabs_();
        if (this.$w) return this.syncTabs_();
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
        for (const n of ['tabs', '']) this.watchSlot(n, this.$tabs);
        this.syncTabs_();
    }
    disconnected() { this.removeEventListener('pk-tab-change', this.$tabs); this.$mq?.removeEventListener('change', this.$tabs); this.$mq = null; }
    updated() { if (this.$w && this.$from !== this.tabsFrom) { this.$mq?.removeEventListener('change', this.$tabs); this.bindTabs_(); this.syncTabs_(); } }
    bindTabs_() {
        this.$from = this.tabsFrom;
        this.$mq = this.$from === 'always' ? null : mediaBelow(this.$from);
        this.$mq?.addEventListener('change', this.$tabs);
    }
    /** Tabs apply at or below tabsFrom: a section tagged tab="x y" shows only while one of its tabs is chosen; otherwise every section shows and the strip is hidden. */
    syncTabs_() {
        this.keepTab_();
        const strip = this.slotted('tabs').find(e => e.localName === 'pk-tabs');
        const on = !!strip && (this.tabsFrom === 'always' || !!this.$mq?.matches);
        const active = strip?.value || strip?.querySelector('pk-tab')?.getAttribute('value');
        this.part('tabs').hidden = !on;
        for (const s of this.querySelectorAll('[tab]')) s.hidden = on && !s.getAttribute('tab').split(/\s+/).includes(active);
    }
    /** tab-param: the chosen tab is kept in that query parameter (history.replaceState, other parameters and the hash kept), and a link carrying it opens on that tab. */
    keepTab_(e) {
        const key = this.tabParam, win = this.ownerDocument.defaultView;
        if (!key || !win?.history || e?.detail?.fallback) return;
        const url = new URL(win.location.href);
        const strip = this.slotted('tabs').find(x => x.localName === 'pk-tabs');
        if (e) url.searchParams.set(key, e.detail?.value ?? strip?.value ?? '');
        else if (strip && this.$strip !== strip) {
            this.$strip = strip;
            const want = url.searchParams.get(key);
            if (want && [...strip.querySelectorAll('pk-tab')].some(t => t.getAttribute('value') === want && !t.hasAttribute('disabled'))) strip.value = want;
            return;
        } else return;
        win.history.replaceState(win.history.state, '', url);
    }
    form_() { return this.slotted().find(e => e.localName === 'form') ?? this.querySelector('form'); }
    /** Submits the consumer's form as its own submit button would: pk-form checks it, and a valid one raises pk-record-save. Call it from a button outside this element (the page header's). */
    submit() { this.form_()?.requestSubmit(); }
};
