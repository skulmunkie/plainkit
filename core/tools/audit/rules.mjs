// THE rule table (design section 1): one entry per rule (id, category, severities, detects, hint source, fix
// template, doc anchor), built on the pure engine of core/tools/strict/engine.mjs (#605, A-1). #612 (A-2) supplied
// the S family (kept from #515, severities made concrete for a consumer) and the D family (duplicating an element
// or its interaction logic). #625 (A-4) added T (tokens and standards) and A (accessibility attributes). This PR
// (A-7) added P (pages and app structure: mountApp/defineModule usage versus ad hoc page structure, design
// section 2.3). A-9 adds B (Blazor/Razor only: a raw tag versus a Pk* component, a component's own parameters,
// design section 2.6), sourced from blazor/mappings/*.json through core/tools/audit/data.mjs.
//
// Constraint (design section 11): this module, and everything under core/tools/audit/, must never import from
// core/js, core/elements or core/site - it stays pure and standalone, runnable from a consumer's own project.
import { registerRuleset } from '../strict/engine.mjs';
import { applyFix } from './util.mjs';
import { S_RULES } from './families/s-rules.mjs';
import { D_RULES } from './families/d-rules.mjs';
import { T_RULES } from './families/t-rules.mjs';
import { A_RULES } from './families/a-rules.mjs';
import { P_RULES } from './families/p-rules.mjs';
import { B_RULES } from './families/b-rules.mjs';

// The table: every row from every family, in id order for a stable --list-rules/--explain rendering later.
export const RULES = [...S_RULES, ...D_RULES, ...P_RULES, ...T_RULES, ...A_RULES, ...B_RULES];

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
        ...(row.appliesToRun ? { appliesToRun: row.appliesToRun } : {}),
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
