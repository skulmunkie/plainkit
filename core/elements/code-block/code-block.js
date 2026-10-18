import { copyText, copyAndAnnounce } from '../../js/clipboard.js';
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

export { copyText };

export default Base => class extends Base {
    connected() {
        this.$m = new MutationObserver(() => this.requestUpdate());
        this.$m.observe(this, { childList: true, characterData: true, subtree: true });
        if (this.$c) return;
        this.$c = async e => {
            if (e.target.closest('[part="wrap"]')) { this.wrap = !this.wrap; this.emit('pk-wrap-change', { wrap: this.wrap }, { cancelable: false }); return; }
            if (!e.target.closest('[part="copy"]')) return;
            await copyAndAnnounce(this, dedent(this.textContent));
        };
        this.shadowRoot.addEventListener('click', this.$c);
    }
    disconnected() { this.$m?.disconnect(); }
    updated() {
        const doc = this.ownerDocument, lines = splitLines(dedent(this.textContent));
        this.part('code').replaceChildren(...lines.map(l => { const s = doc.createElement('span'); s.setAttribute('part', 'line'); s.textContent = l === '' ? '​' : l; return s; }));
        this.part('body').setAttribute('aria-label', this.label || 'Code');
        this.part('wrap').setAttribute('aria-pressed', String(this.wrap));
        this.part('copy').hidden = this.noCopy;
        this.style.setProperty('--pk-code-block-gutter', String(gutterWidth(lines.length)));
        if (this.maxHeight) this.style.setProperty('--pk-code-block-max-height', this.maxHeight); else this.style.removeProperty('--pk-code-block-max-height');
    }
};
