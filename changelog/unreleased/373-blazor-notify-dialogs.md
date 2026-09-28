---
type: added
issue: 373
---
PlainKit.Blazor registers IPkNotifications and IPkDialogs in AddPlainKit(): toasts (info, success, warn, error) and promise-style modal dialogs (confirm, alert, prompt and a small form dialog) over the existing pk-toast and pk-dialog, the Blazor side of ctx.notify and ctx.dialogs. Dialogs queue one at a time, a cancelled dialog answers false or null, and disposing the service cancels its dialogs.
