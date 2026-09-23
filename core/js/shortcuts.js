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
