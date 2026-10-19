using Microsoft.AspNetCore.Components;

namespace PlainKit.Blazor;

public abstract partial class PageBase
{
    [Inject] private IServiceProvider PkServices { get; set; } = default!;

    /// <summary>Whether this page's busy state blocks the page (<see cref="PkApp"/> draws the overlay; default true). A page that draws its own <see cref="PkLoadingOverlay"/> returns false.</summary>
    protected virtual bool BusyBlocksPage => true;

    private PkBusyState? _pageBusy;
    // Resolved once at the first SetParametersAsync (the injected provider is live) and kept: dispose runs after a static render's scope is gone, so ReportBusy never touches DI (#1586). A no-op when AddPlainKit was not called.
    private void ResolveBusy() => _pageBusy ??= PkServices?.GetService(typeof(PkBusyState)) as PkBusyState;
    private void ReportBusy() => _pageBusy?.Set(this, BusyBlocksPage && _life.IsBusy, _life.BusyLabel);
}
