using System.Text.Json;
using Bunit;
using Microsoft.Extensions.DependencyInjection;
using PlainKit.Blazor;

namespace PlainKit.Blazor.Tests;

// PkAssets (the file paths, the content-hash URLs) and PkStyles (an in-place link by default, not HeadContent).
public sealed class PageAssetsTests : BunitContext, IAsyncLifetime
{
    Task IAsyncLifetime.InitializeAsync() => Task.CompletedTask;
    async Task IAsyncLifetime.DisposeAsync() => await DisposeAsync();

    public PageAssetsTests()
    {
        JSInterop.Mode = JSRuntimeMode.Loose;
        Services.AddPlainKit();
    }

    private static string ManifestHash(string file)
    {
        var dir = AppContext.BaseDirectory;
        while (dir is not null && !File.Exists(Path.Combine(dir, "core", "VERSION"))) dir = Path.GetDirectoryName(dir);
        Assert.NotNull(dir);
        using var doc = JsonDocument.Parse(File.ReadAllText(Path.Combine(dir!, "core", "dist", "manifest.json")));
        foreach (var f in doc.RootElement.GetProperty("files").EnumerateArray())
            if (f.GetProperty("path").GetString() == file) return f.GetProperty("integrity").GetString()!;
        throw new InvalidOperationException(file + " is not in the manifest");
    }

    [Fact]
    public void CssMin_is_the_minified_stylesheet_next_to_Css()
    {
        Assert.Equal(PkAssets.Root + "plainkit.min.css", PkAssets.CssMin);
        Assert.Equal(PkAssets.Root + "plainkit.css", PkAssets.Css);
    }

    [Fact]
    public void Versioned_adds_the_content_hash_of_the_file_from_the_manifest()
    {
        var digest = ManifestHash("plainkit.css")["sha384-".Length..].Replace('+', '-').Replace('/', '_').Replace("=", "");

        Assert.Equal(PkAssets.Css + "?v=" + digest[..12], PkAssets.CssVersioned);
        Assert.Equal(PkAssets.Css + "?v=" + digest[..12], PkAssets.Versioned("plainkit.css"));
        Assert.Equal(PkAssets.Css + "?v=" + digest[..12], PkAssets.Versioned("/" + PkAssets.Css));
        Assert.Matches("^[A-Za-z0-9_-]{12}$", PkAssets.CssMinVersioned[(PkAssets.CssMin.Length + 3)..]);
        Assert.NotEqual(PkAssets.CssVersioned[PkAssets.Css.Length..], PkAssets.CssMinVersioned[PkAssets.CssMin.Length..]);
    }

    [Fact]
    public void Versioned_covers_the_other_assets_and_leaves_an_unknown_file_alone()
    {
        Assert.StartsWith(PkAssets.Root + "js/plainkit.js?v=", PkAssets.Versioned("js/plainkit.js"));
        Assert.StartsWith(PkAssets.GalleryEmbed + "?v=", PkAssets.Versioned(PkAssets.GalleryEmbed));
        Assert.Equal(PkAssets.Root + "nope.css", PkAssets.Versioned("nope.css"));
        Assert.Null(PkAssets.Integrity("nope.css"));
    }

    [Fact]
    public void Integrity_is_the_manifest_sha384_of_the_file()
    {
        Assert.Equal(ManifestHash("plainkit.css"), PkAssets.Integrity(PkAssets.Css));
        Assert.Equal(ManifestHash("plainkit.min.css"), PkAssets.Integrity("plainkit.min.css"));
    }

    [Fact]
    public void PkStyles_renders_a_plain_link_in_place_with_the_content_hash()
    {
        var cut = Render<PkStyles>();
        var link = cut.Find("link");

        Assert.Equal("stylesheet", link.GetAttribute("rel"));
        Assert.Equal(PkAssets.CssVersioned, link.GetAttribute("href"));
    }

    [Fact]
    public void PkStyles_can_link_the_minified_file_and_drop_the_hash()
    {
        Assert.Equal(PkAssets.CssMinVersioned, Render<PkStyles>(p => p.Add(x => x.Minified, true)).Find("link").GetAttribute("href"));
        Assert.Equal(PkAssets.Css, Render<PkStyles>(p => p.Add(x => x.Versioned, false)).Find("link").GetAttribute("href"));
        Assert.Equal(PkAssets.CssMin, Render<PkStyles>(p => p.Add(x => x.Versioned, false).Add(x => x.Minified, true)).Find("link").GetAttribute("href"));
    }

    [Fact]
    public void PkStyles_InHead_goes_through_HeadContent_and_renders_nothing_in_place()
    {
        var cut = Render<PkStyles>(p => p.Add(x => x.InHead, true));

        Assert.Empty(cut.FindAll("link"));
    }
}
