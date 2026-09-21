import { parseColour } from './colour.js';

// Plainkit theme: switch light/dark, read the tokens a stylesheet declares, and build or parse the override block.
// The override rules mirror the server-side PkThemeOverrides helper exactly: same name pattern, same value whitelist, same output.
// Framework-free; its only import is the SDK's colour maths.

export const MAX_VALUE_LENGTH = 200;
const NAME = /^--[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
const VALUE = /^[A-Za-z0-9#%.,\s()\-+/]+$/;

export function setTheme(element, name) {
    element.setAttribute('data-theme', name === 'light' ? 'light' : 'dark');
    return element.getAttribute('data-theme');
}

export const currentTheme = element => (element.getAttribute('data-theme') === 'light' ? 'light' : 'dark');

export function toggleTheme(element) {
    return setTheme(element, currentTheme(element) === 'dark' ? 'light' : 'dark');
}

// Why a token name is unusable, or null.
export function nameProblem(name) {
    return name.length < 3 || name.length > 64 || !NAME.test(name) ? 'not a lowercase custom property name (--like-this)' : null;
}

// Why a value is unusable, or null.
export function valueProblem(value) {
    const v = String(value ?? '').trim();
    if (v.length === 0) return 'empty';
    if (v.length > MAX_VALUE_LENGTH) return `longer than ${MAX_VALUE_LENGTH} characters`;
    if (!VALUE.test(v)) return 'contains a character outside letters, digits, # % . , ( ) - + / and spaces';
    if (v.includes('/*') || v.includes('*/')) return 'contains a comment marker';
    const lower = v.toLowerCase();
    if (lower.includes('url(') || lower.includes('expression') || lower.includes('import')) return 'url(), expression and import are not allowed';
    let depth = 0;
    for (const c of v) {
        if (c === '(') depth++;
        else if (c === ')' && --depth < 0) return 'unbalanced parentheses';
    }
    return depth === 0 ? null : 'unbalanced parentheses';
}

function clean(source, rejected) {
    const ok = {};
    for (const [name, value] of Object.entries(source ?? {}).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
        const problem = nameProblem(name) ?? valueProblem(value);
        if (problem) rejected.push(`${name}: ${problem}`);
        else ok[name] = String(value).trim();
    }
    return ok;
}

function block(selector, entries) {
    const names = Object.keys(entries).sort();
    if (names.length === 0) return '';
    return `${selector} {\n${names.map(n => `    ${n}: ${entries[n]};`).join('\n')}\n}\n`;
}

// { css, rejected } from { shared, dark, light } dictionaries of token -> value; a theme entry beats a shared one.
export function buildOverrides({ shared = {}, dark = {}, light = {} } = {}) {
    const rejected = [];
    const s = clean(shared, rejected);
    const d = { ...s, ...clean(dark, rejected) };
    const l = { ...s, ...clean(light, rejected) };
    return { css: block(':root,\n[data-theme="dark"]', d) + block('[data-theme="light"]', l), rejected };
}

export const MAX_OVERRIDES = 500;

// Copies only well-formed token overrides out of untrusted input (JSON import, localStorage): own string values under valid
// "--token" names, at most MAX_OVERRIDES. Keys such as __proto__, constructor and prototype can never pass the name check (a token
// name starts with "--"), so no merge of the result can pollute a prototype. Anything else is dropped, not repaired.
export function sanitizeDict(source) {
    const out = {};
    if (source === null || typeof source !== 'object' || Array.isArray(source)) return out;
    let n = 0;
    for (const name of Object.keys(source)) {
        if (n >= MAX_OVERRIDES) break;
        const value = source[name];
        if (typeof value !== 'string' || nameProblem(name) !== null || valueProblem(value) !== null) continue;
        out[name] = value.trim();
        n++;
    }
    return out;
}

export function sanitizeOverrides(input) {
    const o = input !== null && typeof input === 'object' ? input : {};
    return { shared: sanitizeDict(o.shared), dark: sanitizeDict(o.dark), light: sanitizeDict(o.light) };
}

// Reads back what buildOverrides emits, or the JSON form { shared, dark, light }. Returns { shared, dark, light } or null.
export function parseOverrides(text) {
    const t = String(text ?? '').trim();
    if (t.startsWith('{') && !t.includes('[data-theme') && !t.includes(':root')) {
        try {
            const o = JSON.parse(t);
            return sanitizeOverrides(o);
        } catch { return null; }
    }
    const result = { shared: {}, dark: {}, light: {} };
    for (const m of t.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
        const target = m[1].includes('light') ? result.light : m[1].includes('dark') || m[1].includes(':root') ? result.dark : null;
        if (!target) continue;
        for (const d of m[2].matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) target[d[1]] = d[2].trim();
    }
    return sanitizeOverrides(result);
}

// Tokens a stylesheet declares, grouped by the block that declares them: { dark, light, root } of name -> value.
// ":root, [data-theme=dark]" is the dark block, "[data-theme=light]" the light one, a bare ":root" is theme-independent.
export function parseTokenBlocks(cssText) {
    const css = String(cssText).replace(/\/\*[\s\S]*?\*\//g, '');
    const out = { dark: {}, light: {}, root: {} };
    for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        const sel = m[1].trim().replace(/\s+/g, ' ');
        const which = /^\[data-theme="light"\]$/.test(sel) ? 'light'
            : /^:root, \[data-theme="dark"\]$/.test(sel) ? 'dark'
            : sel === ':root' ? 'root' : null;
        if (!which) continue;
        for (const d of m[2].matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) out[which][d[1]] = d[2].trim();
    }
    return out;
}

// Which editor a token belongs in: colour, font, size, shadow, layer or other.
export function tokenKind(name, value) {
    if (/^--z-/.test(name)) return 'layer';
    if (/shadow/.test(name)) return 'shadow';
    if (/^--font-/.test(name)) return 'font';
    if (/^--(space|text|radius|touch|app)-|-(size|width|height|gap)$/.test(name)) return 'size';
    if (/^#|^rgba?\(|^hsla?\(/i.test(String(value).trim()) || /^--color-/.test(name) || /-(bg|fg|border|hover|accent)(-\d+)?$/.test(name)) return 'colour';
    return 'other';
}

// "1.5rem" -> { number: 1.5, unit: "rem" } for a plain length; null for anything else (calc(), var(), lists).
export function splitLength(value) {
    const m = /^\s*(-?\d*\.?\d+)(px|rem|em|%|vh|vw|ms|s)?\s*$/.exec(String(value));
    return m ? { number: parseFloat(m[1]), unit: m[2] ?? '' } : null;
}

// A solid colour as #rrggbb for <input type="color">, or null when it has alpha or is not a literal colour.
export function colourToHex(value) {
    const c = parseColour(value);
    if (!c || c.a < 1) return null;
    const h = n => Math.round(n).toString(16).padStart(2, '0');
    return '#' + h(c.r) + h(c.g) + h(c.b);
}
