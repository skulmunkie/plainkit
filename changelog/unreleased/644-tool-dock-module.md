---
type: added
issue: 644
---
A new module, `mountToolDock` (`modules/tool-dock/tool-dock.js`), is the generic floating/docked tabbed panel that `mountDevTools` already used internally: dock to the bottom edge, resize between named sizes, toggle with a hotkey, or fill a container inline, with your own `panels` (`{ id, title, mount(el, context) }`). Point it at your own app's tool-type panels (properties, history, an outline, a console, a chat) instead of reinventing the pattern. `mountDevTools` is now a thin consumer of it with no change to its options, DOM shape or behavior.
