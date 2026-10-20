using System.Text.Json;
using System.Text.Json.Nodes;
using PlainKit.Blazor.Testing;

namespace PlainKit.Blazor.Pages
{
    // The seams the test helpers use for the record page: the same load, save and event paths the element reaches through JavaScript (PkPageTesting.cs has the list page's).
    public partial class PkRecordPage<TItem>
    {
        private readonly Dictionary<string, JsonElement> _testEdits = [];

        internal JsonObject SentForTest() => JsonNode.Parse(ConfigWithFields()) as JsonObject ?? new JsonObject();

        internal async Task<TItem?> LoadForTestAsync(string id)
        {
            _preview = default;
            var item = await (Load ?? throw new InvalidOperationException("The page has no Load."))(id);
            KeepLoaded(item);
            _testEdits.Clear();
            return item;
        }

        // The model the fields read: the loaded item, or a copy with the pending edits applied through each field's Set, so When, Disabled and the labels follow an edit as they do on screen.
        private TItem? _preview;

        internal IReadOnlyList<PkFieldState> FieldsForTest()
        {
            var model = _testEdits.Count > 0 && _preview is not null ? _preview : _loaded ?? Model;
            var values = model is null ? [] : PkFieldSpecs.Values(Fields ?? [], model);
            return PkFieldSpecs.Defs(Fields ?? [], model).Select(d => new PkFieldState(d.Key!, d.Label, d.Readonly, d.Disabled, d.Required,
                PkFieldSpecs.Text(_testEdits.TryGetValue(d.Key!, out var e) ? e : JsonSerializer.SerializeToElement(values.GetValueOrDefault(d.Key!))))).ToList();
        }

        internal void SetForTest(string key, object? value)
        {
            if (FieldsForTest().All(f => f.Key != key)) throw new InvalidOperationException($"The record page shows no field '{key}'.");
            _testEdits[key] = JsonSerializer.SerializeToElement(value);
            RefreshPreview();
        }

        private void RefreshPreview()
        {
            var source = _loaded ?? Model;
            if (source is null || _testEdits.Count == 0) { _preview = default; return; }
            var copy = source is ValueType ? source : (TItem)typeof(object).GetMethod("MemberwiseClone", System.Reflection.BindingFlags.Instance | System.Reflection.BindingFlags.NonPublic)!.Invoke(source, null)!;
            PkFieldSpecs.ApplyAsync(Fields ?? [], copy, _testEdits).GetAwaiter().GetResult();
            _preview = copy;
        }

        internal void CancelForTest() { _testEdits.Clear(); _preview = default; }

        internal async Task<string?> SaveForTestAsync()
        {
            if (Save is null) throw new InvalidOperationException("The page has no Save, so the element draws no Save button.");
            var fields = FieldsForTest();
            // The form's own check: a shown, enabled field marked Required must hold a value (a checkbox is exempt: unchecked is a value).
            var specs = (Fields ?? []).ToDictionary(f => f.Key);
            var missing = fields.FirstOrDefault(f => f.Required && !f.Disabled && !f.ReadOnly && specs[f.Key].Kind != PkFieldKind.Checkbox && string.IsNullOrWhiteSpace(f.Value));
            if (missing is not null) return $"{missing.Label} is required.";
            var sent = fields.ToDictionary(f => f.Key, f => JsonSerializer.SerializeToElement(f.Value));
            foreach (var (k, v) in _testEdits) sent[k] = v;
            try
            {
                var item = await ApplySavedAsync(sent);
                if (BeforeSave is not null && !await BeforeSave(item)) return null;   // BeforeSave said stop: the edits stay and Save does not run
                await Save(item);
            }
            catch (Exception ex) { return ex.Message; }   // the element keeps the edits and shows this in its notice
            _testEdits.Clear();
            _preview = default;
            await HandlePkRecordSave(EventArgs.Empty);
            return null;
        }

        internal Task DeleteForTestAsync() => OnDelete.HasDelegate && SentForTest()["id"] is { } id ? HandlePkRecordDelete(new PkRecordDeleteEventArgs { Id = id.ToString() }) : Task.CompletedTask;

        internal Task ActionForTestAsync(string key) => HandlePkAction(new PkActionEventArgs { Key = key });
    }
}
