using Microsoft.JSInterop;

namespace PlainKit.Blazor;

/// <summary>
/// What a page gets of a <see cref="PkSnapshot"/> built in memory (#959): a lean file list (path, language, line count) and a reference to read one file's text through, which
/// the code explorer's lazy provider calls on demand. The contents never go across interop up front (a 2500 file source root froze the browser tab).
/// </summary>
internal sealed class PkSnapshotReader : IDisposable
{
    private readonly Dictionary<string, string> _texts;
    private readonly DotNetObjectReference<PkSnapshotReader> _ref;
    private readonly List<object> _files;

    internal PkSnapshotReader(PkSnapshot snapshot)
    {
        _texts = snapshot.Files.ToDictionary(f => f.Path, f => f.Content, StringComparer.Ordinal);
        _files = [.. snapshot.Files.Select(f => new { path = f.Path, language = f.Language, lines = f.Content.Split('\n').Length })];
        _ref = DotNetObjectReference.Create(this);
    }

    /// <summary>The mount option the page's bridge turns into a lazy provider: { files, reader }.</summary>
    internal object Lazy => new { files = _files, reader = _ref };

    /// <summary>One file's text, or null for a path the snapshot does not hold.</summary>
    [JSInvokable] public string? Read(string path) => _texts.GetValueOrDefault(path);

    public void Dispose() => _ref.Dispose();
}
