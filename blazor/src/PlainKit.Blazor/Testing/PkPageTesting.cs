using System.Text.Json;
using System.Text.Json.Nodes;
using PlainKit.Blazor.Testing;

namespace PlainKit.Blazor.Pages
{
    // The seams the test helpers use: the same load, save and event paths the element reaches through JavaScript.
    public partial class PkListPage<TItem>
    {
        private IReadOnlyList<TItem> _testRows = [];

        internal JsonObject SentForTest() => JsonNode.Parse(ConfigWithColumns()) as JsonObject ?? new JsonObject();

        internal async Task<PkListResult<TItem>> LoadForTestAsync(PkListRequest? request)
        {
            var size = SentForTest()["pageSize"]?.GetValue<int>() ?? 25;
            var result = await (Load ?? throw new InvalidOperationException("The page has no Load."))(request is null ? new PkListPageQuery(PageSize: size).ToRequest() : request);
            _testRows = result.Items;
            await ShowCellsAsync(result.Items);
            return result;
        }

        internal Task ClickRowForTestAsync(string id)
        {
            var row = IdOf is null ? default : _testRows.FirstOrDefault(r => IdOf(r) == id);
            return row is null ? Task.CompletedTask : HandlePkRowClick(new PkRowClickEventArgs { Id = id, Row = JsonSerializer.SerializeToElement(row, new JsonSerializerOptions(JsonSerializerDefaults.Web)) });
        }
    }

    public partial class PkRecordPage<TItem>
    {
        private readonly Dictionary<string, JsonElement> _testEdits = [];

        internal JsonObject SentForTest() => JsonNode.Parse(ConfigWithFields()) as JsonObject ?? new JsonObject();

        internal async Task<TItem?> LoadForTestAsync(string id)
        {
            var item = await (Load ?? throw new InvalidOperationException("The page has no Load."))(id);
            KeepLoaded(item);
            _testEdits.Clear();
            return item;
        }

        internal IReadOnlyList<PkFieldState> FieldsForTest()
        {
            var model = _loaded ?? Model;
            var values = model is null ? [] : PkFieldSpecs.Values(Fields ?? [], model);
            return PkFieldSpecs.Defs(Fields ?? [], model).Select(d => new PkFieldState(d.Key!, d.Label, d.Readonly, d.Disabled, d.Required,
                PkFieldSpecs.Text(_testEdits.TryGetValue(d.Key!, out var e) ? e : JsonSerializer.SerializeToElement(values.GetValueOrDefault(d.Key!))))).ToList();
        }

        internal void SetForTest(string key, object? value)
        {
            if (FieldsForTest().All(f => f.Key != key)) throw new InvalidOperationException($"The record page shows no field '{key}'.");
            _testEdits[key] = JsonSerializer.SerializeToElement(value);
        }

        internal void CancelForTest() => _testEdits.Clear();

        internal async Task<string?> SaveForTestAsync()
        {
            if (Save is null) throw new InvalidOperationException("The page has no Save, so the element draws no Save button.");
            var sent = FieldsForTest().ToDictionary(f => f.Key, f => JsonSerializer.SerializeToElement(f.Value));
            foreach (var (k, v) in _testEdits) sent[k] = v;
            try { await Save(await ApplySavedAsync(sent)); }
            catch (Exception ex) { return ex.Message; }   // the element keeps the edits and shows this in its notice
            _testEdits.Clear();
            await HandlePkRecordSave(EventArgs.Empty);
            return null;
        }

        internal Task DeleteForTestAsync() => OnDelete.HasDelegate && SentForTest()["id"] is { } id ? HandlePkRecordDelete(new PkRecordDeleteEventArgs { Id = id.ToString() }) : Task.CompletedTask;

        internal Task ActionForTestAsync(string key) => HandlePkAction(new PkActionEventArgs { Key = key });
    }
}

namespace PlainKit.Blazor.Testing
{
    /// <summary>A sidebar card of a record page: its heading and the keys of the fields it lists.</summary>
    public sealed record PkSidebarCard(string? Heading, IReadOnlyList<string> Fields);

    /// <summary>
    /// Component tests for pages that use <see cref="Pages.PkListPage{TItem}"/> and <see cref="Pages.PkRecordPage{TItem}"/>. The page types draw rows, fields and the
    /// toolbar inside the element, so under bUnit nothing loads and a test sees only the attributes. These helpers do what the element does: load, edit, save, cancel,
    /// delete and click, and read what the element would be sent. <c>Sent()</c> is the whole config the element receives (title, breadcrumb, actions, sidebar, sections).
    /// </summary>
    public static class PkPageTesting
    {
        /// <summary>Loads one page the way the element does (default: page 1 with the config's <c>pageSize</c>, no search) and returns the result; the rows and cell templates have rendered, so read <c>cut.Find("[slot=cell-2-name]")</c> after the await.</summary>
        public static Task<PkListResult<TItem>> LoadAsync<TItem>(this Pages.PkListPage<TItem> page, PkListRequest? request = null) => (page ?? throw new ArgumentNullException(nameof(page))).LoadForTestAsync(request);

