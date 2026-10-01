// Builds the audit's hint data from the repository's own catalogues (design section 3), at build/bootstrap time only.
//
// This is the one file under core/tools/audit/ allowed to read core/elements/*/*.meta.json, core/js/app/pages/*.js,
// core/tokens/tokens.css and blazor/mappings/*.json: it is a build step (run by node core/tools/audit/data.mjs, wired into
// scripts/bootstrap.mjs), not part of what an audit run against a consumer's own project executes. Its output,
// core/tools/audit/generated.data.mjs, is a plain data module with no imports of its own; hints.mjs and the rule families
// read only that generated file, never these repository paths - that is what keeps core/tools/audit pure and standalone
// (design section 11, "the pure, no repository paths property of #515").
//
// Regenerate after any element meta, page-type, token or Blazor mapping change: node core/tools/audit/data.mjs
// (bootstrap.mjs does this already).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { listElementFolders } from '../element-folders.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

// --- Elements (design 3.1): tag/class/alias/API hint tables, from core/elements/*/*.meta.json. -------------------

export function loadElementMetas(rootDir = root) {
    const metas = [];
    for (const e of listElementFolders(path.join(rootDir, 'core'))) {
        const metaFile = path.join(e.dir, `${e.name}.meta.json`);
        if (!fs.existsSync(metaFile)) continue;
        metas.push(JSON.parse(fs.readFileSync(metaFile, 'utf8')));
    }
    return metas;
}

