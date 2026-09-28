// Plainkit code view logic: a read-only, line-numbered listing. Pure helpers plus the element that draws the rows with DOM APIs only.

// The line numbers named by "3, 5-7" (a number, or a range, separated by commas); anything else is ignored.
export function parseLines(spec) {
    const out = new Set();
    for (const part of String(spec ?? '').split(',')) {
        const m = /^\s*(\d+)\s*(?:-\s*(\d+))?\s*$/.exec(part);
        if (!m) continue;
        const a = Number(m[1]), b = Number(m[2] ?? m[1]);
        for (let n = a; n <= b && n - a < 100000; n++) out.add(n);
    }
    return out;
}

// The source lines: the `lines` array when there is one, otherwise the element's text (blank ends trimmed, CRLF normalised).
export function sourceLines(lines, text) {
    if (Array.isArray(lines) && lines.length) return lines.map(l => String(l ?? ''));
    const all = String(text ?? '').replace(/\r\n?/g, '\n').split('\n');
    while (all.length && all[0].trim() === '') all.shift();
    while (all.length && all[all.length - 1].trim() === '') all.pop();
    return all;
}

// A line's segments as [{ text, kind, match, word }]: the supplied ones when there are any, otherwise the whole line as one plain segment.
export function lineSegments(text, segments) {
    if (Array.isArray(segments) && segments.length) return segments.map(s => ({ text: String(s?.text ?? ''), kind: /^[a-z-]+$/.test(s?.kind ?? '') ? s.kind : 'plain', match: !!s?.match, word: !!s?.word }));
    return text === '' ? [] : [{ text, kind: 'plain', match: false, word: false }];
}

export default Base => class extends Base {
    connected() {
        this.$m = new MutationObserver(() => this.requestUpdate());
        this.$m.observe(this, { childList: true, characterData: true, subtree: true });
        if (this.$c) return;
        this.$c = () => this.picked();
        this.part('rows').addEventListener('click', this.$c);
    }
    disconnected() { this.$m?.disconnect(); }
    // A click that leaves a caret in a line's code reports the line and the column of the caret.
    picked() {
        const root = this.shadowRoot, sel = root.getSelection?.() ?? this.ownerDocument.getSelection();
        const at = sel?.anchorNode;
        if (!at || !sel.isCollapsed) return;
        const code = (at.nodeType === 1 ? at : at.parentElement)?.closest('.code'), row = code?.parentElement;
        if (!row || !this.part('rows').contains(row)) return;
        let column = sel.anchorOffset;
        const walker = this.ownerDocument.createTreeWalker(code, NodeFilter.SHOW_TEXT);
        for (let n = walker.nextNode(); n && n !== at; n = walker.nextNode()) column += n.textContent.length;
        this.emit('pk-line-click', { line: Number(row.dataset.line), column }, { cancelable: false });
    }
    updated() {
        const doc = this.ownerDocument, lines = sourceLines(this.lines, this.textContent), first = Math.max(1, Math.floor(Number(this.start)) || 1), lit = parseLines(this.highlight);
        const rows = lines.map((text, i) => {
            const row = doc.createElement('div'), code = doc.createElement('span'), n = first + i;
            row.className = lit.has(n) ? 'row hl' : 'row'; row.dataset.line = String(n); code.className = 'code';
            for (const s of lineSegments(text, this.segments?.[i])) {
                const cls = [s.kind !== 'plain' ? `tk-${s.kind}` : '', s.match ? 'match' : '', s.word ? 'word' : ''].filter(Boolean).join(' ');
                if (!cls) { code.append(s.text); continue; }
                const span = doc.createElement('span'); span.className = cls; span.textContent = s.text; code.append(span);
            }
            row.append(code);
            return row;
        });
        this.part('rows').replaceChildren(...rows);
        this.style.setProperty('--pk-code-view-gutter', String(String(first + Math.max(0, lines.length - 1)).length));
        if (this.maxHeight) this.style.setProperty('--pk-code-view-max-height', this.maxHeight); else this.style.removeProperty('--pk-code-view-max-height');
        // Bring the first highlighted line to the middle of the view (the view's own scroll only; the page stays where it is).
        const body = this.part('body'), target = this.part('rows').querySelector('.hl');
        if (target) body.scrollTop = target.offsetTop - (body.clientHeight - target.offsetHeight) / 2;
    }
};
