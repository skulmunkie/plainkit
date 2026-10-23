using System.Collections.Immutable;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.Diagnostics;

namespace PlainKit.Blazor.Analyzers;

/// <summary>
/// PKB001: a type marked <c>[PkRequiresExtra(PkExtra.X)]</c> is used in a project that chose its extras (<c>&lt;PlainKitExtras&gt;</c>) without X. Razor markup is compiled to C#
/// before analyzers run, so <c>&lt;PkDock&gt;</c> is found the same way as <c>new PkDock()</c>. Nothing declared, or <c>full</c>, reports nothing.
/// A warning, an error when the project sets <c>PlainKitStrictExtras</c> to true.
/// </summary>
[DiagnosticAnalyzer(LanguageNames.CSharp)]
public sealed class PkRequiresExtraAnalyzer : DiagnosticAnalyzer
{
    public const string Id = "PKB001";

    private static DiagnosticDescriptor Descriptor(DiagnosticSeverity severity) => new(Id, "A component needs an extra the project did not declare",
        "{0} needs the '{1}' extra: add {1} to <PlainKitExtras> in the project file", "PlainKit", severity, true,
        "The package serves only the extras listed in <PlainKitExtras>; without it the component's script is not served and the element stays inert.");

    private static readonly DiagnosticDescriptor Warning = Descriptor(DiagnosticSeverity.Warning);
    private static readonly DiagnosticDescriptor Error = Descriptor(DiagnosticSeverity.Error);

    public override ImmutableArray<DiagnosticDescriptor> SupportedDiagnostics { get; } = ImmutableArray.Create(Warning, Error);

    public override void Initialize(AnalysisContext context)
    {
        context.ConfigureGeneratedCodeAnalysis(GeneratedCodeAnalysisFlags.Analyze | GeneratedCodeAnalysisFlags.ReportDiagnostics);
        context.EnableConcurrentExecution();
        context.RegisterCompilationStartAction(start =>
        {
            var global = start.Options.AnalyzerConfigOptionsProvider.GlobalOptions;
            global.TryGetValue("build_property.PlainKitExtras", out var list);
            if (DeclaredFrom(list) is not { } declared) return;
            var attribute = start.Compilation.GetTypeByMetadataName("PlainKit.Blazor.PkRequiresExtraAttribute");
            if (attribute is null) return;
            global.TryGetValue("build_property.PlainKitStrictExtras", out var strict);
            var descriptor = string.Equals(strict?.Trim(), "true", StringComparison.OrdinalIgnoreCase) ? Error : Warning;
            start.RegisterSyntaxNodeAction(c =>
            {
                if (c.SemanticModel.GetSymbolInfo(c.Node, c.CancellationToken).Symbol is not INamedTypeSymbol type) return;
                foreach (var data in type.GetAttributes())
                {
                    if (!SymbolEqualityComparer.Default.Equals(data.AttributeClass, attribute) || data.ConstructorArguments.Length != 1) continue;
                    var argument = data.ConstructorArguments[0];
                    var name = (argument.Type as INamedTypeSymbol)?.GetMembers().OfType<IFieldSymbol>().FirstOrDefault(f => f.HasConstantValue && Equals(f.ConstantValue, argument.Value))?.Name.ToLowerInvariant();
                    if (name is not null && !declared.Contains(name)) c.ReportDiagnostic(Diagnostic.Create(descriptor, c.Node.GetLocation(), type.Name, name));
                }
            }, SyntaxKind.IdentifierName);
        });
    }

    /// <summary>The names the project declared (lower case), or null when it declared nothing or <c>full</c>, which allow everything.</summary>
    internal static ImmutableHashSet<string>? DeclaredFrom(string? list)
    {
        if (string.IsNullOrWhiteSpace(list)) return null;
        var names = list!.Split(new[] { ';', ',', ' ' }, StringSplitOptions.RemoveEmptyEntries).Select(n => n.Trim().ToLowerInvariant()).ToImmutableHashSet();
        return names.Contains("full") ? null : names;
    }
}
