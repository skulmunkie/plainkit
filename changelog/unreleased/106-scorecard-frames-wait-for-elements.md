---
type: fixed
issue: 106
---
The scorecard module waits for the custom elements in each frame to be defined before it measures, so a busy machine no longer scores content-less elements (avatar, progress, spinner) as an empty preview or as unspaced. The size sweep counts a page title drawn as `role="heading" aria-level="1"` in a shadow tree (as `pk-page-header` does) as the page's level-1 heading, so gallery views no longer wait out the settle timeout or read as having no h1.
