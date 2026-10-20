using Bunit;
using Microsoft.Extensions.DependencyInjection;
using PlainKit.Blazor;

namespace PlainKit.Blazor.Tests;

// @bind-Start and @bind-End on PkDateRangePicker (issue #333): both ends follow the one pk-range-change event.
public sealed class PkDateRangePickerTests : BunitContext, IAsyncLifetime
{
    Task IAsyncLifetime.InitializeAsync() => Task.CompletedTask;
    async Task IAsyncLifetime.DisposeAsync() => await DisposeAsync();

    public PkDateRangePickerTests()
    {
        JSInterop.Mode = JSRuntimeMode.Loose;
        var bridge = JSInterop.SetupModule(PkAssets.Bridge);
        bridge.Mode = JSRuntimeMode.Loose;
        Services.AddPlainKit();
    }

    [Fact]
    public async Task Both_ends_bound_with_bind_follow_pk_range_change_and_are_written_to_the_element()
    {
        DateOnly? start = null, end = null;
        var cut = Render<PkDateRangePicker>(p => p
            .Bind(x => x.Start, start, v => start = v)
            .Bind(x => x.End, end, v => end = v));

        await cut.Find("pk-date-range-picker").TriggerEventAsync("onpk-range-change", new PkRangeChangeEventArgs { Start = "2026-09-01", End = "2026-09-14", Valid = true });

        Assert.Equal(new DateOnly(2026, 9, 1), start);
        Assert.Equal(new DateOnly(2026, 9, 14), end);
        Assert.Equal("2026-09-14", cut.Find("pk-date-range-picker").GetAttribute("end"));
    }

    [Fact]
    public async Task PresetItems_go_to_the_element_as_json_and_the_matching_key_comes_back_as_Preset()
    {
        string? preset = null;
        var cut = Render<PkDateRangePicker>(p => p
            .Add(x => x.PresetItems, [new PkDatePreset("fy", "Fiscal year", new DateOnly(2026, 4, 1), new DateOnly(2027, 3, 31))])
            .Add(x => x.OnRangeChange, e => preset = e.Preset));

        var json = cut.Find("pk-date-range-picker").GetAttribute("preset-items");
        Assert.Contains("\"key\":\"fy\"", json);
        Assert.Contains("\"start\":\"2026-04-01\"", json);
        await cut.Find("pk-date-range-picker").TriggerEventAsync("onpk-range-change", new PkRangeChangeEventArgs { Start = "2026-04-01", End = "2027-03-31", Valid = true, Preset = "fy" });
        Assert.Equal("fy", preset);
    }
}
