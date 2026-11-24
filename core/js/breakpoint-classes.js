// Runtime hook for the page-level responsive classes of breakpoints of your own (#124). A custom export carries them as plainkit-breakpoints.css;
// this applies the same two attributes without that file, or with other widths, while the page runs:
//
//   import { applyBreakpointClasses } from './js/breakpoint-classes.js';
//   const hook = applyBreakpointClasses([{ name: 'laptop', width: 1400 }]);   // or the plainkit.custom.json object: { ownBreakpoints: [...] }
//   hook.update([{ name: 'laptop', width: 1280 }]);                           // new widths replace the old ones
//   hook.remove();
//
// data-show-above="name" is hidden at and below the width, data-hide-above="name" above it: the rules of plainkit-breakpoints.css, written through the CSSOM
// into one adopted stylesheet (no style element or attribute, so a strict style-src is fine). Element breakpoints cannot change at runtime; only a custom build changes them.
import { createLogger } from './log.js';

const log = createLogger('breakpoint-classes');
const NAME = /^[a-z][a-z0-9]*$/;

/** The valid { name, width } entries of a list or of a plainkit.custom.json object; a bad one is logged and left out. */
export function readBreakpointList(input) {
    const list = Array.isArray(input) ? input : input?.ownBreakpoints ?? [];
    return list.filter(e => {
        const ok = NAME.test(e?.name) && Number.isInteger(e?.width) && e.width > 0;
        if (!ok) log.warn('a breakpoint of your own was left out: names are lowercase letters and digits, widths whole pixels', e);
        return ok;
    });
}

/** The rules for the list, as text pairs [media condition, attribute selector]. */
export function breakpointRules(list) {
    return readBreakpointList(list).flatMap(({ name, width }) => [
        [`(max-width: ${width}px)`, `[data-show-above="${name}"]`],
        [`(min-width: ${width + 1}px)`, `[data-hide-above="${name}"]`],
    ]);
}

/** Applies the rules to the document (default: the page); returns { update(list), remove(), sheet }. Another call replaces nothing: use update. */
export function applyBreakpointClasses(input, doc = document) {
    const sheet = new (doc.defaultView ?? globalThis).CSSStyleSheet();
    const fill = list => {
        while (sheet.cssRules.length) sheet.deleteRule(0);
        for (const [cond, sel] of breakpointRules(list)) sheet.insertRule(`@media ${cond} { ${sel} { display: none !important; } }`, sheet.cssRules.length);
    };
    fill(input);
    doc.adoptedStyleSheets = [...doc.adoptedStyleSheets, sheet];
    return {
        sheet,
        update: fill,
        remove() { doc.adoptedStyleSheets = doc.adoptedStyleSheets.filter(s => s !== sheet); },
    };
}
