using System.Reflection;

namespace PlainKit.Blazor;

/// <summary>Marks a component whose element lives in an optional package (<see cref="PkExtra"/>); written by the generator from packages.json.</summary>
[AttributeUsage(AttributeTargets.Class)]
public sealed class PkRequiresExtraAttribute(PkExtra extra) : Attribute
{
    /// <summary>The extra the component needs.</summary>
    public PkExtra Extra { get; } = extra;
}

/// <summary>
/// The optional parts a project chose: <c>&lt;PlainKitExtras&gt;canvas;dock&lt;/PlainKitExtras&gt;</c> in the project file or <c>o.Extras.Add(...)</c>.
/// Nothing chosen, or <c>full</c> / <see cref="AddAll"/>, means everything (the default, permanently); <c>core</c> in the project file means no extra.
/// </summary>
public sealed class PkExtraSet
{
    private readonly HashSet<PkExtra> _set = [];
    private bool _chosen;

    /// <summary>Chooses these extras.</summary>
    public PkExtraSet Add(params PkExtra[] extras) { _chosen = true; _set.UnionWith(extras); return this; }

    /// <summary>Chooses every extra (the same as choosing none).</summary>
    public PkExtraSet AddAll() => Add(Enum.GetValues<PkExtra>());

    /// <summary>Whether a component that needs <paramref name="extra"/> is allowed.</summary>
    public bool Has(PkExtra extra) => !_chosen || _set.Contains(extra);

    /// <summary>The chosen names (lower case) for the bridge, or null when everything is allowed.</summary>
    internal string[]? Names => !_chosen || _set.Count == Enum.GetValues<PkExtra>().Length ? null : [.. _set.Select(e => e.ToString().ToLowerInvariant()).Order()];

    /// <summary>Reads the project file's list, which the build wrote into the app's assembly (null: nothing declared).</summary>
    internal static string? FromAssembly(Assembly? app) => app?.GetCustomAttributes<AssemblyMetadataAttribute>().FirstOrDefault(a => a.Key == "PlainKitExtras")?.Value;

    /// <summary>The project file's list wins; the code may only name extras it also names.</summary>
    internal void Reconcile(string? project)
    {
        if (string.IsNullOrWhiteSpace(project)) return;
        var names = project.Split([';', ',', ' '], StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).Where(n => !n.Equals("core", StringComparison.OrdinalIgnoreCase)).ToArray();
        PkExtra[] declared = names.Any(n => n.Equals("full", StringComparison.OrdinalIgnoreCase)) ? Enum.GetValues<PkExtra>() : [.. names.Select(n => Enum.TryParse<PkExtra>(n, true, out var e) ? e : throw new InvalidOperationException($"PlainKitExtras names '{n}', which is not an extra; use one of {string.Join(", ", Enum.GetNames<PkExtra>().Select(x => x.ToLowerInvariant()))} or full."))];
        if (_chosen && _set.Except(declared).Cast<PkExtra?>().FirstOrDefault() is { } extra)
            throw new InvalidOperationException($"o.Extras names '{extra.ToString().ToLowerInvariant()}' but <PlainKitExtras> in the project file does not: add it there (the project file decides which assets the app serves).");
        _chosen = true; _set.Clear(); _set.UnionWith(declared);
    }
}
