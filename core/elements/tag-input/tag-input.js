// pk-tag-input behaviour: free-text tags typed into one control. Enter or a separator adds, paste splits, Backspace in an empty field removes the last, duplicates and a maximum are handled.
export function parseTags(text, separators = ',') {
    const cut = new RegExp(`[${separators.replace(/[\]\\^-]/g, '\\$&')}\\n\\r]`);
    return String(text ?? '').split(cut).map(t => t.trim()).filter(Boolean);
}
// Add pieces to a tag list. Returns the new list and why anything was refused ('duplicate' | 'limit').
export function addTags(tags, incoming, { unique = true, max = Infinity } = {}) {
    const next = [...tags]; const refused = [];
    for (const tag of incoming) {
        if (next.length >= max) refused.push({ tag, why: 'limit' });
        else if (unique && next.some(t => t.toLowerCase() === tag.toLowerCase())) refused.push({ tag, why: 'duplicate' });
        else next.push(tag);
    }
    return { tags: next, refused };
}

export default Base => class extends Base {
    connected() {
        if (this.$init) return;
        this.$init = true; this.$initial = this.value;
        const f = this.part('field');
        f.addEventListener('keydown', e => this.key(e));
        f.addEventListener('paste', e => { const pieces = parseTags(e.clipboardData?.getData('text') ?? '', this.separators); if (!pieces.length) return; e.preventDefault(); this.add(pieces); });
        f.addEventListener('focusout', () => { if (f.value.trim()) { this.add(parseTags(f.value, this.separators)); f.value = ''; } });
        this.part('box').addEventListener('click', e => { const x = e.target.closest?.('.px'); if (x) this.removeTag(x.previousElementSibling.textContent); f.focus(); });
    }
    get tags() { return this.value === '' ? [] : this.value.split(','); }
    get lockedTagList() { return parseTags(this.lockedTags, ','); }
    set tags(list) { this.value = list.join(','); }
    say(text) { this.part('status').textContent = text; }
    commit(list, said) {
        this.value = list.join(',');
        this.say(said);
        for (const t of ['input', 'change']) this.dispatchEvent(new Event(t, { bubbles: true, composed: true }));
        this.emit('pk-tags-change', { value: list.join(','), tags: list });
    }
    add(pieces) {
        const { tags, refused } = addTags(this.tags, pieces, { unique: !this.allowDuplicates, max: this.max > 0 ? this.max : Infinity });
        const added = tags.length - this.tags.length;
        if (added) this.commit(tags, `Added ${tags.slice(-added).join(', ')}`);
        else if (refused.length) this.say(refused[0].why === 'limit' ? 'Tag limit reached' : `${refused[0].tag} is already added`);
    }
    removeTag(tag) { const t = this.tags; const i = t.indexOf(tag); if (i >= 0) this.commit(t.filter((_, n) => n !== i), `Removed ${tag}`); }
    key(e) {
        const f = e.target;
        if (e.key === 'Enter' || (e.key.length === 1 && this.separators.includes(e.key))) {
            e.preventDefault();
            const pieces = parseTags(f.value, this.separators);
            if (pieces.length) { this.add(pieces); f.value = ''; }
        } else if (e.key === 'Backspace' && f.value === '' && this.tags.length) this.removeTag(this.tags.at(-1));
    }
    updated() {
        const box = this.part('box'); const f = this.part('field'); const tpl = this.shadowRoot.querySelector('template'); const holder = box.querySelector('.tags');
        const locked = this.lockedTagList.map(t => { const p = tpl.content.firstElementChild.cloneNode(true); p.querySelector('.pl').textContent = t; p.querySelector('.px').remove(); p.dataset.locked = ''; p.title = this.lockedTitle; return p; });
        const editable = this.tags.map(t => { const p = tpl.content.firstElementChild.cloneNode(true); p.querySelector('.pl').textContent = t; p.querySelector('.px').setAttribute('aria-label', `Remove ${t}`); return p; });
        holder.replaceChildren(...locked, ...editable);
        this.setValidity(this.required && this.tags.length === 0 ? { valueMissing: true } : {}, 'Add at least one tag.', f);
        const fd = new FormData(); for (const t of this.tags) fd.append(this.name, t); this.setFormValue(fd);
    }
    onReset() { this.value = this.$initial ?? ''; }
    onRestore() {}
    focus(o) { this.part('field').focus(o); }
};
