// The sections a host adds to the gallery's docked inspector, as plain data, and the messages that carry them into the gallery's frame.
// No DOM, no fetch; the gallery module, the embed page and the <pk-gallery> element share it. The SDK never holds a host's data: the host computes
// the sections (Blazor: from its own mappings) and sends them; the gallery only draws what passes normalizeSections, as text in SDK components.
//
// A section is { tag?, title, open?, lines?, columns?, rows?, code? }, every value text:
//   tag      the element it belongs to ("pk-button" or "button"); leave it out and the section shows for every element
//   title    the accordion heading
//   lines    short paragraphs, above the table
//   columns  the table's header cells (with rows; default "Name", "Value")
//   rows     the table's rows, each a list of cells
//   code     one block of monospaced text with a copy button (for example Razor markup)
// Contract (no callbacks): the frame posts { type: 'pk-gallery-ready' } to its parent once mounted; the host answers, and again whenever its
// sections change, with { type: 'pk-gallery-sections', sections: [...] } (the whole list each time). Only the embedding window is believed.

export const READY_MESSAGE = 'pk-gallery-ready';
export const SECTIONS_MESSAGE = 'pk-gallery-sections';

export const LIMITS = { sections: 200, title: 80, text: 400, code: 4000, lines: 20, columns: 6, rows: 60 };

const text = (v, max) => String(v ?? '').slice(0, max);
const list = (v, max) => (Array.isArray(v) ? v.slice(0, max) : []);
const tagOf = v => String(v ?? '').trim().toLowerCase().replace(/^(?!pk-)/, 'pk-');

// Anything that is not a section with a title is dropped; values are cut to their limits and turned into text. Never throws.
export function normalizeSections(raw) {
    const out = [];
    for (const s of list(raw, LIMITS.sections)) {
        const title = text(s?.title, LIMITS.title).trim();
        if (!title) continue;
        const section = { title };
        if (s.tag) section.tag = tagOf(s.tag);
        if (s.open === true) section.open = true;
        const lines = list(s.lines, LIMITS.lines).map(l => text(l, LIMITS.text)).filter(Boolean);
        if (lines.length) section.lines = lines;
        const rows = list(s.rows, LIMITS.rows).map(r => list(r, LIMITS.columns).map(c => text(c, LIMITS.text))).filter(r => r.length);
        if (rows.length) {
            section.rows = rows;
            const columns = list(s.columns, LIMITS.columns).map(c => text(c, LIMITS.text));
            section.columns = columns.length ? columns : ['Name', 'Value'];
        }
        const code = text(s.code, LIMITS.code); if (code) section.code = code;
        out.push(section);
    }
    return out;
}

// The sections for one element: those naming its tag, and those naming none.
export const sectionsFor = (sections, tag) => sections.filter(s => !s.tag || s.tag === tagOf(tag));

// The frame's side: the sections a message carries, or null when it is not the sections message of the embedding window (source and, when
// known, origin) or carries no array. A valid message with no usable section returns [] (that clears the host's sections).
export function acceptedSections(event, parentWindow, origin) {
    if (!event || event.source !== parentWindow || (origin && origin !== '*' && event.origin !== origin)) return null;
    if (event.data?.type !== SECTIONS_MESSAGE || !Array.isArray(event.data.sections)) return null;
    return normalizeSections(event.data.sections);
}

// The element's side: the message that carries a sections value (the JSON text of the attribute). No value is an empty list (it clears the
// host's sections); text that is not JSON throws a SyntaxError, and JSON that is not a list gives null.
export function sectionsMessage(value) {
    const sections = String(value ?? '').trim() ? JSON.parse(value) : [];
    return Array.isArray(sections) ? { type: SECTIONS_MESSAGE, sections } : null;
}
