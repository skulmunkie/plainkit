// Composition-tier rules (#736, docs/superpowers/specs/2026-09-30-composition-tiers-design.md, section 4). Pure: takes the element sources
// (loadElementSources()) and the page factory sources, returns findings; core/tests/tiers.test.mjs holds them to core/tools/tiers.baseline.json
// (today's debt), so only NEW debt fails. The baseline only shrinks: never add an entry to hide a finding.
//
//   C1  dependency direction: an element's own sources (js, html, css) name no pk-* element of a higher tier (element < component < page < shell).
//   C2  tier present: enforced by validateApi (element-api.mjs). "Equal to its folder" starts when the folders move (spec phases 5-6).
//   C3  one element per page factory: every core/js/app/pages factory that declares a PAGE_TYPE (except "custom", which renders nothing of its own) is
//       named by the pageType of exactly one page-tier element, which is the element that factory creates; every pageType names a factory.
import { TIERS } from './element-api.mjs';

const RANK = Object.fromEntries(TIERS.map((t, i) => [t, i]));

// Comments name elements too ("like pk-tool-page's run"), so they are dropped before the references are read.
export const stripComments = text => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1');

const refs = text => new Set([...stripComments(text).matchAll(/\bpk-[a-z][a-z0-9-]*/g)].map(m => m[0]));

export function checkTiers(elements, factories) {
    const out = [];
    const byTag = new Map(elements.map(e => [e.meta.tag, e]));
    for (const el of elements) {
        const mine = RANK[el.meta.tier];
        for (const ref of [...refs([el.template, el.css, el.behaviour ?? ''].join('\n'))].sort()) {
            const target = byTag.get(ref);
            if (!target || target === el || mine === undefined) continue;
            if (RANK[target.meta.tier] > mine) out.push({ rule: 'C1', element: el.name, ref, message: `${el.meta.tier} ${el.meta.tag} uses ${target.meta.tier} ${ref}` });
        }
    }
    const pages = elements.filter(e => e.meta.tier === 'page');
    const ids = new Set(factories.filter(f => f.id !== 'custom').map(f => f.id));
    for (const f of factories.filter(x => x.id !== 'custom')) {
        const owners = pages.filter(p => p.meta.pageType === f.id);
        if (owners.length !== 1) out.push({ rule: 'C3', element: f.id, ref: f.id, message: `page factory "${f.id}" is named by ${owners.length} page elements, expected exactly 1` });
        else if (!refs(f.source).has(owners[0].meta.tag)) out.push({ rule: 'C3', element: f.id, ref: owners[0].meta.tag, message: `page factory "${f.id}" does not create ${owners[0].meta.tag}` });
    }
    for (const p of pages) if (!ids.has(p.meta.pageType)) out.push({ rule: 'C3', element: p.name, ref: String(p.meta.pageType), message: `${p.meta.tag} has pageType "${p.meta.pageType}", which is no core/js/app/pages factory` });
    return out;
}

export const key = f => `${f.rule} ${f.element} ${f.ref}`;
