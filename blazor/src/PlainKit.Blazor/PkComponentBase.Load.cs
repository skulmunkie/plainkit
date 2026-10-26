using Microsoft.AspNetCore.Components;
using Microsoft.Extensions.DependencyInjection;

namespace PlainKit.Blazor;

public abstract partial class PkComponentBase
{
    private IReadOnlyDictionary<string, object?>? _parameters;

    /// <summary>The parameters whose change means another record and starts a load, as on <see cref="PageBase"/>; null (default) means any parameter, empty means load once. A display parameter left out (a label, a callback) no longer reloads.</summary>
    protected virtual IReadOnlyCollection<string>? ReloadParameters => null;

    /// <summary>The scope a failed load is logged under: the SDK scope on the JavaScript side and the <c>PlainKit.&lt;scope&gt;</c> ILogger category. Defaults to the component's own type name.</summary>
    protected virtual string LogScope => GetType().Name;

    /// <inheritdoc />
    public override async Task SetParametersAsync(ParameterView parameters)
    {
        var keys = ReloadParameters;
        var next = parameters.ToDictionary().Where(p => keys is null || keys.Contains(p.Key)).ToDictionary(p => p.Key, p => p.Value);
        var reload = _parameters is null || (ReloadOnParameters && (next.Count != _parameters.Count || next.Any(p => !_parameters.TryGetValue(p.Key, out var old) || !Equals(old, p.Value))));
        _parameters = next;
        if (reload) _life.Expect();
        await base.SetParametersAsync(parameters);
        if (!reload || (AssignedRenderMode is not null && !RendererInfo.IsInteractive)) return; // not while prerendering (#1812)
        var load = _life.LoadAsync<object?>(async c => { await OnLoadAsync(c); return null; }, null, LogLoadFailureAsync);
        if (!load.IsCompleted) _ = load.ContinueWith(_ => InvokeStateChanged(), TaskScheduler.Default);
    }

    // The failure stays in LoadError; it is also written to IPkLog like PageBase does (resolved on use: a component test that registers no log still works).
    private async Task LogLoadFailureAsync(Exception e) { if (TickServices.GetService<IPkLog>() is { } log) await log.WriteAsync(PkLogLevel.Error, LogScope, e.Message, e.ToString()); }
}
