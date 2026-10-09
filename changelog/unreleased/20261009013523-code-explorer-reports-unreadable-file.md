---
type: fixed
---
The code explorer's Reports (largest files, longest methods, duplicate blocks) no longer fail as a whole when one file cannot be read: that file is left out and named in a warning above the results, and when every file fails the message says why ("The reports could not be computed: ..."). The Reports button shows its progress ("Reading 150 of 2000") while the files are read, and a second click during the read is ignored. A lazy provider encodes each path segment in the file URL, so a path containing `%`, `#` or `?` is fetched correctly (the Blazor reader decoded such a path with an error).
