// pk-markdown behaviour: a read-only view of Markdown. The text is parsed and drawn by js/markdown/ (DOM calls only: raw HTML stays text, a link must be http, https,
// mailto or relative), so nothing from the source becomes markup. A click on a relative link is reported as pk-link-click so the page can route or rewrite it.
// The renderer is imported on first use, never statically. Headings get slug ids; a #anchor click scrolls to its heading inside the element (the ids live in the
// shadow tree, so the browser cannot). baseUrl is the folder relative links and images are resolved against, so the DOM carries the final address; after each
// draw pk-markdown-render hands the host the content root (to swap a diagram fence for a rendered diagram, for example).

const NOT_RELATIVE = /^(?:[a-z][a-z0-9+.-]*:|#|\/\/)/i;
/** A link address the page resolves itself: not absolute, not an in-page anchor, not protocol-relative. */
export const isRelativeHref = href => Boolean(href) && !NOT_RELATIVE.test(href);

/** A function that resolves an address against `base` (http or https only), or undefined; the renderer checks every result again. */
const resolver = (el, base) => {
    if (!base) return undefined;
    let b = null;
    try { b = new URL(base, el.ownerDocument.baseURI); } catch (e) { el.warnOnce('baseUrl', 'baseUrl is not an address; relative links stay as written', { base, error: String(e) }); }
    if (!b) return undefined;
    if (!/^https?:$/.test(b.protocol)) { el.warnOnce('baseUrl-scheme', 'baseUrl must be http, https or a relative path; relative links stay as written', { base }); return undefined; }
    return u => (URL.canParse(u, b) ? new URL(u, b).href : null);
};

export default Base => class extends Base {
    connected() {
        if (this.$w) return;
        this.$w = true;
        this.part('content').addEventListener('click', e => {
            if (e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
            const href = e.target.closest?.('a[href]')?.getAttribute('href');
            if (href?.length > 1 && href[0] === '#') {
                const id = href.slice(1), target = [...(this.part('content').querySelectorAll?.('[id]') ?? [])].find(h => h.id === id);
                if (target) { e.preventDefault(); target.scrollIntoView?.(); }
                return;
            }
            if (!isRelativeHref(href)) return;
            if (!this.emit('pk-link-click', { href }) || this.interceptLinks) e.preventDefault();
        });
    }
    updated() {
        const text = this.markdown, key = (this.baseUrl ?? '') + '\n' + text;
        if (this.$v === key) return;
        this.$v = key;
        this.$rm ??= import('../../js/markdown/docs.js').catch(e => { this.$rm = null; this.log.error('markdown renderer failed to load', e); });
        this.$rm.then(m => {
            if (!m || !this.isConnected || key !== this.$v) return;
            const root = this.part('content');
            root.replaceChildren(m.renderDocs(text, this.ownerDocument, { ids: true, resolve: resolver(this, this.baseUrl) }));
            this.emit('pk-markdown-render', { root });
        });
    }
};
