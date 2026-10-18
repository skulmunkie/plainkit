using Microsoft.AspNetCore.Components;

namespace PlainKit.Blazor;

public abstract partial class PageBase
{
    [Inject] private IServiceProvider PkServices { get; set; } = default!;

    /// <summary>Whether this page's busy state blocks the page (<see cref="PkApp"/> draws the overlay; default true). A page that draws its own <see cref="PkLoadingOverlay"/> returns false.</summary>
    protected virtual bool BusyBlocksPage => true;

    private PkBusyState? _pageBusy;

    // Mirrors the counted busy state into PkBusyState; a no-op when AddPlainKit was not called.
    private void ReportBusy() => (_pageBusy ??= PkServices?.GetService(typeof(PkBusyState)) as PkBusyState)?.Set(this, BusyBlocksPage && _life.IsBusy, _life.BusyLabel);
}
