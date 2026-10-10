using System.Text.Json;
using PlainKit.Blazor.Testing;

namespace PlainKit.Blazor.Components
{
    // The seams the test helpers in PlainKit.Blazor.Testing use: what the element would be sent, and the pk-field-change it would raise.
    public partial class PkFieldGroup<TItem>
    {
        internal IReadOnlyList<PkFieldState> FieldsForTest()
        {
            var values = Visible().ToDictionary(f => f.Key, f => f.Get(Model));
            return Defs().Select(d => new PkFieldState(d.Key!, d.Label, d.Readonly, d.Disabled, d.Required, values.GetValueOrDefault(d.Key!))).ToList();
        }

        internal Task CommitForTestAsync(string key, object? value) =>
            Changed(new PkFieldChangeEventArgs { Key = key, Value = JsonSerializer.SerializeToElement(value) });
    }

    public partial class PkDataTable<TItem>
    {
        internal Task AddForTestAsync() => string.IsNullOrEmpty(AddLabel) ? Task.CompletedTask : OnAdd.InvokeAsync();
    }
}

namespace PlainKit.Blazor.Testing
{
    /// <summary>One field a <see cref="Components.PkFieldGroup{TItem}"/> shows: its key and label, the flags it is sent with and its current value as text (a checkbox is "true" or empty).</summary>
    public sealed record PkFieldState(string Key, string? Label, bool ReadOnly, bool Disabled, bool Required, string? Value);

    /// <summary>
    /// Component tests for pages that use <see cref="Components.PkFieldGroup{TItem}"/>, <see cref="Components.PkPageHeader"/> crumbs and the add action of
    /// <see cref="Components.PkDataTable{TItem}"/>. Under bUnit the element draws none of this, so these helpers read what it would be sent and raise the events it would raise.
    /// </summary>
    public static class PkFieldGroupTesting
    {
        /// <summary>The fields the group shows now (a field whose <c>When</c> is false is absent), in order, with their read-only, disabled and required flags and current value.</summary>
        public static IReadOnlyList<PkFieldState> Fields<TItem>(this Components.PkFieldGroup<TItem> group)
        {
            ArgumentNullException.ThrowIfNull(group);
            return group.FieldsForTest();
        }

        /// <summary>The shown field with this key; throws if the group does not show it.</summary>
        public static PkFieldState Field<TItem>(this Components.PkFieldGroup<TItem> group, string key) =>
            group.Fields().FirstOrDefault(f => f.Key == key) ?? throw new InvalidOperationException($"The field group shows no field '{key}'.");

        /// <summary>Raises the element's <c>pk-field-change</c> for this key: the spec's <c>Set</c> runs, then <c>ModelChanged</c>. A checkbox takes a bool, everything else a string (or null).</summary>
        public static Task CommitAsync<TItem>(this Components.PkFieldGroup<TItem> group, string key, object? value)
        {
            ArgumentNullException.ThrowIfNull(group);
            return group.CommitForTestAsync(key, value);
        }

        /// <summary>The trail <c>Crumbs</c> sends to the element, as a typed list (empty when none is set).</summary>
        public static IReadOnlyList<PkCrumb> CrumbTrail(this Components.PkPageHeader header)
        {
            ArgumentNullException.ThrowIfNull(header);
            return header.Crumbs ?? [];
        }

        /// <summary>Raises the element's <c>pk-add</c>, so <c>OnAdd</c> runs; as in the browser, nothing happens when the table has no <c>AddLabel</c> (the element draws no button).</summary>
        public static Task AddAsync<TItem>(this Components.PkDataTable<TItem> table)
        {
            ArgumentNullException.ThrowIfNull(table);
            return table.AddForTestAsync();
        }
    }
}
