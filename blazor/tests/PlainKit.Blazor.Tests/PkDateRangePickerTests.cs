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
}
