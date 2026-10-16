namespace PlainKit.AppSample.Modules;

/// <summary>A refusal written for the person using the sample: its message reaches the page (the lab cases for #1412).</summary>
public sealed class SampleUserFacingException(string message) : Exception(message), PlainKit.Blazor.IPkUserFacingException;
