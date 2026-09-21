---
type: fixed
issue: 143
---
The quality check for controls that sit too close reads the page's `--gap-min` token (3.5px at the 14px root) instead of a copied 4px, so navbar links and breadcrumbs no longer trip it; the `pk-back-to-top` example shows the button (`threshold` below 0 shows it at once); a link in `pk-alert`'s `action` slot and the `brand` link of `pk-side-nav` are 44px touch targets on every width (the alert keeps its height).
