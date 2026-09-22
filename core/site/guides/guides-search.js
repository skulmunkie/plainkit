// Full-text search over the Guides. Title search is free (a guide's own title, checked live); body search needs an index: each guide's plain text
// (title, summary and its HTML body with the markup stripped) reduced to a small, deduplicated word list at build time (tools/guides.mjs, stored as
// `words` in guides.data.js). This module holds both the indexer and the matcher as pure functions, so a node test can run them without a DOM and
// the page (page.js) can import the same matcher it tests. No dependency, no fuzzy matching: substring checks only, same spirit as filterLeaves
// and filterTree in js/gallery-options.js (the gallery's title-only search), extended here with the body index.

const TAG = /<[^>]*>/g; // the build's own sanitised HTML (tools/markdown.mjs): no script, style or handler markup ever reaches this
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" };

/** Plain text of sanitised guide HTML: tags dropped, the handful of entities markdownToHtml writes decoded back to their characters. */
export function htmlToText(html) {
    return String(html ?? '').replace(TAG, ' ').replace(/&(amp|lt|gt|quot|#39);/g, (_, e) => ENTITIES[e]);
}

/** Lowercase words of two or more letters/digits (an internal apostrophe kept, "don't"), deduplicated and sorted: the unit the index and the matcher share. */
export function indexWords(text) {
    const words = String(text ?? '').toLowerCase().match(/[a-z0-9]+(?:['’][a-z]+)?/g) ?? [];
    return [...new Set(words.filter(w => w.length >= 2))].sort();
}

/** The word index stored for one guide (tools/guides.mjs, as `words`): its title, summary and body text, so a query matches without opening the guide. */
export const guideWords = (title, summary, html) => indexWords(`${title ?? ''} ${summary ?? ''} ${htmlToText(html)}`);

/**
 * Guides matching `query` against `guides` (each needs at least `title`; `words` from the build enables body matches), ranked with title hits first,
 * then more matched terms, then title order. Every term in a multi-word query must match (in the title or the word index) for a guide to qualify.
 * Returns [{ guide, score, titleMatch, bodyMatch }], highest score first; an empty or blank query returns no results (the page shows everything then).
 */
export function searchGuides(guides, query) {
    const terms = indexWords(query);
    if (!terms.length) return [];
    const results = [];
    for (const guide of guides ?? []) {
        const title = String(guide.title ?? '').toLowerCase();
        const words = indexWords(guide.words); // guides.data.js stores it as one space-separated string (so it stays on one line, see tools/guides.mjs); a
        // hand-built fixture in a test may pass an array instead, and indexWords reads either the same way.
        let score = 0, titleMatch = false, bodyMatch = false, hits = 0;
        for (const term of terms) {
            if (title.includes(term)) { score += 10; titleMatch = true; hits++; }
            else if (words.some(w => w.includes(term))) { score += 1; bodyMatch = true; hits++; }
        }
        if (hits === terms.length) results.push({ guide, score, titleMatch, bodyMatch });
    }
    return results.sort((a, b) => b.score - a.score || a.guide.title.localeCompare(b.guide.title));
}
