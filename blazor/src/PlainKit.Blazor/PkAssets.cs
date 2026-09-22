using Microsoft.AspNetCore.Components;

namespace PlainKit.Blazor;

/// <summary>Where the toolkit's files are served from when PlainKit.Blazor is referenced (static web assets).</summary>
public static class PkAssets
{
    /// <summary>The folder holding the toolkit's <c>dist</c>; every other path here is relative to it.</summary>
    public const string Root = "_content/PlainKit.Blazor/plainkit/";

    /// <summary>The page stylesheet: tokens, base, utilities and the layout the custom elements rely on.</summary>
    public const string Css = Root + "plainkit.css";

    /// <summary>The minified page stylesheet (the same rules as <see cref="Css"/>).</summary>
    public const string CssMin = Root + "plainkit.min.css";

    /// <summary>The page <c>&lt;pk-gallery&gt;</c> frames.</summary>
    public const string GalleryEmbed = Root + "gallery/embed.html";

    /// <summary>
    /// Paths (relative to <see cref="Root"/>) worth a <c>&lt;link rel="modulepreload"&gt;</c> hint on a page that uses <c>pk-*</c> elements: the
    /// small entry, the loader, its logger, the element registry and the base class every element shares. Without the hint the browser still
    /// fetches the same files, but only one at a time, each discovered by parsing the one before it; the hint lets it fetch them in parallel
    /// instead, so the page's first element upgrades sooner. The exact element modules are not here: which ones a page needs depends on its
    /// markup. See <c>PkStyles</c>'s <c>Preload</c> parameter.
    /// </summary>
    public static readonly string[] PreloadPaths = ["js/init.js", "js/loader.js", "js/log.js", "elements/registry.js", "js/element.js", "js/element-core.js"];

    /// <summary><see cref="Css"/> with a content-hash cache-busting query (<c>?v=...</c>).</summary>
    public static string CssVersioned => Versioned(Css);

    /// <summary><see cref="CssMin"/> with a content-hash cache-busting query (<c>?v=...</c>).</summary>
    public static string CssMinVersioned => Versioned(CssMin);

    /// <summary>
    /// The URL of one of the toolkit's files with a cache-busting query built from the file's content hash: <c>?v=</c> and the first 12
    /// characters of its SHA-384 digest (base64url). The hash comes from the package's <c>manifest.json</c>, which travels inside the assembly and
    /// is read once, so a call does no file access and the URL changes exactly when the file's content does. Pass a path relative to
    /// <see cref="Root"/> (<c>plainkit.css</c>, <c>js/plainkit.js</c>) or a full one (<see cref="Css"/>, <see cref="GalleryEmbed"/>). A file the
    /// manifest does not know is returned unchanged.
    /// </summary>
    public static string Versioned(string path)
    {
        ArgumentNullException.ThrowIfNull(path);
        var (file, url) = Normalise(path);
        var digest = Digest(file);
        return digest is null ? url : url + "?v=" + digest.Replace('+', '-').Replace('/', '_').Replace("=", "")[..Math.Min(12, digest.Length)];
    }

    /// <summary>The Subresource Integrity value (<c>sha384-...</c>) of one of the toolkit's files, for an <c>integrity</c> attribute, or null when the manifest does not list it. Same paths as <see cref="Versioned"/>.</summary>
    public static string? Integrity(string path)
    {
        ArgumentNullException.ThrowIfNull(path);
        var digest = Digest(Normalise(path).File);
        return digest is null ? null : "sha384-" + digest;
    }

    private static (string File, string Url) Normalise(string path)
    {
        var p = path.TrimStart('/');
        var file = p.StartsWith(Root, StringComparison.Ordinal) ? p[Root.Length..] : p;
        return (file, Root + file);
    }

    private static string? Digest(string file) => Hashes.Value.TryGetValue(file, out var v) ? v : null;

    // The manifest is an embedded copy of wwwroot/plainkit/manifest.json (the file list of core/dist with each file's SHA-384). Read once.
    private static readonly Lazy<Dictionary<string, string>> Hashes = new(() =>
    {
        var map = new Dictionary<string, string>(StringComparer.Ordinal);
        try
        {
            using var stream = typeof(PkAssets).Assembly.GetManifestResourceStream("plainkit-assets/manifest.json");
            if (stream is null) return map;
            using var doc = System.Text.Json.JsonDocument.Parse(stream);
            foreach (var f in doc.RootElement.GetProperty("files").EnumerateArray())
            {
                var integrity = f.GetProperty("integrity").GetString();
                var path = f.GetProperty("path").GetString();
                if (path is not null && integrity is not null && integrity.StartsWith("sha384-", StringComparison.Ordinal))
                    map[path] = integrity["sha384-".Length..];
            }
        }
        catch (Exception e) when (e is System.Text.Json.JsonException or KeyNotFoundException or InvalidOperationException) { }
        return map;
    });

    internal const string Bridge = "./_content/PlainKit.Blazor/plainkit.blazor.js";

    /// <summary>
    /// The bridge's URL. Given a <see cref="ResourceAssetCollection"/> (a component's own <c>Assets</c>, from <c>Microsoft.AspNetCore.Components.Web</c>),
    /// this is the fingerprinted URL ASP.NET Core's static asset pipeline already builds for it (<c>MapStaticAssets</c>, on by default), which the
    /// host serves with <c>Cache-Control: max-age=31536000, immutable</c> once it calls <c>app.MapStaticAssets()</c>; a browser then fetches it once
    /// per version instead of revalidating it on every visit. Without one, this is <see cref="Bridge"/>, the plain path (still correct, always
    /// revalidated).
    /// </summary>
    internal static string BridgeUrl(ResourceAssetCollection? assets)
    {
        // A dynamic import() specifier must start with "./", "../" or "/" (or be an absolute URL): a bare "_content/..." is a module specifier the
        // browser cannot resolve without an import map, and fails with "Failed to resolve module specifier". Assets[...] never returns the "./" prefix.
        if (assets is null) return Bridge;
        var url = assets["_content/PlainKit.Blazor/plainkit.blazor.js"];
        return url.StartsWith('.') || url.StartsWith('/') || url.Contains("://") ? url : "./" + url;
    }

    /// <summary>
    /// The Plainkit release this package is (SemVer with a pre-release part while the SDK is in alpha, such as <c>MAJOR.MINOR.PATCH-alpha.N</c>). The SDK and this package always share one version, taken
    /// from <c>core/VERSION</c>; <see cref="PkRuntime.GetSdkVersionAsync"/> asks the JavaScript assets the package serves for theirs.
    /// </summary>
    public static string Version { get; } =
        typeof(PkAssets).Assembly.GetCustomAttributes(typeof(System.Reflection.AssemblyInformationalVersionAttribute), false)
            .OfType<System.Reflection.AssemblyInformationalVersionAttribute>().FirstOrDefault()?.InformationalVersion.Split('+')[0]
        ?? "0.0.0";
}
