namespace PlainKit.Blazor;

/// <summary>What a <see cref="PkFieldSpec{TItem}"/> renders. Textarea, Select and Checkbox pick that control; every other value is a
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
}

/// <summary>One option of a <see cref="PkFieldKind.Select"/> field.</summary>
public sealed record PkFieldOption(string Value, string Label);

/// <summary>
/// One field of a <see cref="PkFieldGroup{TItem}"/>: everything a plain field needs to render itself and read/write one property of
/// <typeparamref name="TItem"/> through <see cref="Get"/>/<see cref="Set"/> — the string form of the value, the same shape every
/// control's own <c>Value</c> parameter already takes (<c>PkInput.Min</c>/<c>Max</c>/<c>Step</c>/<c>MaxLength</c> are strings for the
/// same reason: the element does its own coercion). A field can gate its own rendering with <see cref="When"/> (issue 226); a field
/// whose value is computed rather than a plain property mirror is still not spec-able here — write it by hand next to the group, the
/// same way issue 222 scoped it.
/// </summary>
public sealed record PkFieldSpec<TItem>
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

    /// <summary>Shown under the control (<c>PkField.Hint</c>).</summary>
    public string? Hint { get; init; }

    /// <summary>The field must have a value.</summary>
    public bool Required { get; init; }

    /// <summary><c>PkInput.Min</c>.</summary>
    public string? Min { get; init; }

    /// <summary><c>PkInput.Max</c>.</summary>
    public string? Max { get; init; }

    /// <summary><c>PkInput.Step</c>.</summary>
    public string? Step { get; init; }

    /// <summary><c>PkInput.MaxLength</c> or <c>PkTextarea.MaxLength</c>.</summary>
    public string? MaxLength { get; init; }

    /// <summary><c>PkInput.Pattern</c>.</summary>
    public string? Pattern { get; init; }

    /// <summary>The options of a <see cref="PkFieldKind.Select"/> field; ignored otherwise.</summary>
    public IReadOnlyList<PkFieldOption>? Options { get; init; }

    /// <summary>Whether this field renders at all, evaluated against the current <typeparamref name="TItem"/>; unset means always. Re-run
    /// for every field (not just the one that just changed, since one field's value can gate another's visibility) after every commit
    /// and whenever the group re-renders. A hidden field's markup is not emitted at all, so a hidden <see cref="Required"/> field never
    /// blocks <c>PkForm</c> validation (issue 226's own recommendation) — there is nothing left in the DOM for the form to check.</summary>
    public Func<TItem, bool>? When { get; init; }

    /// <summary><c>PkInput.Placeholder</c> or <c>PkTextarea.Placeholder</c>.</summary>
    public string? Placeholder { get; init; }

    /// <summary><c>PkTextarea.Rows</c>; <see cref="PkFieldKind.Textarea"/> only, the control's own default (3) when unset.</summary>
    public int? Rows { get; init; }

    /// <summary>Help text shown in a <c>PkTooltip</c> with its own info button (accessible name "Help for <see cref="Label"/>") in the field's label slot (<c>PkField.LabelExtra</c>); for a checkbox, whose label is the field label, that is the same place. For text that belongs under the control use <see cref="Hint"/>.</summary>
    public string? Help { get; init; }

    /// <summary>The options of a <see cref="PkFieldKind.Select"/> field, read at every render; wins over <see cref="Options"/> when set. For options that load after the specs are built.</summary>
    public Func<IReadOnlyList<PkFieldOption>>? OptionsSource { get; init; }

    /// <summary>Whether the control is disabled, evaluated per render against the current <typeparamref name="TItem"/> (for example editable while the record is new, locked once it exists).</summary>
    public Func<TItem, bool>? Disabled { get; init; }

    /// <summary>Whether the control is read-only, evaluated per render: selectable and copyable but not editable. <c>PkInput</c> and <c>PkTextarea</c> only; <c>PkSelect</c> and <c>PkCheckbox</c> have no read-only state, so there it disables the control.</summary>
    public Func<TItem, bool>? ReadOnly { get; init; }

    /// <summary>The field takes every column of the <c>pk-form-section</c> grid it sits in (the <c>form-span</c> class on its <c>pk-field</c>).</summary>
    public bool Span { get; init; }

    /// <summary>Hides the label visually (a single-field card whose heading already says it) but keeps it as the control's accessible name.</summary>
    public bool HideLabel { get; init; }

    /// <summary>Help text chosen per record; used instead of <see cref="Help"/> when it returns a non-empty string, so a locked and an editable state need one spec, not two guarded by <see cref="When"/>.</summary>
    public Func<TItem, string?>? HelpWhen { get; init; }

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
