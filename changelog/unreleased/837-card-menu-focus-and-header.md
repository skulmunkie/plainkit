---
type: fixed
issue: 837
---
pk-dropdown returns focus to its trigger when the trigger is wrapped (a PkDropdown TriggerContent, so PkCardMenu): after Escape or choosing an item the button is focused again instead of the page body. A long pk-card heading now wraps beside the header actions, which stay at the inline end of the first row, instead of dropping the actions under the heading.
