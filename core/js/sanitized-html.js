// One tiny shared sink for markup a build step has already sanitised (for example Markdown turned to HTML: raw HTML escaped, addresses checked,
// every value escaped - see tools/markdown.mjs): parsed inert in a <template> and imported, never assigned directly onto a live node.
// Used by pk-doc-page (an item's article body, its one sink - core/elements/doc-page/doc-page.js) and, until the guides page moves onto that
// page type (App framework tracker #346, step 11, issue #357), by core/site/guides/page.js, so there is exactly one place this pattern lives
// instead of two copies of the same few lines (security.allow.json counts this file's one sink for both callers).
export function fillSanitizedHtml(container, html) {
    const doc = container.ownerDocument ?? document;
    const t = doc.createElement('template');
    t.innerHTML = html;
    container.replaceChildren(doc.importNode(t.content, true));
}
