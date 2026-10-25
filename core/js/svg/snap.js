// SVG toolkit, snap targets (#431, phase S4). Pure: no DOM, no side effects. What pk-canvas snaps a moving selection to (its `targets` property, canvas
// spec 2026-10-19 sections 5.3 and 5.4): every shape of the document that is not being moved, as a world rect in the canvas's shape { id, x, y, w, h },
// and the page { id: 'page', x: 0, y: 0, w: width, h: height } first. Groups give their shapes one by one, so a moved shape snaps to a shape inside a
// group; an excluded group takes its whole subtree out. One walk over the document, so it stays linear.
//
//   canvas.targets = snapTargets(doc, { exclude: selection });   // options.page false leaves the page out; options.text(node) measures text (bounds.js)

import { IDENTITY, multiply } from './matrix.js';
import { nodeBounds } from './bounds.js';

export function snapTargets(doc, { exclude = [], page = true, ...options } = {}) {
    const out = [];
    if (!doc?.root) return out;
    const skip = new Set(Array.isArray(exclude) ? exclude : [exclude]);
    if (page) out.push({ id: 'page', x: 0, y: 0, w: doc.width, h: doc.height });
    const visit = (n, m) => {
        if (!n || skip.has(n.id)) return;
        if (n.type === 'g') { const w = multiply(m, n.attrs?.transform ?? IDENTITY); for (const c of n.children ?? []) visit(c, w); return; }
        const b = nodeBounds(n, m, options);
        if (b) out.push({ id: n.id, x: b.x, y: b.y, w: b.width, h: b.height });
    };
    visit(doc.root, IDENTITY);
    return out;
}
