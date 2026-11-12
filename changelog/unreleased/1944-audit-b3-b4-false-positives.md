---
type: fixed
issue: 1944
---
The conformance audit no longer reports PkReconnect, PkScripts and the other public PlainKit.Blazor components without a pk-* mapping as unknown (B3), skips PageTitle, HeadContent and SectionContent when looking for a page's PkListPage or PkRecordPage (B4), and treats an error or not-found page whose only service is NavigationManager and whose handlers navigate as static (B4).