// A `replaces[]` entry is one of: a bare tag ("button"), a tag+role selector ("a[role=button]" or "[role=tablist]"), or an
// API name ("api:showModal"). See core/tools/element-api.mjs for the field's validation.
function classifyReplaces(entry) {
    const api = /^api:(.+)$/.exec(entry);
    if (api) return { kind: 'api', name: api[1] };
    const role = /\[role=([\w-]+)\]/.exec(entry);
    if (role) return { kind: 'role', name: role[1] };
    return { kind: 'tag', name: entry.replace(/\[.*$/, '') || null };
}

export function buildElementHints(metas) {
    const tagHints = {};
    const classHints = {};
    const roleHints = {};
    const apiHints = [];
    const elementsByTag = {};
    const elementAttrs = {};
    const a11yRequires = {};
    const deprecatedElements = [];
    const deprecatedAttrs = {};
    for (const m of metas) {
        elementsByTag[m.tag] = m;
        const bare = m.tag.replace(/^pk-/, '');
        classHints[bare] = m.tag;
        for (const alias of m.aliases ?? []) classHints[alias] = m.tag;
        for (const entry of m.replaces ?? []) {
            const { kind, name } = classifyReplaces(entry);
            if (kind === 'tag' && name) tagHints[name] = m.tag;
            else if (kind === 'role') roleHints[name] = m.tag;
            else if (kind === 'api') apiHints.push({ api: name, element: m.tag });
        }
        if (Array.isArray(m.a11yRequires) && m.a11yRequires.length) a11yRequires[m.tag] = m.a11yRequires;
        if (m.deprecated) deprecatedElements.push({ tag: m.tag, message: m.deprecated.message ?? `${m.tag} is deprecated` });
        // T6 (unknown attribute value): only attributes whose meta declares an enum `values` list, so a free-form
        // string or data attribute never false-positives. T7 (deprecated attribute): props[] entries carrying
        // their own `deprecated`.
        const attrs = {};
        for (const prop of m.props ?? []) {
            if (Array.isArray(prop.values) && prop.values.length) attrs[prop.name] = prop.values;
            if (prop.deprecated) (deprecatedAttrs[m.tag] ??= {})[prop.name] = prop.deprecated.message ?? `${prop.name} is deprecated`;
        }
        if (Object.keys(attrs).length) elementAttrs[m.tag] = attrs;
    }
    return { tagHints, classHints, roleHints, apiHints, elementsByTag, elementAttrs, a11yRequires, deprecatedElements, deprecatedAttrs };
}

// --- Blazor components (design section 7, A-9): tag -> { component, params[] } from blazor/mappings/*.json,
// the same source scripts/generate-blazor.mjs and the skills already read. Used by family B (Razor-only rules)
// to map a raw tag or a Pk* component name to the mapping's own data instead of a hand-listed table. -----------

export function loadBlazorMappings(rootDir = root) {
    const dir = path.join(rootDir, 'blazor', 'mappings');
    const out = {};
    if (!fs.existsSync(dir)) return out;
    for (const name of fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort()) {
        const tag = `pk-${name.replace(/\.json$/, '')}`;
        const mapping = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
        out[tag] = { component: mapping.component, params: (mapping.params ?? []).map(p => p.name) };
    }
    return out;
}

// --- Tokens (design 3.3): parse core/tokens/tokens.css into { name, value, group } entries. ------------------------

const TOKEN_GROUPS = ['color', 'space', 'text', 'radius', 'shadow', 'duration', 'ease'];
const groupOf = name => TOKEN_GROUPS.find(g => name.startsWith(`--${g}-`)) ?? null;

export function parseTokens(css) {
    const tokens = [];
    const seen = new Set();
    for (const m of css.matchAll(/(--[a-z][a-z0-9-]*)\s*:\s*([^;]+);/g)) {
        const name = m[1];
        const group = groupOf(name);
        if (!group || seen.has(name)) continue; // only the families the design names; a token redeclared per theme is recorded once
        seen.add(name);
        tokens.push({ name, value: m[2].trim(), group });
    }
    return tokens;
}

export function loadTokens(rootDir = root) {
    return parseTokens(fs.readFileSync(path.join(rootDir, 'core', 'tokens', 'tokens.css'), 'utf8'));
}

// --- Page types (design 3.2): a small descriptor per built-in page type, exported as PAGE_TYPE by each page file. -

const PAGE_TYPE_FILES = ['custom', 'dashboard', 'doc', 'list', 'master-detail', 'not-found', 'note', 'record', 'settings', 'states', 'tool', 'wizard', 'workspace'];

export async function loadPageTypes(rootDir = root) {
    const dir = path.join(rootDir, 'core', 'js', 'app', 'pages');
    const out = [];
    for (const name of PAGE_TYPE_FILES) {
        const file = path.join(dir, `${name}.js`);
        if (!fs.existsSync(file)) continue;
        const mod = await import(`${pathToFileUrl(file)}`);
        if (mod.PAGE_TYPE) out.push(mod.PAGE_TYPE);
    }
    return out;
}

function pathToFileUrl(p) {
    return new URL(`file://${p.replaceAll('\\', '/').replace(/^([a-zA-Z]):/, '/$1:')}`).href;
}

// --- Assembling and writing the generated data module. --------------------------------------------------------

export async function buildAuditData(rootDir = root) {
    const metas = loadElementMetas(rootDir);
    const elements = buildElementHints(metas);
    const tokens = loadTokens(rootDir);
    const pageTypes = await loadPageTypes(rootDir);
    const blazorComponents = loadBlazorMappings(rootDir);
    return { elements, tokens, pageTypes, blazorComponents };
}

function renderModule(data) {
    return `// GENERATED by core/tools/audit/data.mjs from core/elements/*/*.meta.json, core/js/app/pages/*.js and core/tokens/tokens.css: do not edit.
// Consumed by core/tools/audit/hints.mjs. Regenerate with: node core/tools/audit/data.mjs (part of node scripts/bootstrap.mjs).

export const TAG_HINTS = ${JSON.stringify(data.elements.tagHints, null, 4)};

export const CLASS_HINTS = ${JSON.stringify(data.elements.classHints, null, 4)};

export const ROLE_HINTS = ${JSON.stringify(data.elements.roleHints, null, 4)};

export const API_HINTS = ${JSON.stringify(data.elements.apiHints, null, 4)};

export const ELEMENT_TAGS = ${JSON.stringify(Object.keys(data.elements.elementsByTag).sort(), null, 4)};

export const ELEMENT_ATTRS = ${JSON.stringify(data.elements.elementAttrs, null, 4)};

export const A11Y_REQUIRES = ${JSON.stringify(data.elements.a11yRequires, null, 4)};

export const DEPRECATED_ELEMENTS = ${JSON.stringify(data.elements.deprecatedElements, null, 4)};

export const DEPRECATED_ATTRS = ${JSON.stringify(data.elements.deprecatedAttrs, null, 4)};

export const TOKENS = ${JSON.stringify(data.tokens, null, 4)};

export const PAGE_TYPES = ${JSON.stringify(data.pageTypes, null, 4)};

export const BLAZOR_COMPONENTS = ${JSON.stringify(data.blazorComponents, null, 4)};
`;
}

export async function writeAuditData(rootDir = root) {
    const data = await buildAuditData(rootDir);
    const text = renderModule(data).replace(/\r?\n/g, '\r\n');
    fs.writeFileSync(path.join(rootDir, 'core', 'tools', 'audit', 'generated.data.mjs'), text);
    return data;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    await writeAuditData();
    console.log('core/tools/audit/data.mjs: wrote core/tools/audit/generated.data.mjs');
}
