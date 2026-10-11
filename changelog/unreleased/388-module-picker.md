---
type: breaking
issue: 388
---
`mountApp` removes the `layout` config key (`'side'` and `'top'`): the side nav is now the active module's own tree and nothing else, and modules are switched with a module picker, a button in the header showing the active module's title (on a phone, the first row of the drawer; absent with one module). The breadcrumb, document title and menu label read the picker's title. To migrate, delete `layout` from your config (it is now ignored with one warning); an app that used `layout: 'top'` gets the picker instead of bar links, and a module without a `nav` keeps an empty side-nav column on a wide screen (nothing reflows). The `samples/app/top` sample is removed.
