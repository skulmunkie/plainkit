---
type: fixed
issue: 863
---
`PkEmptyState` takes its content as `ChildContent` like every other component, so `<PkEmptyState Title="No items."><a href="/back">Back to list</a></PkEmptyState>` renders the link (the parameter was `DescriptionContent`, and content written in the tag was silently dropped). Rename `DescriptionContent` to `ChildContent`; a link back or a primary button goes in `ActionContent`, which renders under the description. Also fixes the element: a `description` is no longer hidden when the markup has whitespace between its tags, and the actions row centres a link against a button. The gallery shows a link and a button.
