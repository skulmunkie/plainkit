using System.Reflection;
using System.Text;
using System.Text.Json;

namespace PlainKit.Blazor;

/// <summary>One parameter, event or content slot of a component, as the mapping and the generator's manifest describe it.</summary>
/// <param name="Name">The C# name (<c>Variant</c>, <c>OnClick</c>, <c>ChildContent</c>).</param>
/// <param name="Kind"><c>parameter</c>, <c>event</c> or <c>content</c> (a <c>RenderFragment</c>).</param>
/// <param name="Type">The C# type (<c>string</c>, <c>ButtonVariant</c>, <c>EventCallback&lt;PkValueChangeEventArgs&gt;</c>).</param>
/// <param name="Default">The element's default for the property, when it has one.</param>
/// <param name="TwoWay">Whether it can be used with <c>@bind-</c>.</param>
/// <param name="Attribute">The attribute or event of the element it drives.</param>
/// <param name="NotGenerated">Why the generator does not emit it (a reason from the manifest), or null when the component has it.</param>
public sealed record PkParameterInfo(string Name, string Kind, string Type, string? Default, bool TwoWay, string? Attribute, string? NotGenerated);

/// <summary>What the Blazor side knows about one element: its component, whether it exists, its parameters and the Razor that matches a piece of markup.</summary>
/// <param name="Component">The component name (<c>PkButton</c>).</param>
/// <param name="Tag">The element (<c>pk-button</c>).</param>
/// <param name="Status"><c>generated</c>, <c>hand-written</c> or <c>not available</c> (no component in this package yet).</param>
/// <param name="Note">Why it is not available, when it is not.</param>
/// <param name="Parameters">Every parameter, event and slot the mapping lists.</param>
/// <param name="Markup">The Razor equivalent of the element (its attributes and text), or a bare use of the component.</param>
public sealed record PkComponentInfo(string Component, string Tag, string Status, string? Note, IReadOnlyList<PkParameterInfo> Parameters, string Markup);

/// <summary>
/// Reads the element mappings (<c>blazor/mappings/*.json</c>) and the generator's manifest that PlainKit.Blazor carries in its assembly, and describes a
/// component from them. The SDK never holds these: the mappings are this package's, and this is the only place that reads them at run time.
/// </summary>
public static class PkMappingInfo
{
    private const string Prefix = "plainkit-mappings/";
    private static readonly Lazy<JsonDocument> Manifest = new(() => Read(Prefix + "generated.manifest.json") ?? JsonDocument.Parse("{}"));
    private static readonly HashSet<string> Plain = new(["string", "bool", "int", "long", "double", "float", "decimal", "object", "DateTime", "DateOnly", "TimeOnly"], StringComparer.Ordinal);

    private static JsonDocument? Read(string resource)
    {
        using var stream = typeof(PkMappingInfo).Assembly.GetManifestResourceStream(resource);
        return stream is null ? null : JsonDocument.Parse(stream);
    }

    /// <summary>The tags that have a mapping.</summary>
    public static IReadOnlyList<string> Tags { get; } =
        [.. typeof(PkMappingInfo).Assembly.GetManifestResourceNames().Where(n => n.StartsWith(Prefix, StringComparison.Ordinal) && n.EndsWith(".json", StringComparison.Ordinal) && !n.EndsWith("generated.manifest.json", StringComparison.Ordinal))
            .Select(n => "pk-" + n[Prefix.Length..^5]).Order()];

