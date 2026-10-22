namespace PlainKit.Blazor;

/// <summary>An icon button inside a field's control (<c>PkFieldSpec.SuffixAction</c>): <see cref="Icon"/> is an icon name, <see cref="Label"/> its accessible name and <see cref="Key"/> what <c>OnFieldAction</c> reports when it is pressed.</summary>
public sealed record PkFieldAction(string Icon, string Label, string Key);
