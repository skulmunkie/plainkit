---
type: added
issue: 235
---
`PkContextMenu` gets `OnOpen` (`EventCallback<PkOpenEventArgs>`) and `OnClose` (`EventCallback<PkCloseEventArgs>`), mapped from `pk-open` and `pk-close`, so a Blazor consumer can react to the menu opening or closing and read which target (`PkOpenEventArgs.Context`) it opened for.
