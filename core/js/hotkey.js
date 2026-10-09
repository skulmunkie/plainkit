// A keyboard chord such as "Ctrl+`" or "Ctrl+Shift+D", matched against a KeyboardEvent. The chord names its modifiers (Ctrl, Shift, Alt; Cmd
// counts as Ctrl) and ends with the key; a modifier the chord does not name must not be held, so "Ctrl+K" does not fire on Ctrl+Shift+K.
// An empty chord matches nothing. Used by pk-tray (its hotkey prop) and re-exported by the tool dock module.

export function matchesHotkey(event, chord) {
    if (!chord) return false;
    const parts = chord.split('+').map(s => s.trim());
    const key = parts.pop();
    const want = new Set(parts.map(p => p.toLowerCase()));
    const has = { ctrl: Boolean(event.ctrlKey || event.metaKey), shift: Boolean(event.shiftKey), alt: Boolean(event.altKey) };
    return event.key.toLowerCase() === key.toLowerCase()
        && want.has('ctrl') === has.ctrl && want.has('shift') === has.shift && want.has('alt') === has.alt;
}
