namespace PlainKit.Blazor;

/// <summary>What pk-dock's confirmLayout callback passes for a proposed change: the resize, tab switch or repair that the element wants to
/// apply, before it does. Layout is the proposed document as JSON (the same shape as PkDock's Layout parameter); Reason is resize, activate or
/// panels, as in PkLayoutChangeEventArgs.</summary>
internal sealed record PkLayoutChangingRequest(string Layout, string Reason);
