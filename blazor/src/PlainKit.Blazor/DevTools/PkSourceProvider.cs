using Microsoft.Extensions.Hosting;

namespace PlainKit.Blazor;

/// <summary>Builds, once and on first use, the snapshot the dev tools' Files tab browses.</summary>
public sealed class PkSourceProvider(PkOptions options, IHostEnvironment? environment = null)
{
    private readonly Lazy<Task<PkSnapshot?>> _snapshot = new(() => Task.Run(() => Build(options, environment)));

    /// <summary>The snapshot, or null when there is no folder to browse (a browser-only app has no server-side files).</summary>
    public Task<PkSnapshot?> GetAsync() => _snapshot.Value;

    private static PkSnapshot? Build(PkOptions options, IHostEnvironment? environment)
    {
        var root = options.SourceRoot ?? environment?.ContentRootPath;
        return root is not null && Directory.Exists(root) ? PkSnapshot.FromDirectory(root, options.SourceExclude) : null;
    }
}
