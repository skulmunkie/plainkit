using Bunit;
using Microsoft.AspNetCore.Components;
using Microsoft.AspNetCore.Components.Forms;
using Microsoft.Extensions.DependencyInjection;
using PlainKit.Blazor;

namespace PlainKit.Blazor.Tests;

// PkMarkdownEditor (#1522), generated from blazor/mappings/markdown-editor.json: the parameters reach the element, pk-change is the two-way commit, and the
// field takes part in an EditForm. The editing itself (toolbar, lists, paste) is covered by the in-browser cases and the Blazor browser harness.
public sealed class PkMarkdownEditorTests : BunitContext, IAsyncLifetime
{
    Task IAsyncLifetime.InitializeAsync() => Task.CompletedTask;
    async Task IAsyncLifetime.DisposeAsync() => await DisposeAsync();

    public PkMarkdownEditorTests()
    {
        JSInterop.Mode = JSRuntimeMode.Loose;
        JSInterop.SetupModule(PkAssets.Bridge).Mode = JSRuntimeMode.Loose;
        Services.AddPlainKit();
    }

    [Fact]
    public void The_parameters_reach_the_element()
    {
        var cut = Render<PkMarkdownEditor>(p => p
            .Add(x => x.Value, "# Title")
            .Add(x => x.Name, "body")
            .Add(x => x.Label, "Body")
            .Add(x => x.Toolbar, "bold link")
            .Add(x => x.ReadOnly, true));

        var el = cut.Find("pk-markdown-editor");
        Assert.Equal("# Title", el.GetAttribute("value"));
        Assert.Equal("body", el.GetAttribute("name"));
        Assert.Equal("Body", el.GetAttribute("label"));
        Assert.Equal("bold link", el.GetAttribute("toolbar"));
        Assert.NotNull(el.GetAttribute("readonly"));
    }

    [Fact]
    public async Task A_committed_change_updates_the_bound_value()
    {
        string? bound = null;
        var cut = Render<PkMarkdownEditor>(p => p
            .Add(x => x.Value, "make bold")
            .Add(x => x.ValueChanged, EventCallback.Factory.Create<string?>(this, v => bound = v)));

        await cut.Find("pk-markdown-editor").TriggerEventAsync("onpk-change", new PkChangeEventArgs { Value = "make **bold**" });

        Assert.Equal("make **bold**", bound);
        Assert.Equal("make **bold**", cut.Instance.Value);
    }

    [Fact]
    public async Task Inside_an_EditForm_a_change_marks_the_field_modified()
    {
        var model = new Note();
        var context = new EditContext(model);
        var cut = Render<PkMarkdownEditor>(p => p
            .Add(x => x.Value, model.Body)
            .Add(x => x.ValueChanged, EventCallback.Factory.Create<string?>(this, v => model.Body = v))
            .Add(x => x.ValueExpression, () => model.Body)
            .AddCascadingValue(context));

        await cut.Find("pk-markdown-editor").TriggerEventAsync("onpk-change", new PkChangeEventArgs { Value = "- one" });

        Assert.Equal("- one", model.Body);
        Assert.True(context.IsModified(new FieldIdentifier(model, nameof(Note.Body))));
    }

    private sealed class Note { public string? Body { get; set; } }
}
