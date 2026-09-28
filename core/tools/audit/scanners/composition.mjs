// Shared hand-rolled-interaction scanner (design section 2.1, D3-D6): the same regex logic that used to live
// only inside core/tests/composition-audit.test.mjs (the internal core/site + core/modules gate), extracted so
// the internal test and the consumer-facing D3-D6 rules (core/tools/audit/families/d-rules.mjs) read one
// implementation and can never drift apart (#612, A-2 of the conformance-audit design). Behaviour is
// unchanged: same patterns, same "at least two of the arrow/Home/End keys" rule for D4.
import { hitAt } from '../util.mjs';

const DRAG = /\bsetPointerCapture\s*\(|addEventListener\(\s*['"]pointerdown['"]/;
const DRAG_MOVE = /addEventListener\(\s*['"]pointermove['"]/;
const ARROW_KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'];
const KEYDOWN = /addEventListener\(\s*['"]keydown['"]/;
const FOCUS_TRAP = /querySelectorAll\(\s*['"]\[tabindex/;
const MANUAL_ROLE = /role\s*=\s*["'`](separator|dialog|menu|listbox)["'`]/;

// D3: raw pointer-drag wiring (setPointerCapture, or pointerdown paired with pointermove in the same file).
export function scanPointerDrag(text) {
    if (!(DRAG.test(text) && DRAG_MOVE.test(text))) return [];
    const m = DRAG.exec(text);
    return [hitAt(text, m.index, 'raw pointer-drag wiring (setPointerCapture/pointerdown + pointermove)')];
}

// D4: a keydown handler in a file that also branches on at least two of the arrow/Home/End keys.
export function scanArrowKeyNav(text) {
    if (!KEYDOWN.test(text)) return [];
    const seen = ARROW_KEYS.filter(k => text.includes(k));
    if (seen.length < 2) return [];
    const m = KEYDOWN.exec(text);
    return [hitAt(text, m.index, `arrow/Home/End key navigation (keydown branching on ${seen.join(', ')})`)];
}

// D5: a hand-built focus trap collecting [tabindex] elements to cycle focus manually.
export function scanFocusTrap(text) {
    const m = FOCUS_TRAP.exec(text);
    return m ? [hitAt(text, m.index, 'hand-built focus trap ([tabindex] collection)')] : [];
}

// D6: a manual interactive ARIA role assigned from script.
export function scanManualRole(text) {
    const m = MANUAL_ROLE.exec(text);
    return m ? [hitAt(text, m.index, `manual interactive ARIA role set from script (role="${m[1]}")`)] : [];
}
