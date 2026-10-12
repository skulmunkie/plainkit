---
type: breaking
issue: 1085
---
The dock's header collapse-toggle and rail-button are now pk-button elements (variant plain, disclosure), keeping the parts `collapse-toggle` and `rail-button`. The hand-drawn `chevron` part is removed: the button draws its own. The expanded state is the button's `pressed`, which its inner control reports as `aria-expanded`; `aria-controls` and `aria-haspopup` are no longer set on these buttons, and host CSS styles them through the `--pk-button-*` hooks instead of the raw button box.
