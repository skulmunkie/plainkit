// pk-select behaviour: the browser's select in a token skin. The options are either the element's own <option> and <optgroup> children (cloned into the
// inner select) or, when the `options` property is given, built from that data straight into the inner select: the host owns its light-DOM children
// (STANDARDS "Ownership and reactivity"), so data options never get written there and instead go directly to the shadow-side control they already own.
export const flagsOf = v => { const o = {}; for (const k in v) o[k] = v[k]; return o; };
// The selected values of a select-like list of {value, selected} options.
// Comma-joined multi-value encoding: a comma inside a value is written \, and a backslash \\, only when the value needs it, so values without commas or backslashes are unchanged.
export const joinValues = list => list.map(v => (/,|\\[\\,]|\\$/.test(v) ? v.replace(/[\\,]/g, '\\$&') : v)).join(',');
export const splitValues = text => { const out = []; let cur = ''; const s = String(text ?? ''); for (let i = 0; i < s.length; i++) { const c = s[i]; if (c === '\\' && (s[i + 1] === ',' || s[i + 1] === '\\')) cur += s[++i]; else if (c === ',') { out.push(cur); cur = ''; } else cur += c; } out.push(cur); return out; };
export const selectedValues = options => options.filter(o => o.selected).map(o => o.value);
// One option entry (a plain value, or { value, label, disabled }) as an <option> element.
export function buildOption(doc, o) {
    const op = doc.createElement('option'), isObj = o && typeof o === 'object';
    const v = isObj ? o.value : o;
    op.value = v ?? ''; op.textContent = isObj ? (o.label ?? v ?? '') : String(o);
    if (isObj && o.disabled) op.disabled = true;
    return op;
}
// The `options` array (flat, or grouped as { group, options: [...] }) as <option>/<optgroup> elements.
export function buildOptions(doc, list) {
    return list.map(item => {
        if (item && typeof item === 'object' && 'group' in item) {
            const g = doc.createElement('optgroup');
            g.label = item.group ?? '';
            g.append(...(item.options ?? []).map(o => buildOption(doc, o)));
            return g;
        }
        return buildOption(doc, item);
    });
}

export default Base => class extends Base {
    connected() {
        if (this.$init) return;
        this.$init = true; this.$initial = this.value;
        const s = this.part('control');
        this.watchSlot('', () => { this.$opts = true; this.requestUpdate(); });
        this.$obs = new MutationObserver(() => { this.$opts = true; this.requestUpdate(); });
        this.$obs.observe(this, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['value', 'selected', 'disabled', 'label'] });
        s.addEventListener('change', () => { this.$typing = true; this.value = this.multiple ? joinValues(selectedValues([...s.options])) : s.value; this.dispatchEvent(new Event('change', { bubbles: true, composed: true })); this.emit('pk-value-change', { value: this.value }); });
        s.addEventListener('input', () => this.dispatchEvent(new Event('input', { bubbles: true, composed: true })));
        this.$opts = true;
    }
    changed(name) { if (name === 'options') { this.$opts = true; this.requestUpdate(); } }
    updated() {
        const s = this.part('control');
        s.multiple = this.multiple;
        if (this.$opts ?? true) {
            this.$opts = false;
            const data = Array.isArray(this.options) ? this.options : [];
            if (data.length) {
                if ([...this.children].some(c => c.localName === 'option' || c.localName === 'optgroup')) this.warnOnce('options', 'options is set: slotted option/optgroup children are ignored');
                s.replaceChildren(...buildOptions(this.ownerDocument ?? document, data));
            } else s.replaceChildren(...[...this.children].filter(c => c.localName === 'option' || c.localName === 'optgroup').map(c => c.cloneNode(true)));
            this.$pushed = false;
        }
        if (!this.$typing) {
            const wanted = this.multiple ? splitValues(this.value) : [this.value];
            if ([...s.options].some(o => wanted.includes(o.value))) for (const o of s.options) o.selected = wanted.includes(o.value);
            this.$pushed = true;
        }
        this.$typing = false;
        if (this.value === '' && s.options.length && !this.multiple) { const first = s.options[s.selectedIndex]; if (first) this.$auto = first.value; }
        this.setValidity(flagsOf(s.validity), s.validationMessage, s);
        if (this.multiple) { const fd = new FormData(); for (const v of selectedValues([...s.options])) fd.append(this.name, v); this.setFormValue(fd); } else this.setFormValue(s.value);
    }
    onReset() { this.value = this.$initial ?? ''; this.$pushed = false; }
    onRestore(state) { this.value = typeof state === 'string' ? state : this.value; this.$pushed = false; }
    focus(o) { this.part('control').focus(o); }
};
