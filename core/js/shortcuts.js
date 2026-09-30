// Plainkit's command-verb shortcut registry. A component asks "did the user invoke `save`?", never "was Ctrl+S pressed?" — this
// module is the one place that maps a semantic verb to the keyboard shortcut(s) that trigger it, so the mapping is written once,
// tested once, and can be overridden once, instead of an `e.key === '...'` check scattered into every element that needs one.
//
// A verb's shortcut is a predicate `(KeyboardEvent) => boolean`. Most fit "a modifier plus a letter, no other modifier"
// (comboKey), which covers Ctrl/Cmd+K today and Ctrl/Cmd+S, +O, +N later. A few do not fit that shape (Shift+F10, the dedicated
// ContextMenu key) and are written as their own predicate. Nothing outside this file hand-checks `e.key` for a global trigger.
//
// Resolution is layered: a page may bind its own predicate for a verb (a tool page already using Ctrl+N for something else can
// rebind `new`), then an app may bind one for every page that does not, then the registry default applies. `isShortcut` is the
// only function callers need; `DEFAULT_SHORTCUTS` and `comboKey` are exported for tests and for composing new verbs.
//
// The second half of this file is a different, smaller thing: a registry for an *element's own* keyboard chords (issue #591,
// dockable-layout spec question 6). `pk-dock` and any element like it want a fixed chord — Alt+Shift+ArrowUp, Ctrl+Alt+F — to
// mean something only while that element instance is connected and some local condition holds (focus is on the right part,
// the panel is open). Rather than every such element adding its own `keydown` listener (register.js's ownership rule already
// says a subscription outside the element's own subtree belongs in `connected()`/`disconnected()`, and one `keydown` listener
// per instance does not scale), an element calls `registerChord({ keys, handler, when })` in `connected()` and calls the
// unregister function it returns in `disconnected()` — the same shape `addLogSink` above already uses. The registry itself
// adds exactly one `keydown` listener, lazily, the first time anything registers (see `js/log.js`'s lazy `LAZY_OUTPUTS` import
// and `js/router.js`'s single `popstate` listener for the same "one shared listener, not one per consumer" house style).
// `keys` is `{ key, ctrl, alt, shift, meta }` (booleans default to false, so `{ key: 'f', ctrl: true, alt: true }` is exactly
// Ctrl+Alt+F, no more, no less — the same exactness `comboKey` already uses). Registering a chord already taken by another
// currently-registered handler does not throw or refuse the registration (a second handler for the same chord is a mistake to
// surface, not a reason to break the page); it warns once, through `createLogger('shortcuts')`, so the conflict is visible in
// development instead of silently shadowing one handler with another.

import { createLogger } from './log.js';

// A modifier(letter) shortcut: Ctrl or Cmd (either satisfies it — Plainkit does not require the OS-conventional one specifically),
// no Alt, no Shift, the given letter case-insensitively.
export function comboKey(letter) {
    const k = letter.toLowerCase();
    return e => !!((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key?.toLowerCase() === k);
}

// verb -> default predicate. Every global trigger shortcut Plainkit defines lives here.
export const DEFAULT_SHORTCUTS = {
    'command-palette': comboKey('k'), // Ctrl/Cmd+K opens pk-command-palette
    'context-menu': e => !!((e.key === 'F10' && e.shiftKey) || e.key === 'ContextMenu'), // Shift+F10, or the keyboard's Menu key, opens pk-context-menu at the focused element
};

// Whether `event` invokes `verb`. Resolution order: `pageShortcuts[verb]`, then `appShortcuts[verb]`, then the registry default;
// either map may be omitted (a page or app that has not opted into overrides), and a map may leave a verb out to fall through.
// An unknown verb with no override matches nothing, rather than throwing.
export function isShortcut(verb, event, { pageShortcuts, appShortcuts } = {}) {
    const predicate = pageShortcuts?.[verb] ?? appShortcuts?.[verb] ?? DEFAULT_SHORTCUTS[verb];
    return !!predicate?.(event);
}

// ---- Element chord registry (issue #591) ----------------------------------------------------------------------------------

const log = createLogger('shortcuts');

// A chord spec as "Ctrl+Alt+F", "Alt+Shift+ArrowUp" etc, for the warning message and for comparing two specs for an exact
// conflict (order-independent: { alt: true, ctrl: true, key: 'f' } and { ctrl: true, alt: true, key: 'f' } are the same chord).
function chordLabel({ key, ctrl, alt, shift, meta } = {}) {
    const mods = [];
    if (ctrl) mods.push('Ctrl');
    if (alt) mods.push('Alt');
    if (shift) mods.push('Shift');
    if (meta) mods.push('Meta');
    mods.push(String(key ?? '').toLowerCase());
    return mods.join('+');
}

// Whether `event` is exactly this chord: the key (case-insensitively) and every modifier flag, present or absent, must match -
// an unlisted modifier must be absent from the event, the same exactness `comboKey` already uses for verb shortcuts. Pure.
export function chordMatches({ key, ctrl, alt, shift, meta } = {}, event) {
    if (!key || !event?.key) return false;
    return String(event.key).toLowerCase() === String(key).toLowerCase()
        && !!event.ctrlKey === !!ctrl && !!event.altKey === !!alt && !!event.shiftKey === !!shift && !!event.metaKey === !!meta;
}

const chords = new Set(); // { keys, handler, when }
let listening = false;

// The one shared `keydown` listener every registered chord is dispatched through (pure enough to unit-test without a real
// `document`: it only reads `chords` and calls `chordMatches`/`when`/`handler`). More than one currently-registered chord can
// match the same event (the conflict a registration-time warning already flagged); every matching, eligible handler runs.
export function dispatchChord(event) {
    for (const entry of chords) {
        if (chordMatches(entry.keys, event) && (!entry.when || entry.when())) entry.handler(event);
    }
}

function ensureListening() {
    if (listening || typeof document === 'undefined' || typeof document.addEventListener !== 'function') return;
    listening = true;
    document.addEventListener('keydown', dispatchChord);
}

// Registers an element's own keyboard chord: `keys` ({ key, ctrl, alt, shift, meta }, see `chordMatches`), `handler(event)`,
// and an optional `when()` predicate consulted on every matching keydown (an element passes its own connected/visible check,
// e.g. "the floater frame has focus"; omit it for a chord that should always fire while registered). Call this from
// `connected()` and call the function it returns from `disconnected()` - the same ownership rule STANDARDS.md already states
// for a subscription outside the element's own subtree. A chord already taken by another currently-registered handler is
// still registered (both fire) but is warned about, since a silently shadowed handler is a harder bug to find than a warning.
export function registerChord({ keys, handler, when } = {}) {
    if (!keys?.key || typeof handler !== 'function') { log.warn('registerChord needs { keys: { key }, handler }', { keys }); return () => {}; }
    const label = chordLabel(keys);
    const conflict = [...chords].find(entry => chordLabel(entry.keys) === label);
    if (conflict) log.warn(`chord "${label}" is already registered by another handler; both will run`, { keys });
    const entry = { keys, handler, when };
    chords.add(entry);
    ensureListening();
    return () => { chords.delete(entry); };
}

export const getRegisteredChords = () => [...chords].map(({ keys }) => ({ keys }));
