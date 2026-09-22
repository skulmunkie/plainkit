---
title: Logging
order: 5
summary: What the SDK logs and when, how to turn it up, how to write your own entries into the same log, and how to see them.
---

Nothing in Plainkit fails silently. A mistake in your markup, a module that did not load, a value that had to fall back to its default: each is logged, by one small logger that your own code can use too. The default level is `warn`, so a production page stays quiet until something is wrong. The agent skill's [logging reference](../../dist/skills/plainkit-sdk/references/logging.md) has the full API; this guide is the practical part.

## What you will see

Put a misspelt element on a page, for example `<pk-buton>`, and the console shows a warning that the tag is not a Plainkit element, once per tag and page, with the tag in its detail. Set a `variant` that does not exist and the element uses its default and says so. These are `warn` entries: the SDK worked around a mistake.

Levels, lowest first, are `debug`, `info`, `warn`, `error` and `silent`. An entry is shown when its level is at or above the level for its scope:

| Level | The SDK uses it for |
|---|---|
| `error` | something the page asked for did not happen and cannot recover: a module failed to load, a run failed |
| `warn` | a mistake the SDK worked around: a bad attribute value, an unknown tag, a selector that matches nothing |
| `info` | rare, useful milestones an app might want to see |
| `debug` | lifecycle and expected fallbacks: an element defined, a prop changed, a module loaded and how long it took |

A scope says where an entry came from: `loader`, `invokers`, the tag name for an element (`pk-input`), the module name for a tool, and your own name for your code.

## Turn it up

You do not need to change any code. Add `?pk-log=debug` to the page address, or put `data-pk-log="debug"` on `<html>`. From the browser console, `PkLog.setLogLevel('debug')` does it for the current page. To keep a setting, use the [Settings](../settings/index.html) page or `configureLogging(settings, { persist: true })`, which survive a reload.

In code, set the global level, a level for one scope, and where each level goes:

```js
import { configureLogging } from './plainkit/js/log.js';

configureLogging({
    level: 'info',
    scopes: { loader: 'debug' },
    routes: { error: ['console', 'toast'] },
});
```

A per-scope level wins over the global one. A route names the outputs an entry goes to: `console` (built in), `toast` (a `pk-toast`, loaded on first use) or `alert` (a `pk-alert` notice at the top of the page).

## Write your own entries

Make a logger for your part of the app and use it instead of `console`. Your entries then go through the same levels, routes and viewers as the SDK's:

```js
import { createLogger } from './plainkit/js/log.js';

const log = createLogger('checkout');
log.info('order placed', { id: 42 });
log.warn('card declined, asking for another', { attempt: 2 });
```

Say what was wrong and what you did about it, and pass the facts as the second argument. Anything costly to build belongs behind a check, so it costs nothing when the level is off:

```js
import { createLogger, isLogEnabled } from './plainkit/js/log.js';

const log = createLogger('checkout');
if (isLogEnabled('debug', 'checkout')) log.debug('cart', { lines: buildCartSummary() });
```

## Send entries somewhere else

Every entry, whatever the level, goes to the sinks, and the last few hundred are kept in a buffer. That is how the log viewer and any telemetry of yours see everything:

```js
import { addLogSink, registerLogOutput, getLogBuffer } from './plainkit/js/log.js';

// Sees every entry: { at, level, scope, message, detail }. Returns a function that stops it.
const stop = addLogSink(entry => navigator.sendBeacon('/log', JSON.stringify(entry)));

// An output you can name in a route: routes: { error: ['console', 'telemetry'] }
registerLogOutput('telemetry', entry => navigator.sendBeacon('/log', JSON.stringify(entry)));

const recent = getLogBuffer();
```

The SDK itself makes no request to another origin, so anything you send is your own choice.

## See the log

The [Dev tools](../devtools/index.html) page has a Logs tab, and the same viewer is a module you can put in your own page:

```js
import { mountLogs } from './plainkit/modules/logs/logs.js';

const logs = await mountLogs(document.getElementById('logs'), { height: '24rem' });
```

## In Blazor

Configure the logger through `PkOptions.Logging`, and optionally forward the SDK's entries to `ILogger`. The browser is untrusted input to this
bridge, so forwarded entries always use the fixed category `PlainKit.Browser` (never a category the client picks), with control characters
stripped, length capped, and calls rate-limited per circuit:

```csharp
builder.Services.AddPlainKit(o =>
{
    o.Logging.Level = PkLogLevel.Info;
    o.Logging.Scopes["loader"] = PkLogLevel.Debug;
    o.Logging.ForwardToILogger = true;
    o.Logging.ForwardMinimumLevel = PkLogLevel.Warn;
});
```

Inject `IPkLog` to write your own entries into the SDK's log, so the logs viewer shows them beside the SDK's. Entries written that way are not echoed back to `ILogger`, so there is no loop. Use `ILogger` for your server logs as usual and `IPkLog` for messages you want in the browser-side log:

```razor
@inject IPkLog PkLog

<PkButton OnClick="Declined">Decline</PkButton>

@code {
    private async Task Declined() => await PkLog.WriteAsync(PkLogLevel.Warn, "checkout", "Card declined");
}
```

Setting up the package is in [Getting started with Blazor](getting-started-blazor.md).
