// The by-tier composition report for the SDK Scorecard (#769, part of #736): how many elements each tier holds (from every meta.json `tier`) and the
// baseline debt per tier and per rule (C1, C4 from tiers.baseline.json; D1, S3, T1 from tier-tags.baseline.json). Pure; the build writes it to
// site/scorecard/tiers.current.json (precomputed, #197), the scorecard's "tiers" section only draws it. Debt is attributed to the tier of the element it
// sits in. There is no delta against the last release: the release baseline (api.baseline.json) holds the API surface, not this debt.
import { TIERS } from './element-api.mjs';

export const DEBT_RULES = ['C1', 'C4', 'D1', 'S3', 'T1'];

/** elements: loadElementSources() (name, meta.tier); tiersBaseline / tagsBaseline: the parsed baseline files. */
export function tierReport(elements, tiersBaseline, tagsBaseline, modulesBaseline = null) {
    const tierOf = new Map(elements.map(e => [e.name, e.meta.tier]));
    const counts = Object.fromEntries(TIERS.map(t => [t, 0]));
    for (const t of tierOf.values()) counts[t]++;
    const debt = Object.fromEntries(DEBT_RULES.map(r => [r, Object.fromEntries(TIERS.map(t => [t, 0]))]));
    const add = (rule, element, n) => {
        const tier = tierOf.get(element);
        if (!tier) throw new Error(`tier report: the baseline names "${element}" (${rule}), which is not an element`);
        if (!debt[rule]) throw new Error(`tier report: unknown rule "${rule}" in a baseline`);
        debt[rule][tier] += n;
    };
    for (const e of tiersBaseline.entries) add(e.rule, e.element, 1);
    for (const e of tagsBaseline.entries) add(e.rule, e.element, e.count);
    const sum = o => Object.values(o).reduce((a, b) => a + b, 0);
    return { version: 1, tiers: TIERS, rules: DEBT_RULES, counts, total: sum(counts), debt, debtTotal: sum(Object.fromEntries(DEBT_RULES.map(r => [r, sum(debt[r])]))), ...(modulesBaseline ? { modules: moduleDebt(modulesBaseline) } : {}) };
}

// The module ruleset's baseline (plainkit.audit.modules.baseline.json, repository root) is not tiered: modules are not elements. Its debt is counted per module rule (S1, S3 ... of the
// module ruleset, not the tier rules of the same name) as one separate group; absent when core/ is built without the repository around it.
export function moduleDebt(baseline) {
    const rules = {};
    for (const e of baseline.entries) rules[e.rule] = (rules[e.rule] ?? 0) + 1;
    const sorted = Object.fromEntries(Object.entries(rules).sort(([a], [b]) => a.localeCompare(b, 'en', { numeric: true })));
    return { rules: sorted, total: baseline.entries.length };
}
