using Bunit;
using Microsoft.AspNetCore.Components;
using Microsoft.AspNetCore.Components.Rendering;
using Microsoft.Extensions.DependencyInjection;
using PlainKit.Blazor;
using PlainKit.Blazor.Components;
using PlainKit.Blazor.Testing;

namespace PlainKit.Blazor.Tests;

// The page-wide field seams (#1213), written as a consumer writes them: several groups of a private item type, the type never named.
public sealed class PkFieldTestingTests : BunitContext, IAsyncLifetime
{
    private sealed class Card { public string A { get; set; } = "a"; public string B { get; set; } = "b"; public string C { get; set; } = "c"; }

    private sealed class Page : ComponentBase
    {
        public static Card First = new(), Second = new(), Hidden = new();

        protected override void BuildRenderTree(RenderTreeBuilder b)
        {
            Group(b, First, new() { Label = "L", Key = "a", Get = o => o.A, Set = (o, v) => o.A = v ?? "" });
            Group(b, Hidden, new() { Label = "L", Key = "h", When = _ => false, Get = o => o.C, Set = (o, v) => o.C = v ?? "" });
            Group(b, Second, new() { Label = "L", Key = "b", Get = o => o.B, Set = (o, v) => o.B = v ?? "" });
        }

        private static void Group(RenderTreeBuilder b, Card model, PkFieldSpec<Card> spec)
        {
            b.OpenComponent<PkFieldGroup<Card>>(0);
            b.AddAttribute(1, "Model", model);
            b.AddAttribute(2, "Fields", new[] { spec });
            b.CloseComponent();
        }
    }

    Task IAsyncLifetime.InitializeAsync() => Task.CompletedTask;
    async Task IAsyncLifetime.DisposeAsync() => await DisposeAsync();

    public PkFieldTestingTests()
    {
        JSInterop.Mode = JSRuntimeMode.Loose;
        JSInterop.SetupModule(PkAssets.Bridge).Mode = JSRuntimeMode.Loose;
        Services.AddPlainKit();
        Page.First = new(); Page.Second = new(); Page.Hidden = new();
    }

    [Fact]
    public void Shown_fields_span_every_group_in_document_order_and_skip_hidden_ones()
    {
        Render<Page>();
        Assert.Equal(["a", "b"], Services.FieldStates().Select(f => f.Key));
        Assert.Equal("b", Services.FieldState("b")!.Value);
        Assert.Null(Services.FieldState("h"));
        Assert.Null(Services.FieldState("zzz"));
    }

    [Fact]
    public async Task Commit_goes_to_the_group_that_shows_the_key()
    {
        Render<Page>();
        Assert.Null(await Services.CommitFieldAsync("b", "new"));
        Assert.Equal(("a", "new", "c"), (Page.First.A, Page.Second.B, Page.Hidden.C));
        await Assert.ThrowsAsync<InvalidOperationException>(() => Services.CommitFieldAsync("h", "x"));
    }
}
