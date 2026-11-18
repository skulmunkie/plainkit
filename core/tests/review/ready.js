// Readiness of a review page: every custom element in an example, including the ones inside the shadow trees of other elements, is defined and upgraded
// before anything is measured. An element such as pk-lookup-picker loads the elements its own shadow tree uses (pk-button, pk-icon) after it is defined,
// so waiting on the tags of the light DOM alone measured an undefined pk-icon (an inline box, 0x19) and reported "zero-size-media" now and then.

/** The custom element tags (a name with a dash) found under `root`, descending into open shadow roots, that are not defined yet. */
export function undefinedTags(root, isDefined = tag => Boolean(customElements.get(tag))) {
    const out = new Set();
    const walk = node => {
        for (const el of node.querySelectorAll('*')) {
            if (el.localName.includes('-') && !isDefined(el.localName)) out.add(el.localName);
            if (el.shadowRoot) walk(el.shadowRoot);
        }
    };
    walk(root);
    return [...out];
}

function rootsWith(root, tags) {
    const roots = [root];
    const walk = node => { for (const el of node.querySelectorAll('*')) if (el.shadowRoot) { roots.push(el.shadowRoot); walk(el.shadowRoot); } };
    walk(root);
    return roots.filter(r => tags.some(t => r.querySelector(t)));
}

/**
 * Loads and waits for every undefined element under `root` (shadow trees included) until none is left, or `limit` ms passed (then it says which).
 * `load(node)` is the loader's loadElements for a root; `whenDefined(tag)` is customElements.whenDefined; `pause(ms)` a timer.
 */
export async function whenUpgraded(root, { load, whenDefined = t => customElements.whenDefined(t), isDefined, pause = ms => new Promise(r => setTimeout(r, ms)), limit = 5000, log } = {}) {
    const started = Date.now();
    for (;;) {
        const tags = undefinedTags(root, isDefined);
        if (!tags.length) return [];
        if (Date.now() - started > limit) { log?.warn(`still undefined after ${limit} ms: ${tags.join(', ')}`); return tags; }
        // a shadow tree is not seen by the loader's own observer, so hand it each root that holds an undefined tag
        if (load) for (const node of rootsWith(root, tags)) await load(node);
        await Promise.race([Promise.all(tags.map(t => Promise.resolve(whenDefined(t)).catch(() => null))), pause(50)]);
    }
}

/** The pk-markdown elements under `root` (shadow trees included) that have text but have not drawn it yet: its renderer is a lazy chunk (#2025). */
export function undrawnMarkdown(root) {
    const out = [];
    const walk = node => {
        for (const el of node.querySelectorAll('*')) {
            if (el.localName === 'pk-markdown' && el.markdown && !el.shadowRoot?.querySelector('[part=content]')?.hasChildNodes()) out.push(el);
            if (el.shadowRoot) walk(el.shadowRoot);
        }
    };
    walk(root);
    return out;
}

/** Waits for the pk-markdown-render event of every pk-markdown that has not drawn yet, or `limit` ms (then it says so); returns how many never drew. */
export async function whenMarkdownDrawn(root, { limit = 5000, pause = ms => new Promise(r => setTimeout(r, ms)), log } = {}) {
    const waits = undrawnMarkdown(root).map(el => new Promise(r => el.addEventListener('pk-markdown-render', r, { once: true })).then(() => 1));
    if (!waits.length) return 0;
    let done = 0;
    await Promise.race([Promise.all(waits.map(w => w.then(() => { done++; }))), pause(limit)]);
    if (done < waits.length) log?.warn(`pk-markdown did not draw within ${limit} ms (${waits.length - done} left)`);
    return waits.length - done;
}
