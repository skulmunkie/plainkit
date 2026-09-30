// Per-tier raw-HTML rules (#736 phase 3, spec section 4). Reuses D1 (raw tag with a pk-* equivalent) and S3 (class, className, classList) unchanged, scanning
// the sources of component-, page- and shell-tier elements; element-tier sources are exempt (they own their tree). Shell: the landmark tags a shell
// must draw (header, footer, nav, main) are exempt from D1. core/tests/tier-tags.test.mjs holds the counts to core/tools/tier-tags.baseline.json:
// a count above the baseline fails (new debt), a count below it fails until the baseline is lowered (the baseline only shrinks).
import './audit/rules.mjs';
import { D_RULES } from './audit/families/d-rules.mjs';
import { S_RULES } from './audit/families/s-rules.mjs';

const RULES = [D_RULES.find(r => r.id === 'D1'), S_RULES.find(r => r.id === 'S3')];
const SHELL_LANDMARKS = new Set(['header', 'footer', 'nav', 'main']);
// T1: a raw structural div or span (no pk-* equivalent yet, baselined per component and removed one by one, spec section 1 item 4). Shell exempts both (spec section 4).
const STRUCTURAL = [[/<(div|span)\b/gi, 'html'], [/createElement\(\s*['"`](div|span)['"`]/g, 'js']];
const SCANNED = new Set(['component', 'page', 'shell']);

// Map of "<rule> <element> <found>" to the number of hits, over the html template (D1, S3, T1) and the behaviour script (S3, T1).
export function checkTierTags(elements) {
    const counts = new Map();
    for (const el of elements) {
        if (!SCANNED.has(el.meta.tier)) continue;
        const files = [{ path: `${el.name}.html`, text: el.template }, ...(el.behaviour ? [{ path: `${el.name}.js`, text: el.behaviour }] : [])];
        for (const rule of RULES) {
            for (const f of files) {
                if (!rule.applies(f)) continue;
                for (const hit of rule.scan(f)) {
                    if (rule.id === 'D1' && el.meta.tier === 'shell' && SHELL_LANDMARKS.has(hit.found)) continue;
                    const k = `${rule.id} ${el.name} ${hit.found}`;
                    counts.set(k, (counts.get(k) ?? 0) + 1);
                }
            }
        }
        if (el.meta.tier !== 'shell') {
            for (const [re, kind] of STRUCTURAL) {
                const text = kind === 'html' ? el.template : el.behaviour;
                for (const m of (text ?? '').matchAll(re)) {
                    const k = `T1 ${el.name} ${m[1].toLowerCase()}`;
                    counts.set(k, (counts.get(k) ?? 0) + 1);
                }
            }
        }
    }
    return counts;
}

export const entryKey = e => `${e.rule} ${e.element} ${e.found}`;