    /// <summary>
    /// Describes <paramref name="tag"/>, or returns null when there is no mapping for it.
    /// </summary>
    /// <param name="tag">The element, for example <c>pk-button</c>.</param>
    /// <param name="defaults">The element's property defaults by property name (from its API entry), as text.</param>
    /// <param name="attributes">The attributes of an element to translate into Razor. Null or empty gives the bare component.</param>
    /// <param name="text">The element's text, used as the component's content when it has a default slot.</param>
    public static PkComponentInfo? Describe(string tag, IReadOnlyDictionary<string, string?>? defaults = null, IReadOnlyDictionary<string, string>? attributes = null, string? text = null)
    {
        using var mapping = Read(Prefix + tag[3..] + ".json");
        if (mapping is null || !tag.StartsWith("pk-", StringComparison.Ordinal)) return null;
        var root = mapping.RootElement;
        var component = root.GetProperty("component").GetString()!;
        var manifest = Manifest.Value.RootElement;

        var skipped = Find(manifest, "skipped", e => Str(e, "component") == component);
        string status, note;
        if (skipped is { } sk)
        {
            var hand = sk.TryGetProperty("handWritten", out var hw) && hw.ValueKind == JsonValueKind.True;
            (status, note) = hand ? ("hand-written", "") : ("not available", Str(sk, "reason") ?? "");
        }
        else (status, note) = Has(manifest, "generated", component) ? ("generated", "") : ("not available", "The generator did not produce it.");

        var model = root.TryGetProperty("model", out var m) ? m : (JsonElement?)null;
        var parameters = new List<PkParameterInfo>();
        foreach (var p in root.GetProperty("params").EnumerateArray())
        {
            var name = Str(p, "name")!;
            var type = (Str(p, "type") ?? "string").TrimEnd('?');
            // An untyped mapping takes its type from the element prop; the component is the truth, and a JSON prop is generated as object.
            if (Str(p, "type") is null && typeof(PkMappingInfo).Assembly.GetType($"PlainKit.Blazor.{component}")?.GetProperty(name)?.PropertyType == typeof(object)) type = "object";
            var prop = Str(p, "prop");
            var reason = Find(manifest, "notGenerated", e => Str(e, "component") == component && Str(e, "param") == name) is { } ng ? Str(ng, "reason") : null;
            // A type the repository does not define yet (issue #9) is generated as object.
            if (Find(manifest, "typesToDefine", e => Str(e, "component") == component && Str(e, "param") == name) is not null) type = "object";
            if (Str(p, "event") is { } ev)
                parameters.Add(new(name, "event", EventType(ev, type), null, false, ev, reason));
            else if (p.TryGetProperty("slot", out var slot) && slot.ValueKind == JsonValueKind.String)
                parameters.Add(new(name, "content", "RenderFragment", null, false, slot.GetString() is { Length: > 0 } sl ? $"slot=\"{sl}\"" : "default slot", reason));
            else if (prop is not null)
            {
                // Two-way: the component's one model (its value prop and change event), or a parameter that names its own event to bind to.
                // "bind" is one event or a list of them (PkCommandPalette.Open: pk-open and pk-close); the list is shown by its first.
                var changeEvent = p.TryGetProperty("bind", out var twoWay) && twoWay.ValueKind == JsonValueKind.Object ? Str(twoWay, "event")
                    : twoWay.ValueKind == JsonValueKind.Array && twoWay.GetArrayLength() > 0 ? Str(twoWay[0], "event")
                    : model is { } mo && Str(mo, "prop") == prop ? Str(mo, "event") : null;
                var def = p.TryGetProperty("default", out var dv) ? (dv.ValueKind == JsonValueKind.String ? dv.GetString() : dv.GetRawText()) : defaults is not null && defaults.TryGetValue(prop, out var d) ? d : null;
                parameters.Add(new(name, "parameter", type, def, changeEvent is not null, Kebab(prop), reason));
                if (changeEvent is not null) parameters.Add(new(name + "Changed", "event", $"EventCallback<{type}>", null, false, changeEvent, reason));
            }
            else parameters.Add(new(name, "parameter", type, null, false, null, reason));
        }

        return new(component, tag, status, note.Length > 0 ? note : null, parameters, Markup(component, tag, root, manifest, parameters, attributes, text));
    }

    // The detail of an event decides its callback: none means a plain EventCallback, "click" is the browser's MouseEventArgs, otherwise the generated Pk...EventArgs.
    private static string EventType(string ev, string mappingType) =>
        ev == "click" ? "EventCallback<MouseEventArgs>" :
        mappingType.StartsWith('{') ? $"EventCallback<{Pascal(ev)}EventArgs>" : "EventCallback";

