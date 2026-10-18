using Bunit;
using Microsoft.AspNetCore.Components;
using Microsoft.Extensions.DependencyInjection;
using PlainKit.Blazor.Pages;
using PlainKit.Blazor.Testing;

namespace PlainKit.Blazor.Tests;

// The supported test seam for pages that use PkListPage<TItem> and PkRecordPage<TItem> (#1553): public API and rendered markup only.
public sealed class PkPageTestingTests : BunitContext, IAsyncLifetime
{
    Task IAsyncLifetime.InitializeAsync() => Task.CompletedTask;
    async Task IAsyncLifetime.DisposeAsync() => await DisposeAsync();

    private sealed class Person { public int Id { get; set; } public string Name { get; set; } = ""; public bool Active { get; set; } }

    private static readonly IReadOnlyList<PkFieldSpec<Person>> PersonFields =
    [
        new() { Key = "name", Label = "Name", Required = true, Get = p => p.Name, Set = (p, v) => p.Name = v ?? "" },
        PkFieldSpec<Person>.Bool("active", "Active", p => p.Active, (p, v) => p.Active = v),
    ];

    public PkPageTestingTests()
    {
        JSInterop.Mode = JSRuntimeMode.Loose;
        Services.AddPlainKit();
    }

    [Fact]
    public async Task A_list_page_loads_rows_renders_cells_and_clicks_a_row()
    {
        PkListRequest? asked = null;
        string? clicked = null;
        var cut = Render<PkListPage<Person>>(p => p
            .Add(x => x.Config, "{\"heading\":\"People\",\"pageSize\":10}")
            .Add(x => x.Columns, [new PkTableColumn<Person> { Key = "name", Label = "Name", Cell = c => b => b.AddContent(0, "cell:" + c.Name) }])
            .Add(x => x.IdOf, c => c.Id.ToString())
            .Add(x => x.Load, r => { asked = r; return Task.FromResult(new PkListResult<Person>([new() { Id = 1, Name = "Ada" }, new() { Id = 2, Name = "Grace" }], 2)); })
            .Add(x => x.OnRowClick, EventCallback.Factory.Create<PkRowClickEventArgs>(this, e => clicked = e.Id)));
        Assert.Empty(cut.FindAll("[slot^=cell-]"));

        var result = await cut.Instance.LoadAsync();

        Assert.Equal(2, result.Total);
        Assert.Equal(10, asked!.PageSize);
        Assert.Equal("cell:Grace", cut.Find("[slot=cell-2-name]").TextContent);
        Assert.Equal("People", cut.Instance.Sent()["heading"]!.GetValue<string>());

        await cut.Instance.ClickRowAsync("2");
        Assert.Equal("2", clicked);
        clicked = null;
        await cut.Instance.ClickRowAsync("99");
        Assert.Null(clicked);
    }

    [Fact]
    public async Task A_list_page_takes_the_request_a_test_passes()
    {
        PkListRequest? asked = null;
        var cut = Render<PkListPage<Person>>(p => p.Add(x => x.Load, r => { asked = r; return Task.FromResult(new PkListResult<Person>([], 0)); }));
        await cut.Instance.LoadAsync(new PkListRequest("ada", "name", true, 3, 5));
        Assert.Equal("ada", asked!.Search);
        Assert.Equal(3, asked.Page);
    }

    private IRenderedComponent<PkRecordPage<Person>> RecordPage(Func<Person, Task>? save = null, Action<string?>? onDelete = null, Action<string?>? onAction = null) => Render<PkRecordPage<Person>>(p => p
        .Add(x => x.Config, "{\"id\":\"7\",\"title\":\"Person\",\"sidebar\":[{\"heading\":\"Status\",\"fields\":[\"active\"]}]}")
        .Add(x => x.Fields, PersonFields)
        .Add(x => x.Load, id => Task.FromResult<Person?>(new Person { Id = int.Parse(id), Name = "Ada" }))
        .Add(x => x.Save, save)
        .Add(x => x.OnDelete, EventCallback.Factory.Create<PkRecordDeleteEventArgs>(this, e => onDelete?.Invoke(e.Id)))
        .Add(x => x.OnAction, EventCallback.Factory.Create<PkActionEventArgs>(this, e => onAction?.Invoke(e.Key))));

    [Fact]
    public async Task A_record_page_loads_edits_saves_and_cancels()
    {
        Person? saved = null;
        var cut = RecordPage(p => { saved = p; return Task.CompletedTask; });

        var item = await cut.Instance.LoadAsync("7");
        Assert.Equal(7, item!.Id);
        Assert.Equal("Ada", cut.Instance.Field("name").Value);
        Assert.True(cut.Instance.Field("name").Required);
        Assert.Equal("Person", cut.Instance.Title());
        Assert.Equal(new[] { "active" }, cut.Instance.Sidebar().Single().Fields);

        cut.Instance.SetField("name", "Grace");
        Assert.Equal("Grace", cut.Instance.Field("name").Value);
        cut.Instance.Cancel();
        Assert.Equal("Ada", cut.Instance.Field("name").Value);

        cut.Instance.SetField("name", "Grace");
        cut.Instance.SetField("active", true);
        Assert.Null(await cut.Instance.SaveAsync());
        Assert.Equal("Grace", saved!.Name);
        Assert.True(saved.Active);
        Assert.Throws<InvalidOperationException>(() => cut.Instance.SetField("nope", "x"));
    }

    [Fact]
    public async Task A_failing_save_returns_its_message_and_keeps_the_edits()
    {
        var cut = RecordPage(_ => throw new InvalidOperationException("Name taken"));
        await cut.Instance.LoadAsync("7");
        cut.Instance.SetField("name", "Grace");

        Assert.Equal("Name taken", await cut.Instance.SaveAsync());
        Assert.Equal("Grace", cut.Instance.Field("name").Value);
    }

    [Fact]
    public async Task A_record_page_raises_delete_and_an_action()
    {
        string? deleted = null, action = null;
        var cut = RecordPage(onDelete: id => deleted = id, onAction: k => action = k);
        await cut.Instance.DeleteAsync();
        await cut.Instance.ActionAsync("print");
        Assert.Equal("7", deleted);
        Assert.Equal("print", action);
    }
}
