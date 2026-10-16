using System.Text.Json;
using System.Text.Json.Serialization;

namespace PlainKit.Blazor;

internal static partial class PkAttr
{
    // Dictionary keys (field keys) keep their spelling and null properties are left out.
    private static readonly JsonSerializerOptions Typed = new(JsonSerializerDefaults.Web) { DictionaryKeyPolicy = null, DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull };

    /// <summary>A JSON-valued prop (<c>jsonText</c> in a mapping): a string is the JSON text and goes as it is; a record, dictionary or <see cref="JsonElement"/> is serialised camelCase (#1417). Null when unset.</summary>
    internal static string? JsonText(object? value) => value switch { null => null, string s => s, _ => JsonSerializer.Serialize(value, Typed) };
}
