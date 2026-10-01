---
type: notes
issue: 766
---
The composition-tier rule C4 no longer counts the pk-* a static helper function creates, for the functions in the reviewed list `core/tools/tiers.helpers.json` (`pk-dialog` `btn`, `pk-toast-stack` `show`); `pk-toast-stack` is now tier `element`.
