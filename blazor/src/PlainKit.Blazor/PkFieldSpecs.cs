using System.Text.Json;
using System.Text.Json.Nodes;

namespace PlainKit.Blazor;

/// <summary>What <c>PkFieldGroup&lt;TItem&gt;</c> and <c>PkRecordPage&lt;TItem&gt;</c> share: typed <see cref="PkFieldSpec{TItem}"/> items become the element's field defs and values, and a committed value goes back through <c>Set</c>.</summary>
internal static class PkFieldSpecs
{
    public static IEnumerable<PkFieldSpec<T>> Visible<T>(IEnumerable<PkFieldSpec<T>> fields, T model) => fields.Where(f => f.When is null || f.When(model));

    /// <summary>The element's fields. The per-record members (<c>When</c>, <c>Disabled</c>, <c>LabelWhen</c>...) read <paramref name="model"/>; with no model yet (a record still loading) they are left out.</summary>
    public static IReadOnlyList<PkFieldDef> Defs<T>(IEnumerable<PkFieldSpec<T>> fields, T? model)
    {
        var has = model is not null;
        return (has ? Visible(fields, model!) : fields).Select(f =>
        {
            // PkSelect and PkCheckbox have no read-only state, so there it disables the control.
            var text = f.Kind is not (PkFieldKind.Select or PkFieldKind.Checkbox or PkFieldKind.Combobox);
            var readOnly = has && (f.ReadOnly?.Invoke(model!) ?? false);
            string? Pick(Func<T, string?>? when, string? fallback) => has && when?.Invoke(model!) is { Length: > 0 } s ? s : fallback;
            return PkFieldGroupMembers.Pass(f) with
            {
                Label = Pick(f.LabelWhen, f.Label)!, Kind = f.Editor is not null ? "custom" : f.Kind.ToString().ToLowerInvariant(), Help = Pick(f.HelpWhen, f.Help),
                Disabled = (has && (f.Disabled?.Invoke(model!) ?? false)) || (readOnly && !text), Readonly = readOnly && text, Options = f.OptionsSource?.Invoke() ?? f.Options,
            };
        }).ToList();
    }

    /// <summary>The values keyed as the specs spell them: a checkbox is a boolean, everything else the string <c>Get</c> returns.</summary>
    public static Dictionary<string, object?> Values<T>(IEnumerable<PkFieldSpec<T>> fields, T model) => Visible(fields, model).ToDictionary(f => f.Key,
        f => f.Kind == PkFieldKind.Checkbox ? !string.IsNullOrEmpty(f.Get(model)) && f.Get(model) != "false" : (object?)f.Get(model));

    public static string? Text(JsonElement? e) => e?.ValueKind switch { JsonValueKind.True => "true", JsonValueKind.False => "", JsonValueKind.Null or JsonValueKind.Undefined => null, JsonValueKind.String => e?.GetString(), _ => e?.GetRawText() };

    /// <summary>The page's config with the specs as its <c>fields</c>; a new record (no <c>id</c>) also starts from the model's values. <paramref name="isNew"/> says which.</summary>
    public static string RecordConfig<T>(string? config, IReadOnlyList<PkFieldSpec<T>>? fields, T? model, out bool isNew)
    {
        var node = JsonNode.Parse(config ?? "{}") as JsonObject ?? new JsonObject();
        isNew = node["id"] is null;
        node["fields"] = JsonNode.Parse(PkAttr.Json(Defs(fields ?? [], model))!);
        if (isNew && model is not null) node["values"] = JsonSerializer.SerializeToNode(Values(fields ?? [], model));
        return node.ToJsonString();
    }

    /// <summary>Writes the element's saved values onto the model through each spec's <c>SetAsync</c> or <c>Set</c> (a field the element did not send is left alone).</summary>
    public static async Task ApplyAsync<T>(IEnumerable<PkFieldSpec<T>> fields, T model, IReadOnlyDictionary<string, JsonElement> values)
    {
        foreach (var f in fields)
        {
            if (!values.TryGetValue(f.Key, out var v)) continue;
            if (f.SetAsync is not null) await f.SetAsync(model, Text(v));
            else f.Set(model, Text(v));
        }
    }
}
