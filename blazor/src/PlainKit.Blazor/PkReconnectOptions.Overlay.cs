namespace PlainKit.Blazor;

public sealed partial class PkReconnectOptions
{
    /// <summary>On a desktop, float the banner over the top of the page instead of reserving its height, so nothing moves while it shows (the app bar is covered meanwhile). A phone always overlays. Default false.</summary>
    public bool Overlay { get; set; }
}
