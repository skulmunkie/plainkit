using Bunit;
using Microsoft.Extensions.DependencyInjection;
using PlainKit.Blazor;
using PlainKit.Blazor.Components;
using PlainKit.Blazor.Testing;

namespace PlainKit.Blazor.Tests;

// The supported seams for PkFieldGroup, PkPageHeader crumbs and the PkDataTable add action (#998), written as a consumer writes them: only the public API.
public sealed class PkFieldGroupTestingTests : BunitContext, IAsyncLifetime
{
    Task IAsyncLifetime.InitializeAsync() => Task.CompletedTask;
    async Task IAsyncLifetime.DisposeAsync() => await DisposeAsync();

    private sealed class Order
    {
        public string Name { get; set; } = "Ada";
        public bool Active { get; set; }
        public string Note { get; set; } = "n";
    }

    public PkFieldGroupTestingTests()
    {
        JSInterop.Mode = JSRuntimeMode.Loose;
        JSInterop.SetupModule(PkAssets.Bridge).Mode = JSRuntimeMode.Loose;
        Services.AddPlainKit();
    }

    private static PkFieldSpec<Order>[] Specs() =>
    [
        new() { Key = "name", Label = "Name", Required = true, Get = o => o.Name, Set = (o, v) => o.Name = v ?? "" },
        new() { Key = "active", Label = "Active", Kind = PkFieldKind.Checkbox, Get = o => o.Active ? "true" : "", Set = (o, v) => o.Active = v == "true" },
        new() { Key = "note", Label = "Note", ReadOnly = o => !o.Active, When = o => o.Name != "hide", Get = o => o.Note, Set = (o, v) => o.Note = v ?? "" },
    ];

    [Fact]
    public async Task Fields_show_the_flags_and_values_and_a_commit_updates_the_model()
    {
        var order = new Order();
        var changes = 0;
        var cut = Render<PkFieldGroup<Order>>(p => p.Add(x => x.Fields, Specs()).Add(x => x.Model, order).Add(x => x.ModelChanged, () => changes++));

        Assert.Equal(["name", "active", "note"], cut.Instance.Fields().Select(f => f.Key));
        Assert.True(cut.Instance.Field("name").Required);
        Assert.Equal("Ada", cut.Instance.Field("name").Value);
        Assert.True(cut.Instance.Field("note").ReadOnly);

        await cut.Instance.CommitAsync("name", "hide");
        await cut.Instance.CommitAsync("active", true);

        Assert.Equal(("hide", true), (order.Name, order.Active));
        Assert.Equal(2, changes);
        Assert.Equal(["name", "active"], cut.Instance.Fields().Select(f => f.Key));   // note's When is false now
        Assert.Throws<InvalidOperationException>(() => cut.Instance.Field("note"));
    }

    [Fact]
    public void The_crumb_trail_is_a_typed_list()
    {
        var cut = Render<PkPageHeader>(p => p.Add(x => x.Crumbs, new PkCrumb[] { new("Home", "/"), new("Orders") }));
        Assert.Equal([new PkCrumb("Home", "/"), new PkCrumb("Orders")], cut.Instance.CrumbTrail());
        Assert.Empty(Render<PkPageHeader>().Instance.CrumbTrail());
    }

    private sealed record Row(int Id);

    [Fact]
    public async Task Add_raises_OnAdd_only_when_the_table_has_an_add_label()
    {
        var adds = 0;
        PkListResult<Row> empty = new([], 0);
        var cut = Render<PkDataTable<Row>>(p => p.Add(x => x.Columns, new PkTableColumn<Row>[] { new() { Key = "Id", Label = "Id" } })
            .Add(x => x.IdOf, r => r.Id.ToString()).Add(x => x.Load, _ => Task.FromResult(empty)).Add(x => x.OnAdd, () => adds++));
        await cut.Instance.AddAsync();
        Assert.Equal(0, adds);

        cut.Render(p => p.Add(x => x.AddLabel, "Add order"));
        await cut.Instance.AddAsync();
        Assert.Equal(1, adds);
    }
}