        /// <summary>Raises the row click for the loaded row with this id (<c>IdOf</c>), so <c>OnRowClick</c> runs with <c>Id</c> and <c>Row</c>; an id that is not a loaded row does nothing.</summary>
        public static Task ClickRowAsync<TItem>(this Pages.PkListPage<TItem> page, string id) => (page ?? throw new ArgumentNullException(nameof(page))).ClickRowForTestAsync(id);

        /// <summary>The config the list page sends its element: columns (with <c>Columns</c> applied), filters, actions, title bar.</summary>
        public static JsonObject Sent<TItem>(this Pages.PkListPage<TItem> page) => (page ?? throw new ArgumentNullException(nameof(page))).SentForTest();

        /// <summary>Loads the record with this id through <c>Load</c> as the element does (null: the "not found" state) and returns it; its fields now read from it.</summary>
        public static Task<TItem?> LoadAsync<TItem>(this Pages.PkRecordPage<TItem> page, string id) => (page ?? throw new ArgumentNullException(nameof(page))).LoadForTestAsync(id);

        /// <summary>The fields the page shows now (a field whose <c>When</c> is false is absent), with flags and the current value, including edits made with <see cref="SetField{TItem}"/>.</summary>
        public static IReadOnlyList<PkFieldState> Fields<TItem>(this Pages.PkRecordPage<TItem> page) => (page ?? throw new ArgumentNullException(nameof(page))).FieldsForTest();

        /// <summary>The shown field with this key; throws if the page shows none.</summary>
        public static PkFieldState Field<TItem>(this Pages.PkRecordPage<TItem> page, string key) =>
            page.Fields().FirstOrDefault(f => f.Key == key) ?? throw new InvalidOperationException($"The record page shows no field '{key}'.");

        /// <summary>Edits a field as a user would in edit mode (a bool for a checkbox, a string otherwise). Nothing reaches the item until <see cref="SaveAsync{TItem}"/>.</summary>
        public static void SetField<TItem>(this Pages.PkRecordPage<TItem> page, string key, object? value) => (page ?? throw new ArgumentNullException(nameof(page))).SetForTest(key, value);

        /// <summary>Presses Save: applies the edits through each field's <c>Set</c>, runs <c>Save</c>, then <c>OnSave</c>. Returns the message the element would show in its notice when <c>Save</c> throws (the edits stay), else null.</summary>
        public static Task<string?> SaveAsync<TItem>(this Pages.PkRecordPage<TItem> page) => (page ?? throw new ArgumentNullException(nameof(page))).SaveForTestAsync();

        /// <summary>Presses Cancel: the edits are discarded and the fields read from the record again.</summary>
        public static void Cancel<TItem>(this Pages.PkRecordPage<TItem> page) => (page ?? throw new ArgumentNullException(nameof(page))).CancelForTest();

        /// <summary>Presses Delete, so <c>OnDelete</c> runs with the config's id; nothing happens without an <c>OnDelete</c> handler or an id, as the element shows no button.</summary>
        public static Task DeleteAsync<TItem>(this Pages.PkRecordPage<TItem> page) => (page ?? throw new ArgumentNullException(nameof(page))).DeleteForTestAsync();

        /// <summary>Raises the title-bar action with this key (one without an <c>href</c>), so <c>OnAction</c> runs.</summary>
        public static Task ActionAsync<TItem>(this Pages.PkRecordPage<TItem> page, string key) => (page ?? throw new ArgumentNullException(nameof(page))).ActionForTestAsync(key);

        /// <summary>The config the record page sends its element: title, heading, breadcrumb, actions, sidebar and fields.</summary>
        public static JsonObject Sent<TItem>(this Pages.PkRecordPage<TItem> page) => (page ?? throw new ArgumentNullException(nameof(page))).SentForTest();

        /// <summary>The page heading (<c>title</c> of the config), or null.</summary>
        public static string? Title<TItem>(this Pages.PkRecordPage<TItem> page) => page.Sent()["title"]?.GetValue<string>();

        /// <summary>The sidebar cards, in order.</summary>
        public static IReadOnlyList<PkSidebarCard> Sidebar<TItem>(this Pages.PkRecordPage<TItem> page) =>
            (page.Sent()["sidebar"] as JsonArray ?? []).OfType<JsonObject>()
                .Select(c => new PkSidebarCard(c["heading"]?.GetValue<string>(), (c["fields"] as JsonArray ?? []).Select(f => f!.GetValue<string>()).ToList())).ToList();
    }
}
