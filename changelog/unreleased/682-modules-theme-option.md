---
type: changed
issue: 682
---
The log-settings, logs, console and performance tool modules draw with SDK elements and no longer ship a stylesheet. Their `theme` mount option now only sets `data-theme` on the module (it no longer draws a themed surface): put the module in a `pk-card` (or any surface) when you want a background. In the logs viewer the opened message is a wrapping `pk-code-block` under a "Message" bar, so a long unbroken line stays inside the card.
