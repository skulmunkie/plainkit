---
type: breaking
issue: 863
---
`PkEmptyState` takes its content as `ChildContent`, like every other component; `DescriptionContent` is gone. Rename `DescriptionContent` to `ChildContent` where you use it. Content written in the tag now renders (it was silently dropped), so `<PkEmptyState Title="No items."><a href="/back">Back to list</a></PkEmptyState>` shows the link; a link back or a primary button goes in `ActionContent`, which renders under the description. The element also shows a `description` that has whitespace between its tags, and the actions row centres a link against a button. The gallery shows a link and a button.
