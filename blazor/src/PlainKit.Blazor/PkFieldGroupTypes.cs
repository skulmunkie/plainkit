using Microsoft.AspNetCore.Components;

namespace PlainKit.Blazor;

/// <summary>What a <see cref="PkFieldSpec{TItem}"/> renders. Textarea, Select, Checkbox and Combobox pick that control; every other value is a
/// <c>PkInput</c> with that value as its <c>Type</c>.</summary>
public enum PkFieldKind
{
    /// <summary>A plain <c>PkInput</c>.</summary>
    Text,
    /// <summary><c>PkInput</c> Type="number".</summary>
    Number,
    /// <summary><c>PkInput</c> Type="email".</summary>
    Email,
    /// <summary><c>PkInput</c> Type="password".</summary>
    Password,
    /// <summary><c>PkInput</c> Type="date".</summary>
    Date,
    /// <summary><c>PkInput</c> Type="time".</summary>
    Time,
    /// <summary><c>PkInput</c> Type="url".</summary>
    Url,
    /// <summary><c>PkInput</c> Type="tel".</summary>
    Tel,
    /// <summary>A <c>PkTextarea</c>.</summary>
    Textarea,
    /// <summary>A <c>PkSelect</c>, its options from <see cref="PkFieldSpec{TItem}.Options"/>.</summary>
    Select,
    /// <summary>A <c>PkCheckbox</c>. <see cref="PkFieldSpec{TItem}.Get"/>/<see cref="PkFieldSpec{TItem}.Set"/> still deal in strings: checked is a non-empty value other than "false".</summary>
    Checkbox,
    /// <summary>A <c>PkCombobox</c>: type to find an option. Its options come from <see cref="PkFieldSpec{TItem}.Options"/>, <see cref="PkFieldSpec{TItem}.OptionsSource"/> or, as the user types, <see cref="PkFieldSpec{TItem}.Search"/>; <see cref="PkFieldSpec{TItem}.Free"/> lets the text itself be the value.</summary>
    Combobox,
}

/// <summary>One option of a <see cref="PkFieldKind.Select"/> field.</summary>
public sealed record PkFieldOption(string Value, string Label);

/// <summary>
/// One field of a <see cref="Components.PkFieldGroup{TItem}"/>: what a plain field needs to render itself and read/write one property of <typeparamref name="TItem"/> through
/// <see cref="Get"/>/<see cref="Set"/>, as strings (the shape every control's own <c>Value</c> takes; the element does its own coercion). <see cref="When"/> gates its rendering (issue 226).
/// A field whose value is computed rather than a property mirror is not spec-able here: write it by hand next to the group (issue 222).
/// </summary>
public sealed partial record PkFieldSpec<TItem>
{
    /// <summary>Identifies the field; used as the control's <c>Name</c>.</summary>
    public required string Key { get; init; }

    /// <summary>The field label.</summary>
    public required string Label { get; init; }

    /// <summary>Reads the field's current value from the model, as the string the control's own <c>Value</c> (or, for <see cref="PkFieldKind.Checkbox"/>, checked-ness) takes.</summary>
    public required Func<TItem, string?> Get { get; init; }

    /// <summary>Writes a committed value back onto the model.</summary>
    public required Action<TItem, string?> Set { get; init; }

    /// <summary>What the field renders; a plain <c>PkInput</c> (Text) unless set.</summary>
    public PkFieldKind Kind { get; init; } = PkFieldKind.Text;

    /// <summary>The options of a <see cref="PkFieldKind.Select"/> field; ignored otherwise.</summary>
    public IReadOnlyList<PkFieldOption>? Options { get; init; }

    /// <summary>Whether this field renders at all, evaluated against the current <typeparamref name="TItem"/>; unset means always. Re-run
    /// for every field (not just the one that just changed, since one field's value can gate another's visibility) after every commit
    /// and whenever the group re-renders. A hidden field's markup is not emitted at all, so a hidden <see cref="Required"/> field never
    /// blocks <c>PkForm</c> validation (issue 226's own recommendation) — there is nothing left in the DOM for the form to check.</summary>
    public Func<TItem, bool>? When { get; init; }

    /// <summary>Help text shown in a <c>PkTooltip</c> with its own info button (accessible name "Help for <see cref="Label"/>") beside the label text (<c>PkField.LabelAction</c>, so the label itself stays); for a checkbox, whose label is the field label, that is the same place. For text that belongs under the control use <see cref="Hint"/>.</summary>
    public string? Help { get; init; }

    /// <summary>The options of a <see cref="PkFieldKind.Select"/> field, read at every render; wins over <see cref="Options"/> when set. For options that load after the specs are built.</summary>
    public Func<IReadOnlyList<PkFieldOption>>? OptionsSource { get; init; }

    /// <summary>Whether the control is disabled, evaluated per render against the current <typeparamref name="TItem"/> (for example editable while the record is new, locked once it exists).</summary>
    public Func<TItem, bool>? Disabled { get; init; }

    /// <summary>Whether the control is read-only, evaluated per render: selectable and copyable but not editable. <c>PkInput</c> and <c>PkTextarea</c> only; <c>PkSelect</c> and <c>PkCheckbox</c> have no read-only state, so there it disables the control.</summary>
    public Func<TItem, bool>? ReadOnly { get; init; }

    /// <summary>The async options source of a <see cref="PkFieldKind.Combobox"/> field: called with what the user typed, it returns the options to show (like <c>PkCombobox.OnSearchInput</c>; the element then does not filter them again). A newer query supersedes an older one whose answer is still pending. Until the first answer the static <see cref="Options"/> show.</summary>
    public Func<string, Task<IReadOnlyList<PkFieldOption>>>? Search { get; init; }

    /// <summary>Help text chosen per record; used instead of <see cref="Help"/> when it returns a non-empty string, so a locked and an editable state need one spec, not two guarded by <see cref="When"/>.</summary>
    public Func<TItem, string?>? HelpWhen { get; init; }

    /// <summary>The label chosen per record (for example one that names another field's value); used instead of <see cref="Label"/> when it returns a non-empty string. Read on every render, like <see cref="HelpWhen"/>.</summary>
    public Func<TItem, string?>? LabelWhen { get; init; }

    /// <summary>Extra content in the field's <c>label-action</c> slot, beside the label text (adopt-from-source buttons, flag badges). Re-evaluated with the record on every render. It follows the <see cref="Help"/> tooltip when both are set and never replaces the label text.</summary>
    public RenderFragment<TItem>? LabelAction { get; init; }

    /// <summary>A <see cref="PkFieldKind.Checkbox"/> spec over a <see cref="bool"/> property: wraps the string <see cref="Get"/>/<see cref="Set"/> so the caller does not translate "true"/"" by hand. Set the other members with <c>with</c>: <c>PkFieldSpec&lt;T&gt;.Bool("active", "Active", o =&gt; o.Active, (o, v) =&gt; o.Active = v) with { Hint = "..." }</c>.</summary>
    public static PkFieldSpec<TItem> Bool(string key, string label, Func<TItem, bool> get, Action<TItem, bool> set) => new()
    {
        Key = key,
        Label = label,
        Kind = PkFieldKind.Checkbox,
        Get = item => get(item) ? "true" : "",
        Set = (item, value) => set(item, !string.IsNullOrEmpty(value) && value != "false"),
    };
}
