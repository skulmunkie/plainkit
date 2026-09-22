---
type: fixed
issue: 186
---
PlainKit.Blazor no longer ships `custom-elements.json`, `web-types.json`, `vscode.html-custom-data.json`, `elements.d.ts`, `elements.vue.d.ts`, `AGENTS.md`, `llms.txt` and `llms-full.txt` as static web assets: nothing at runtime reads them, so `dotnet publish` no longer copies ~480 KB of IDE/editor and agent-doc files into every consuming app's output. They stay built into `core/dist` for npm/CDN consumers and ship separately in the release zip (skills/agent docs, #36).
