using System.Globalization;
using System.Text.Json;
using Microsoft.AspNetCore.Components;

namespace PlainKit.Blazor;

/// <summary>
/// The base of the generated element components (<c>Generated/</c>). It makes sure the toolkit's JavaScript is loaded once the first
/// component is on the page, through <see cref="PkRuntime"/>.
/// </summary>
public abstract class PkElementBase : ComponentBase
{
    [Inject] private PkRuntime Runtime { get; set; } = default!;

    private Dictionary<string, object>? _handlers;

    /// <summary>The element this component renders, once it has rendered (for example to give <see cref="PkRuntime.ReadFormValuesAsync"/> a <see cref="PkForm"/>).</summary>
    public ElementReference Element { get; protected set; }

    /// <summary>
    /// Attributes that match no parameter (<c>id</c>, <c>data-*</c>, <c>aria-*</c>, <c>class</c>, ...). They are put on the element; a <c>class</c>
    /// is added to the component's own classes.
    /// </summary>
    [Parameter(CaptureUnmatchedValues = true)] public Dictionary<string, object>? AdditionalAttributes { get; set; }

    /// <summary>
    /// What the element is splatted with after its generated attributes: the <c>pk-*</c> event handlers (built once per component) and the
    /// <see cref="AdditionalAttributes"/> (without <c>class</c>, see <see cref="Css"/>).
    /// </summary>
    protected Dictionary<string, object> Splat { get; private set; } = new();

    /// <summary>Adds the component's <c>pk-*</c> event handlers. Called once, the first time the parameters are set.</summary>
    protected virtual void AddEventHandlers(Dictionary<string, object> handlers) { }

    /// <summary>The <c>class</c> attribute: the component's own classes, then the caller's <c>class</c>. Null when there is none.</summary>
    protected string? Css(string? own = null) => PkAttr.Class(own, AdditionalAttributes);

    /// <inheritdoc />
    protected override void OnParametersSet()
    {
        if (_handlers is null)
        {
            _handlers = new Dictionary<string, object>();
            AddEventHandlers(_handlers);
        }
        // No caller attributes: the cached dictionary is used as it is, nothing is allocated for a parameter change.
        Splat = AdditionalAttributes is { Count: > 0 } ? PkAttr.Merge(_handlers, AdditionalAttributes) : _handlers;
    }

    /// <inheritdoc />
    protected override async Task OnAfterRenderAsync(bool firstRender)
    {
        if (firstRender) await Runtime.EnsureInitializedAsync(Assets);
    }
}

/// <summary>Attribute values the generated components send to an element: invariant text for numbers and dates, JSON for structures.</summary>
internal static class PkAttr
{
    private static readonly JsonSerializerOptions Web = new(JsonSerializerDefaults.Web);

    /// <summary>The event handlers plus the caller's attributes; <c>class</c> is left out (it is merged by <see cref="PkAttr.Class"/>). A caller's attribute wins over a handler of the same name.</summary>
    internal static Dictionary<string, object> Merge(Dictionary<string, object> handlers, Dictionary<string, object> attributes)
    {
        var merged = new Dictionary<string, object>(handlers);
        foreach (var (name, value) in attributes)
        {
            if (string.Equals(name, "class", StringComparison.OrdinalIgnoreCase)) continue;
            // An inline event handler (onclick="...") is script text in an attribute: Razor would emit it as it is, and a page without a strict CSP would run it. A
            // handler the component is given as a delegate or EventCallback is not text and passes.
            if (value is string && name.Length > 2 && name.StartsWith("on", StringComparison.OrdinalIgnoreCase)) continue;
            merged[name] = value;
        }
        return merged;
    }

    /// <summary>The component's own classes followed by the caller's <c>class</c> attribute; null when both are empty.</summary>
    internal static string? Class(string? own, Dictionary<string, object>? attributes)
    {
        string? extra = null;
        if (attributes is not null)
            foreach (var (name, value) in attributes)
                if (string.Equals(name, "class", StringComparison.OrdinalIgnoreCase)) extra = Convert.ToString(value, CultureInfo.InvariantCulture);
        var joined = string.Join(' ', new[] { own, extra }.Where(s => !string.IsNullOrWhiteSpace(s)).Select(s => s!.Trim()));
        return joined.Length == 0 ? null : joined;
    }

    /// <summary>A number in invariant culture, or null when unset (the attribute is left off).</summary>
    internal static string? Num(IFormattable? value) => value?.ToString(null, CultureInfo.InvariantCulture);

    /// <summary>A date as <c>yyyy-MM-dd</c>, or null when unset.</summary>
    internal static string? Date(DateOnly? value) => value?.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);

    /// <summary>The date in an ISO string, or null when it is empty or not a date.</summary>
    internal static DateOnly? ParseDate(string? value) =>
        DateOnly.TryParseExact(value, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var d) ? d : null;

    /// <summary>The value as a JSON attribute (camelCase), or null when unset.</summary>
    internal static string? Json(object? value) => value is null ? null : JsonSerializer.Serialize(value, Web);

    // Like Json, but the keys of a dictionary keep their spelling (the default Web options camelCase them): for data keyed by a column key (filters).
    private static readonly JsonSerializerOptions Verbatim = new(JsonSerializerDefaults.Web) { DictionaryKeyPolicy = null };

    /// <summary>JSON for a value whose dictionary keys are names the host chose (for example column keys) and must reach the element unchanged.</summary>
    internal static string? JsonVerbatimKeys(object? value) => value is null ? null : JsonSerializer.Serialize(value, Verbatim);
}
