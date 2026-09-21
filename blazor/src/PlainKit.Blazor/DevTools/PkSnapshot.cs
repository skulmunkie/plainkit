using System.Text.Json.Serialization;
using System.Text.RegularExpressions;

namespace PlainKit.Blazor;

/// <summary>
/// A snapshot of a folder for the code explorer: the same format as the toolkit's <c>tools/snapshot.mjs</c>
/// (<c>{ version, generated, files: [{ path, language, content, symbols }] }</c>), built in memory.
/// </summary>
public sealed partial class PkSnapshot
{
    private static readonly HashSet<string> TextExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".css", ".js", ".mjs", ".ts", ".tsx", ".jsx", ".html", ".svg", ".json", ".md", ".cs", ".razor", ".py", ".java", ".go", ".rs", ".sql", ".yml", ".yaml",
    };
    private static readonly HashSet<string> SkipDirs = new(StringComparer.OrdinalIgnoreCase) { "dist", "node_modules", ".git", "bin", "obj", ".vs", ".claude" };
    private static readonly HashSet<string> SkipFiles = new(StringComparer.OrdinalIgnoreCase) { "snapshot.json", "package-lock.json" };
    private const long MaxBytes = 512 * 1024;

    /// <summary>The snapshot format version.</summary>
    [JsonPropertyName("version")] public int Version { get; init; } = 1;

    /// <summary>When the snapshot was taken (ISO 8601).</summary>
    [JsonPropertyName("generated")] public string Generated { get; init; } = DateTime.UtcNow.ToString("O");

    /// <summary>The files, ordered by path.</summary>
    [JsonPropertyName("files")] public List<PkSnapshotFile> Files { get; init; } = [];

    /// <summary>Text files under <paramref name="folder"/> up to 512 KB, without build output, dependencies or VCS folders. <paramref name="exclude"/> gets each folder as a relative path with forward slashes and returns true to skip it.</summary>
    public static PkSnapshot FromDirectory(string folder, Func<string, bool>? exclude = null)
    {
        var root = Path.GetFullPath(folder);
        var files = new List<PkSnapshotFile>();
        Walk(root, root, files, exclude);
        files.Sort((a, b) => string.CompareOrdinal(a.Path, b.Path));
        return new PkSnapshot { Files = files };
    }

    private static void Walk(string root, string dir, List<PkSnapshotFile> into, Func<string, bool>? exclude)
    {
        foreach (var sub in Directory.EnumerateDirectories(dir))
            if (!SkipDirs.Contains(Path.GetFileName(sub)) && exclude?.Invoke(Path.GetRelativePath(root, sub).Replace('\\', '/')) != true) Walk(root, sub, into, exclude);
        foreach (var file in Directory.EnumerateFiles(dir))
        {
            var ext = Path.GetExtension(file);
            if (!TextExtensions.Contains(ext) || SkipFiles.Contains(Path.GetFileName(file)) || new FileInfo(file).Length > MaxBytes) continue;
            var content = File.ReadAllText(file).ReplaceLineEndings("\n");
            var language = ext.TrimStart('.').ToLowerInvariant();
            if (language == "mjs") language = "js";
            into.Add(new PkSnapshotFile
            {
                Path = Path.GetRelativePath(root, file).Replace('\\', '/'),
                Language = language,
                Content = content,
                Symbols = SymbolsOf(content, language),
            });
        }
    }

    // Declarations worth listing in the outline, like the toolkit's own snapshot tool: top-level JS/TS declarations and CSS class rules,
    // plus types for C#.
    internal static List<PkSnapshotSymbol> SymbolsOf(string content, string language)
    {
        var (regex, kindGroup, nameGroup) = language switch
        {
            "js" or "ts" or "tsx" or "jsx" => (JsDeclaration(), 3, 4),
            "css" => (CssRule(), 0, 1),
            "cs" => (CsType(), 1, 2),
            _ => (null, 0, 0),
        };
        var symbols = new List<PkSnapshotSymbol>();
        if (regex is null) return symbols;
        var lines = content.Split('\n');
        for (var i = 0; i < lines.Length; i++)
        {
            var m = regex.Match(lines[i]);
            if (!m.Success) continue;
            symbols.Add(new PkSnapshotSymbol { Kind = language == "css" ? "rule" : m.Groups[kindGroup].Value, Name = m.Groups[nameGroup].Value, Line = i + 1 });
        }
        return symbols;
    }

    [GeneratedRegex(@"^(export )?(async )?(function|class|const)\s+([A-Za-z_$][\w$]*)")]
    private static partial Regex JsDeclaration();

    [GeneratedRegex(@"^(\.[\w-]+)[^{]*\{")]
    private static partial Regex CssRule();

    [GeneratedRegex(@"^\s*(?:public |internal |private |protected |sealed |static |abstract |partial |readonly )*(class|record|interface|enum|struct)\s+([A-Za-z_]\w*)")]
    private static partial Regex CsType();
}

/// <summary>One file of a <see cref="PkSnapshot"/>.</summary>
public sealed class PkSnapshotFile
{
    /// <summary>Relative to the snapshotted folder, forward slashes.</summary>
    [JsonPropertyName("path")] public string Path { get; init; } = "";

    /// <summary>The file extension without the dot (<c>mjs</c> is reported as <c>js</c>).</summary>
    [JsonPropertyName("language")] public string Language { get; init; } = "";

    /// <summary>The text, with <c>\n</c> line endings.</summary>
    [JsonPropertyName("content")] public string Content { get; init; } = "";

    /// <summary>The outline.</summary>
    [JsonPropertyName("symbols")] public List<PkSnapshotSymbol> Symbols { get; init; } = [];
}

/// <summary>An outline entry: a declaration and the line it starts on.</summary>
public sealed class PkSnapshotSymbol
{
    /// <summary>function, class, const, rule, record, ...</summary>
    [JsonPropertyName("kind")] public string Kind { get; init; } = "";

    /// <summary>The declared name.</summary>
    [JsonPropertyName("name")] public string Name { get; init; } = "";

    /// <summary>1-based line.</summary>
    [JsonPropertyName("line")] public int Line { get; init; }

    /// <summary>Nesting level (0 = top).</summary>
    [JsonPropertyName("depth")] public int Depth { get; init; }
}