    private static string Markup(string component, string tag, JsonElement mapping, JsonElement manifest, List<PkParameterInfo> parameters, IReadOnlyDictionary<string, string>? attributes, string? text)
    {
        var hasContent = parameters.Any(p => p.Kind == "content" && p.Attribute == "default slot" && p.Name == "ChildContent");
        var lines = new List<string>();
        var byAttribute = new Dictionary<string, JsonElement>(StringComparer.OrdinalIgnoreCase);
        foreach (var p in mapping.GetProperty("params").EnumerateArray())
            if (Str(p, "prop") is { } prop && Str(p, "event") is null && !(p.TryGetProperty("slot", out _))) byAttribute[Kebab(prop)] = p;
        var bound = parameters.Where(p => p.TwoWay).Select(p => p.Name).ToHashSet();

        foreach (var (attribute, value) in attributes ?? new Dictionary<string, string>())
        {
            if (!byAttribute.TryGetValue(attribute, out var p)) continue;
            var name = Str(p, "name")!;
            if (parameters.FirstOrDefault(x => x.Name == name)?.NotGenerated is not null) continue;
            var type = (Str(p, "type") ?? "string").TrimEnd('?');
            if (bound.Contains(name)) lines.Add($"@bind-{name}=\"{Local(name)}\"");
            else if (type == "bool") { if (value != "false") lines.Add(name); }
            else if (!Plain.Contains(type) && EnumMember(p, manifest, type, value) is { } member) lines.Add($"{name}=\"{type}.{member}\"");
            else lines.Add($"{name}=\"{Escape(value)}\"");
        }

        var content = hasContent && !string.IsNullOrWhiteSpace(text) ? Escape(text.Trim()) : null;
        var open = new StringBuilder("<" + component);
        if (lines.Count <= 3) foreach (var l in lines) open.Append(' ').Append(l);
        else foreach (var l in lines) open.Append("\n    ").Append(l);
        if (content is not null) return $"{open}>{content}</{component}>";
        return hasContent && lines.Count == 0 ? $"<{component}>...</{component}>" : open + (lines.Count > 3 ? "\n" : " ") + "/>";
    }

    // A member is a mapping entry (enum: { Member: "value" }) or one of the generated enum's members whose name matches the value ignoring case and punctuation.
    private static string? EnumMember(JsonElement param, JsonElement manifest, string type, string value)
    {
        static string Key(string s) => new([.. s.Where(char.IsLetterOrDigit).Select(char.ToLowerInvariant)]);
        if (param.TryGetProperty("enum", out var map) && map.ValueKind == JsonValueKind.Object)
            foreach (var kv in map.EnumerateObject()) if (Key(kv.Value.GetString() ?? "") == Key(value)) return kv.Name;
        if (Find(manifest, "enums", e => Str(e, "name") == type) is { } en && en.TryGetProperty("members", out var members))
            foreach (var member in members.EnumerateArray()) if (Key(member.GetString() ?? "") == Key(value)) return member.GetString();
        return null;
    }

    private static string Local(string name) => "_" + char.ToLowerInvariant(name[0]) + name[1..];

    private static string Escape(string s) => s.Replace("@", "@@").Replace("\"", "&quot;").Replace("<", "&lt;");

    private static string? Str(JsonElement e, string name) => e.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;

    private static JsonElement? Find(JsonElement manifest, string list, Func<JsonElement, bool> match)
    {
        if (!manifest.TryGetProperty(list, out var items) || items.ValueKind != JsonValueKind.Array) return null;
        foreach (var item in items.EnumerateArray()) if (item.ValueKind == JsonValueKind.Object && match(item)) return item;
        return null;
    }

    private static bool Has(JsonElement manifest, string list, string name) =>
        manifest.TryGetProperty(list, out var items) && items.EnumerateArray().Any(i => i.ValueKind == JsonValueKind.String && i.GetString() == name);

    // busyText -> busy-text
    internal static string Kebab(string camel) => string.Concat(camel.Select((c, i) => char.IsUpper(c) ? (i > 0 ? "-" : "") + char.ToLowerInvariant(c) : c.ToString()));

    // pk-value-change -> PkValueChange
    internal static string Pascal(string dashed) => string.Concat(dashed.Split('-', StringSplitOptions.RemoveEmptyEntries).Select(p => char.ToUpperInvariant(p[0]) + p[1..]));
}
