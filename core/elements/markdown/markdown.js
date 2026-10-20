// pk-markdown behaviour: a read-only view of Markdown. The text is parsed and drawn by js/markdown/ (DOM calls only: raw HTML stays text, a link must be http, https,
// mailto or relative), so nothing from the source becomes markup. A click on a relative link is reported as pk-link-click so the page can route or rewrite it.
// The renderer is imported on first use, never statically.

const NOT_RELATIVE = /^(?:[a-z][a-z0-9+.-]*:|#|\/\/)/i;
/** A link address the page resolves itself: not absolute, not an in-page anchor, not protocol-relative. */
export const isRelativeHref = href => Boolean(href) && !NOT_RELATIVE.test(href);

export default Base => class extends Base {
    connected() {
        if (this.$w) return;
        this.$w = true;
        this.part('content').addEventListener('click', e => {
            if (e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
            const href = e.target.closest?.('a[href]')?.getAttribute('href');
            if (!isRelativeHref(href)) return;
            if (!this.emit('pk-link-click', { href }) || this.interceptLinks) e.preventDefault();
        });
    }
    updated() {
        const text = this.markdown;
        if (this.$v === text) return;
        this.$v = text;
        this.$rm ??= import('../../js/markdown/render.js').catch(e => { this.$rm = null; this.log.error('markdown renderer failed to load', e); });
        this.$rm.then(m => {
            if (m && this.isConnected && text === this.markdown) this.part('content').replaceChildren(m.renderMarkdown(text, this.ownerDocument));
        });
    }
};
