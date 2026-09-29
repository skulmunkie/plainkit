// THE rule table (design section 1): one entry per rule (id, category, severities, detects, hint source, fix
// template, doc anchor), built on the pure engine of core/tools/strict/engine.mjs (#605, A-1). This PR (#612,
// A-2) supplies the S family (kept from #515, severities made concrete for a consumer) and the D family
// (duplicating an element or its interaction logic). Families P, T, A, B and the CLI that consumes this table
// are later slices (A-3 through A-9); this module is usable standalone today via `checkFiles`.
//
// Constraint (design section 11): this module, and everything under core/tools/audit/, must never import from
// core/js, core/elements or core/site - it stays pure and standalone, runnable from a consumer's own project.
import { registerRuleset } from '../strict/engine.mjs';
import { applyFix } from './util.mjs';
import { S_RULES } from './families/s-rules.mjs';
import { D_RULES } from './families/d-rules.mjs';

// The table: every row from every family, in id order for a stable --list-rules/--explain rendering later.
export const RULES = [...S_RULES, ...D_RULES];

export function getRuleMeta(id) {
    return RULES.find(r => r.id === id);
}

// Turns one table row into the engine's `{ id, applies, scan, meta }` rule shape: `scan` fills the row's
// `fixTemplate` from whatever slots the row's own scan() put on each hit, plus `{file}`/{line} from the finding
// itself, so a family only ever writes the parts of the fix message that are specific to it.
function toEngineRule(row) {
    return {
        id: row.id,
        applies: row.applies,
        meta: { category: row.category, detects: row.detects, severity: row.severity, docs: row.docs },
        scan(file) {
            return row.scan(file).map(hit => ({
                line: hit.line,
                column: hit.column,
                message: hit.message,
                fix: applyFix(row.fixTemplate, { file: file.path, line: hit.line, docs: row.docs, attrs: '', ...hit }),
            }));
        },
    };
}

// One rule list, two ruleset names: severity (normal vs strict) is metadata read by the CLI later (A-5), not a
// difference in which rules run - design section 2.2: "what differs for a consumer is only the severity".
const ENGINE_RULES = RULES.map(toEngineRule);
registerRuleset('consumer', ENGINE_RULES);
registerRuleset('consumer-strict', ENGINE_RULES);
