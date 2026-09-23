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
/// same reason: the element does its own coercion). A field whose visibility depends on the current data, or whose value is computed
/// rather than a plain property mirror, is not spec-able here — write it by hand next to the group, the same way issue 222 scoped it.
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
}
