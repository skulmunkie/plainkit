namespace PlainKit.Blazor;

/// <summary>A named quick range of a <c>PkDateRangePicker</c>'s <c>PresetItems</c>: your own period vocabulary beside the built-in <c>Presets</c> tokens. The picker reports the matching <see cref="Key"/> as <c>Preset</c> in <c>OnRangeChange</c>, so a named period can be stored and re-resolved against a later date.</summary>
public sealed record PkDatePreset(string Key, string Label, DateOnly Start, DateOnly End);
