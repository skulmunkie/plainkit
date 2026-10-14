---
type: added
issue: 364
---
Changing page in a Blazor `PkApp` sets the document title, moves focus to the page heading and announces "<page>, page loaded" in a polite live region, as `mountApp` does. The behaviour is one shared module (`js/app/route-focus.js`) that the bridge loads on first use; the app entry is unchanged in size.
