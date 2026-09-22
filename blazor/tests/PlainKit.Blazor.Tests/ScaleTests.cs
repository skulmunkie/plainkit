using System.Diagnostics;
using System.Text;
using Bunit;
using Microsoft.AspNetCore.Components;
using Microsoft.Extensions.DependencyInjection;
using Xunit.Abstractions;

namespace PlainKit.Blazor.Tests;

/// <summary>A benchmark: skipped unless <c>PK_BENCH=1</c>, so a normal <c>dotnet test</c> never runs it (scripts/bench/README.md).</summary>
public sealed class BenchFactAttribute : FactAttribute
{
    public BenchFactAttribute()
    {
        if (Environment.GetEnvironmentVariable("PK_BENCH") != "1") Skip = "benchmark: set PK_BENCH=1 to run (see scripts/bench/README.md)";
    }
}

// Server-side cost of the Blazor components, measured in-process with bUnit (the same renderer a circuit uses, without the network):
// the JavaScript interop calls a page makes (a stable count, guarded below) and, as benchmarks, render time, allocations and retained memory.
public sealed class ScaleTests : BunitContext, IAsyncLifetime
{
    Task IAsyncLifetime.InitializeAsync() => Task.CompletedTask;
    async Task IAsyncLifetime.DisposeAsync() => await DisposeAsync();

    private readonly ITestOutputHelper _out;
    private sealed record Row(int Id, string Name, string City, string Status, int Qty);

    private static readonly PkTableColumn<Row>[] Columns =
    [
        new() { Key = "id", Label = "ID", Type = PkTableColumnType.Number, Sortable = true },
        new() { Key = "name", Label = "Name", Sortable = true },
        new() { Key = "city", Label = "City" },
        new() { Key = "status", Label = "Status" },
        new() { Key = "qty", Label = "Qty", Type = PkTableColumnType.Number },
    ];

    // One delegate, as a page that renders the same lambda again would pass: a parameter set with the same IdOf, Columns and Items serialises nothing (#130).
    private static readonly Func<Row, string> IdOfRow = r => r.Id.ToString();

    public ScaleTests(ITestOutputHelper output)
    {
        _out = output;
        JSInterop.Mode = JSRuntimeMode.Loose;
        Services.AddPlainKit();
    }

    private static Row[] Rows(int n) => Enumerable.Range(1, n).Select(i => new Row(i, "Person " + i, "City " + i % 5, i % 3 == 0 ? "Active" : "Draft", i * 7 % 1000)).ToArray();

    private IRenderedComponent<PkTable<Row>> Table(Row[] rows) => Render<PkTable<Row>>(p => p
        .Add(x => x.Columns, Columns).Add(x => x.Items, rows).Add(x => x.IdOf, IdOfRow).Add(x => x.Selectable, true));

    // ---- guard: interop chatter. However many components a page holds, the toolkit is imported and initialised once. ----

    [Fact]
    public void A_page_of_200_components_makes_one_import_and_one_init()
    {
        var bridge = JSInterop.SetupModule(PkAssets.Bridge);
        bridge.Mode = JSRuntimeMode.Loose;

        Render<Page>(p => p.Add(x => x.Count, 200));

        Assert.Equal(1, JSInterop.Invocations.Count(i => i.Identifier == "import"));
        Assert.Equal(1, bridge.Invocations.Count(i => i.Identifier == "init"));
        Assert.True(bridge.Invocations.Count <= 3, $"the bridge was called {bridge.Invocations.Count} times for 200 components: {string.Join(", ", bridge.Invocations.Select(i => i.Identifier))}");
    }

    // ---- guard: a parent re-render that changes nothing must not resend the rows. ----

    [Fact]
    public void A_re_render_with_the_same_items_leaves_the_rows_attribute_alone()
    {
        var rows = Rows(200);
        var cut = Table(rows);
        var before = cut.Find("pk-table").GetAttribute("rows");

        cut.Render(p => p.Add(x => x.Columns, Columns).Add(x => x.Items, rows).Add(x => x.IdOf, IdOfRow).Add(x => x.Selectable, true));

        Assert.Equal(before, cut.Find("pk-table").GetAttribute("rows"));
    }

    // ---- benchmarks ----

    [BenchFact, Trait("Category", "Benchmark")]
    public void Bench_table_render_and_parameter_change()
    {
        var sb = new StringBuilder("\nPkTable<T> in-process (bUnit): rows | rows attribute | first render ms / KB allocated | parameter change with the SAME items ms / KB allocated\n");
        foreach (var n in new[] { 100, 1000, 5000 })
        {
            var rows = Rows(n);
            Table(rows).Dispose(); // warm up the JIT and the serializer
            GC.Collect();
            var (renderMs, renderKb, cut) = Measure(() => Table(rows));
            var attr = cut.Find("pk-table").GetAttribute("rows")!.Length;
            var (changeMs, changeKb, _) = Measure(() => { cut.Render(p => p.Add(x => x.Columns, Columns).Add(x => x.Items, rows).Add(x => x.IdOf, IdOfRow).Add(x => x.Selectable, true)); return cut; });
            sb.AppendLine($"  {n,5} rows | {attr / 1024.0,8:0.0} KB | {renderMs,7:0.0} ms / {renderKb,8:0} KB | {changeMs,7:0.0} ms / {changeKb,8:0} KB");
            cut.Dispose();
        }
        Report(sb.ToString());
    }

    [BenchFact, Trait("Category", "Benchmark")]
    public void Bench_memory_per_component()
    {
        var sb = new StringBuilder("\nMemory retained per mounted component (GC.GetTotalMemory after a full collection; bUnit renderer, one circuit's worth)\n");
        foreach (var count in new[] { 1000 })
        {
            Render<Page>(p => p.Add(x => x.Count, 10)); // warm up
            var before = Settled();
            var cut = Render<Page>(p => p.Add(x => x.Count, count));
            var after = Settled();
            sb.AppendLine($"  {count} PkButton in a page: {(after - before) / 1024.0:0} KB total, {(after - before) / (double)count:0} bytes per component");
            GC.KeepAlive(cut);
        }
        Report(sb.ToString());
    }

    private static long Settled() { for (var i = 0; i < 3; i++) { GC.Collect(); GC.WaitForPendingFinalizers(); } return GC.GetTotalMemory(true); }

    private static (double Ms, double Kb, T Result) Measure<T>(Func<T> action)
    {
        var alloc = GC.GetAllocatedBytesForCurrentThread();
        var sw = Stopwatch.StartNew();
        var result = action();
        sw.Stop();
        return (sw.Elapsed.TotalMilliseconds, (GC.GetAllocatedBytesForCurrentThread() - alloc) / 1024.0, result);
    }

    private void Report(string text)
    {
        _out.WriteLine(text);
        if (Environment.GetEnvironmentVariable("PK_BENCH_OUT") is { Length: > 0 } file) File.AppendAllText(file, text);
    }

    /// <summary>N PkButtons: the smallest page that has many toolkit components.</summary>
    private sealed class Page : ComponentBase
    {
        [Parameter] public int Count { get; set; }

        protected override void BuildRenderTree(Microsoft.AspNetCore.Components.Rendering.RenderTreeBuilder builder)
        {
            for (var i = 0; i < Count; i++)
            {
                builder.OpenComponent<PkButton>(0);
                builder.AddAttribute(1, "ChildContent", (RenderFragment)(b => b.AddContent(0, "Button")));
                builder.CloseComponent();
            }
        }
    }
}
