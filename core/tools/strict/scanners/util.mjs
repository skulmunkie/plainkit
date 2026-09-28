// Shared line/column helpers for the strict scanners (core/tools/strict/scanners/*.mjs): a scanner walks a
// text once by character index, and a position is looked up by binary search over line-start offsets rather
// than counting newlines per character.

export function lineStarts(text) {
    const starts = [0];
    for (let i = 0; i < text.length; i++) if (text[i] === '\n') starts.push(i + 1);
    return starts;
}

export function makePosAt(text) {
    const starts = lineStarts(text);
    return index => {
        let lo = 0, hi = starts.length - 1;
        while (lo < hi) {
            const mid = (lo + hi + 1) >> 1;
            if (starts[mid] <= index) lo = mid; else hi = mid - 1;
        }
        return { line: lo + 1, column: index - starts[lo] + 1 };
    };
}
