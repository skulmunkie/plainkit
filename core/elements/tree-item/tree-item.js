import { safeHref } from '../../js/safe-url.js';

// pk-tree-item: a node of pk-tree. With `href` the label is a real anchor (middle click, copy link, status-bar URL); a plain click is reported as a cancelable pk-navigate like pk-link, and falls back to a normal navigation.
export default Base => class extends Base {
    connected() {
        if (this.$c) return;
        this.$c = e => {
            if (this.disabled) return;
            const link = this.part('label'), path = e.composedPath();
            if (this.href && !path.includes(link) && !path.includes(this.part('toggle'))) { link.click(); return; }
            if (this.href && path.includes(link)) { this.select(true); this.go(e); return; }
            if (e.composedPath().includes(this.part('toggle')) && this.expandable) this.setExpanded(!this.expanded);
            else this.select();
        };
        this.part('row').addEventListener('click', this.$c);
        this.watchSlot('', () => this.requestUpdate());
    }
    setExpanded(value) { if (value === this.expanded || !this.expandable) return; this.expanded = value; this.emit('pk-toggle', { id: this.value || this.label, expanded: value }); }
    select(fromLink) { if (this.disabled) return; if (this.href && !fromLink) { this.part('label').click(); return; } this.emit('pk-select', { id: this.value || this.label }); }
    go(e) {
        if (e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || !this.$href) return;
        e.preventDefault();
        if (this.emit('pk-navigate', { to: this.href, href: this.$href }, { cancelable: true })) this.ownerDocument.defaultView?.location?.assign(this.$href);
    }
    // A label cut off at the pane edge gets its full text as a native tooltip (only while it is cut off, so a short label has none).
    tip() {
        const l = this.part('label');
        if (l.scrollWidth > l.clientWidth) l.title = l.querySelector('slot').assignedNodes({ flatten: true }).map(n => n.textContent).join('').trim(); else l.removeAttribute('title');
    }
    updated() {
        if (!this.$tip) { this.$tip = true; this.part('label')?.addEventListener('pointerenter', () => this.tip()); }
        const a = this.part('label');
        const href = this.href ? safeHref(this.href) : '';
        this.$href = href;
        if (this.href && !href) this.warnOnce('href', `href=${JSON.stringify(this.href)} is not a same-site path, http(s), mailto, tel or sms address: the row has no link`, { href: this.href });
        if (href) a.setAttribute('href', href); else a.removeAttribute('href');
        if (href && this.selected) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
        this.expandable = this.slotted().some(c => c.localName === 'pk-tree-item');
        this.part('children').hidden = !this.expanded || !this.expandable;
        let level = 1;
        for (let p = this.parentElement?.closest('pk-tree-item'); p; p = p.parentElement?.closest('pk-tree-item')) level++;
        this.style.setProperty('--pk-tree-item-level', String(level));
    }
};
