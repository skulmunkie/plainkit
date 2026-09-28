---
type: added
issue: 365
---
PkStoreSpec gets a Migrate hook for data stored at an older version (validated like any stored data; null or a throw gives the defaults), and IPkSettings gets a Changed event with the module, key and new value. The JavaScript and Blazor stores are now tested against one shared fixture file of storage envelopes, so their rules cannot drift apart.
