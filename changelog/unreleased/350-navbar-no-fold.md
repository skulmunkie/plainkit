---
type: added
issue: 350
---
`pk-navbar` gets `noFold` (`PkNavbar.NoFold`) for a host that owns the narrow-screen menu, such as the app shell's drawer: below 1024px the bar shows no hamburger and keeps its links hidden, stays one non-wrapping row with the actions pinned to the end and the brand shortening first, and `--pk-navbar-padding` lets a shell that already pads its header row set the bar's own side padding to 0. In a `pk-app-shell` header a `pk-navbar` now takes the whole row and leaves the border and background to the header.
