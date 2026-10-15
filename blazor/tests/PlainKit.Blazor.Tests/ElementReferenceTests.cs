using Bunit;
using Microsoft.Extensions.DependencyInjection;
using PlainKit.Blazor;

namespace PlainKit.Blazor.Tests;

// Properties that hold an element (#1389): the parameter is the element's id; the bridge's setRef resolves it in the element's own root, once per change.
public sealed class ElementReferenceTests : BunitContext, IAsyncLifetime
{
    Task IAsyncLifetime.InitializeAsync() => Task.CompletedTask;
    async Task IAsyncLifetime.DisposeAsync() => await DisposeAsync();

    private readonly BunitJSModuleInterop _bridge;

    public ElementReferenceTests()
    {
        JSInterop.Mode = JSRuntimeMode.Loose;
        _bridge = JSInterop.SetupModule(PkAssets.Bridge);
        _bridge.Mode = JSRuntimeMode.Loose;
        Services.AddPlainKit();
    }

    private List<string?> Sent(string prop) =>
        _bridge.Invocations["setRef"].Where(i => (string?)i.Arguments[1] == prop).Select(i => (string?)i.Arguments[2]).ToList();

    [Fact]
    public void Design_surface_selection_is_an_id_sent_once_per_change_and_never_an_attribute()
    {
        var cut = Render<PkDesignSurface>(p => p.Add(x => x.Selected, "n1").Add(x => x.ChipFor, "n1").Add(x => x.DropTarget, "box"));

        Assert.Equal("n1", Assert.Single(Sent("selected")));
        Assert.Equal("n1", Assert.Single(Sent("chipFor")));
        Assert.Equal("box", Assert.Single(Sent("dropTarget")));
        Assert.Null(cut.Find("pk-design-surface").GetAttribute("selected"));

        cut.Render(p => p.Add(x => x.Selected, "n1").Add(x => x.Label, "Page"));
        Assert.Single(Sent("selected"));

        cut.Render(p => p.Add(x => x.Selected, "n2"));
        Assert.Equal(new string?[] { "n1", "n2" }, Sent("selected"));

        cut.Render(p => p.Add(x => x.Selected, null));
        Assert.Null(Sent("selected").Last());
    }

    [Fact]
    public void Unset_references_are_never_sent()
    {
        Render<PkDesignSurface>();
        Render<PkButton>();
        Render<PkInput>();
        Assert.DoesNotContain("setRef", _bridge.Invocations.Select(i => i.Identifier));
    }

    [Fact]
    public void Button_controls_and_input_listbox_are_ids()
    {
        Render<PkButton>(p => p.Add(x => x.Controls, "menu a"));
        Render<PkInput>(p => p.Add(x => x.Listbox, "options"));

        Assert.Equal("menu a", Assert.Single(Sent("controls")));
        Assert.Equal("options", Assert.Single(Sent("listbox")));
    }
}
