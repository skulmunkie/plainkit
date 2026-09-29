// Shared pure logic for a keyboard-driven structural reorder of a tree-shaped document: Up/Down move the selected node among its
// own siblings, In makes it a child of the sibling immediately before it (indent), Out promotes it to its parent's own siblings
// (outdent). This is the arrow/Home/End "move the node itself" pattern (as opposed to plain arrow-key focus navigation, which
// js/roving.js already covers for DOM lists): pk-sortable's Alt+Up/Down only reorders a flat list of siblings, and pk-tree only
// navigates and expands, so neither owns changing a node's depth today (issue #395). Anything that lets people reparent and
// reorder tree nodes with the keyboard can share this instead of hand-rolling it again.
//
// No DOM and no document-model assumptions: the caller describes "where is this node" through `locate`, so it works equally over
// a DOM tree, an in-memory document (js/layout-model.js's { parent, slots }), or anything else shaped like a tree.

// The four keys this pattern binds, and the direction each means.
export const MOVE_KEYS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'out', ArrowRight: 'in' };

// `locate(id)` returns null when `id` is not in the tree, else { parentId, siblings, index }: `siblings` is the ordered list of
// entries at the same level as `id` (including it, at `index`), and `parentId` is the id of the containing node, or null at the
// root. `adopterId(entry)` returns the id that entry would become the new parent, for 'in', or a falsy value when that entry
// cannot take a child (the default accepts any entry whose own `id` field is truthy, which skips a plain string/text entry).
//
// The result describes where `id` should move to: { id, parentId, index }, with `index` undefined for 'in' (append). Null when the
// direction has nowhere to go (already first/last, no parent to outdent to, or no adopting sibling above it).
export function moveTarget(id, direction, locate, adopterId = entry => entry?.id) {
    const at = locate(id);
    if (!at) return null;
    const { parentId, siblings, index } = at;
    if (direction === 'up') return index > 0 ? { id, parentId, index: index - 1 } : null;
    if (direction === 'down') return index < siblings.length - 1 ? { id, parentId, index: index + 1 } : null;
    if (direction === 'out') {
        if (parentId == null) return null;
        const up = locate(parentId);
        if (!up) return null;
        return { id, parentId: up.parentId, index: up.index + 1 };
    }
    if (direction === 'in') {
        for (let k = index - 1; k >= 0; k--) {
            const pid = adopterId(siblings[k]);
            if (pid) return { id, parentId: pid, index: undefined };
        }
        return null;
    }
    return null;
}
