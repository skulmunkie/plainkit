---
type: fixed
issue: 378
---
An app module boundary error (a failed import, a mount or page that throws) now shows a generic "Something went wrong loading this part of the app. Try again." message instead of the raw exception text, which could leak internal detail; the full message is still logged for developers, and shows in the alert when the error is marked `userFacing: true` or the `app` log scope is at `debug`.
