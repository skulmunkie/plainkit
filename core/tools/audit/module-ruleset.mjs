// Registers the "module" ruleset (issue #518 A-9b) with core/tools/strict/engine.mjs's ruleset registry.
// Kept as its own entry point, separate from ./rules.mjs, because the module ruleset is not part of the
// consumer-facing rule table: it must never feed --list-rules/--explain (which read RULES from ./rules.mjs)
// or the A-8 docs-generation pipeline (scripts/build-skills.mjs renders ./rules.mjs's RULES into the public
// skills' references/conformance-rules.md - PlainKit's own dogfood rules have no place there).
//
// Importing this module for its side effect is enough: `import './module-ruleset.mjs'; checkFiles(files, {
// ruleset: 'module' })`. core/tests/strict-modules.test.mjs does exactly that.
import { registerRuleset } from '../strict/engine.mjs';
import { applyFix } from './util.mjs';
import { MODULE_RULES } from './families/module-rules.mjs';

export { MODULE_RULES };

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

registerRuleset('module', MODULE_RULES.map(toEngineRule));
