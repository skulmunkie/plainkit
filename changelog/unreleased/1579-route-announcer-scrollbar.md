---
type: fixed
issue: 1579
---
The first route change no longer shifts the page 15px sideways: the screen-reader announcer is position: fixed instead of sitting below the full-height shell, where it made the document 1px taller and drew a scrollbar.
