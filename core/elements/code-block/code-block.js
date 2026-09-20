// Plainkit code block logic: lines for the gutter and the copy action. Pure functions plus one injectable async copy.

// Lines of a snippet without the blank line a template literal leaves at each end; interior blank lines are kept.
export function splitLines(text) {
    const lines = String(text ?? '').replace(/\r\n?/g, '\n').split('\n');
    while (lines.length && lines[0].trim() === '') lines.shift();
    while (lines.length && lines[lines.length - 1].trim() === '') lines.pop();
    return lines;
}

// Remove the indentation every non-blank line shares, so a snippet written inside indented markup reads flush left.
export function dedent(text) {
    const lines = splitLines(text);
    const indents = lines.filter(l => l.trim()).map(l => /^[ \t]*/.exec(l)[0].length);
    const cut = indents.length ? Math.min(...indents) : 0;
    return lines.map(l => l.slice(cut)).join('\n');
}

// Width of the line-number gutter in characters for `count` lines.
export const gutterWidth = count => String(Math.max(1, count)).length;

// Copy text with the async clipboard when there is one; resolves true on success, false when copying is unavailable or refused.
export async function copyText(text, clipboard = globalThis.navigator?.clipboard) {
    if (!clipboard?.writeText) return false;
    try { await clipboard.writeText(text); return true; } catch { return false; }
}

export default Base => class extends Base {
    connected() {
        this.$m = new MutationObserver(() => this.requestUpdate());
        this.$m.observe(this, { childList: true, characterData: true, subtree: true });
        if (this.$c) return;
        this.$c = async e => {
            if (e.target.closest('[part="wrap"]')) { this.wrap = !this.wrap; return; }
            if (!e.target.closest('[part="copy"]')) return;
            const ok = await copyText(dedent(this.textContent));
            this.part('status').textContent = ok ? 'Copied' : 'Copy failed';
            this.emit('pk-copy', { ok });
            clearTimeout(this.$t); this.$t = setTimeout(() => { this.part('status').textContent = ''; }, 2000);
        };
        this.shadowRoot.addEventListener('click', this.$c);
    }
    disconnected() { this.$m?.disconnect(); }
    updated() {
        const doc = this.ownerDocument, lines = splitLines(dedent(this.textContent));
        this.part('code').replaceChildren(...lines.map(l => { const s = doc.createElement('span'); s.className = 'line'; s.textContent = l === '' ? '​' : l; return s; }));
        this.part('body').setAttribute('aria-label', this.label || 'Code');
        this.part('wrap').setAttribute('aria-pressed', String(this.wrap));
        this.part('copy').hidden = this.noCopy;
        this.style.setProperty('--pk-code-block-gutter', String(gutterWidth(lines.length)));
        if (this.maxHeight) this.style.setProperty('--pk-code-block-max-height', this.maxHeight); else this.style.removeProperty('--pk-code-block-max-height');
    }
};
