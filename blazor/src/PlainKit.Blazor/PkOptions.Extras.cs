namespace PlainKit.Blazor;

public sealed partial class PkOptions
{
    /// <summary>The optional parts of Plainkit this app uses (<see cref="PkExtra"/>); the project file's <c>&lt;PlainKitExtras&gt;</c> must agree. None chosen means all.</summary>
    public PkExtraSet Extras { get; } = new();
}
