namespace PlainKit.Blazor;

/// <summary>One tab of <see cref="PkRecordForm.TabItems"/>. Sections tag themselves with <c>tab="Value"</c>.</summary>
/// <param name="Value">The key a section's tab attribute names and the address bar keeps.</param>
/// <param name="Label">The tab's text.</param>
/// <param name="Count">A badge after the label (a count); null shows none.</param>
/// <param name="Visible">False leaves the tab out (a permission, an empty list).</param>
public sealed record PkRecordTab(string Value, string Label, string? Count = null, bool Visible = true);
