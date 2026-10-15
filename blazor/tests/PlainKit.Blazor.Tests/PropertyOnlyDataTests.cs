using Bunit;
using Microsoft.Extensions.DependencyInjection;
using PlainKit.Blazor;

namespace PlainKit.Blazor.Tests;

// Elements whose data is a property with no attribute (#1376): the typed parameter reaches the element as el[property] through the bridge, camelCase JSON, once per change.
public sealed class PropertyOnlyDataTests : BunitContext
{
    private readonly BunitJSModuleInterop _bridge;

    public PropertyOnlyDataTests()
    {
        JSInterop.Mode = JSRuntimeMode.Loose;
        _bridge = JSInterop.SetupModule(PkAssets.Bridge);
        _bridge.Mode = JSRuntimeMode.Loose;
        Services.AddPlainKit();
    }

    private List<string?> Sent(string prop) =>
        _bridge.Invocations["setProperty"].Where(i => (string?)i.Arguments[1] == prop).Select(i => (string?)i.Arguments[2]).ToList();

    [Fact]
    public void Command_palette_items_are_set_as_a_property_not_an_attribute()
    {
        var cut = Render<PkCommandPalette>(p => p.Add(x => x.Items, new[] { new PkCommandPaletteItem { Id = "new", Label = "New file", Shortcut = "N" } }));

        Assert.Equal("[{\"id\":\"new\",\"label\":\"New file\",\"shortcut\":\"N\"}]", Assert.Single(Sent("items")));
        Assert.Null(cut.Find("pk-command-palette").GetAttribute("items"));
    }

    [Fact]
    public void An_unset_property_is_never_sent_and_a_change_is_sent_once()
    {
        var cut = Render<PkLightbox>();
        Assert.False(_bridge.Invocations.ContainsKey("setProperty"));

        var one = new[] { new PkLightboxItem { Src = "/a.png", Alt = "A" } };
        cut.Render(p => p.Add(x => x.Items, one));
        cut.Render(p => p.Add(x => x.Items, one).Add(x => x.Label, "Viewer"));
        Assert.Single(Sent("items"));

        cut.Render(p => p.Add(x => x.Items, new[] { new PkLightboxItem { Src = "/b.png", Alt = "B", Caption = "Bee" } }));
        Assert.Equal(2, Sent("items").Count);
        Assert.Contains("\"caption\":\"Bee\"", Sent("items")[1]);

        cut.Render(p => p.Add(x => x.Items, null));
        Assert.Null(Sent("items").Last());
    }

    [Fact]
    public void Code_view_segments_are_one_list_of_runs_per_line()
    {
        Render<PkCodeView>(p => p.Add(x => x.Segments, new[] { new[] { new PkCodeSegment { Text = "var", Kind = "keyword" }, new PkCodeSegment { Text = " x" } } }));

        Assert.Equal("[[{\"text\":\"var\",\"kind\":\"keyword\"},{\"text\":\" x\"}]]", Assert.Single(Sent("segments")));
    }
}
