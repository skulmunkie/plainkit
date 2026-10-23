using System.Collections.Immutable;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.Diagnostics;
using PlainKit.Blazor.Analyzers;

namespace PlainKit.Blazor.Tests;

// #1656 phase 2: PKB001 on a small compilation that references the real PlainKit.Blazor assembly. Razor markup is compiled to C# naming the component type, so the same code covers it.
public sealed class PkExtraAnalyzerTests
{
    private sealed class Options(Dictionary<string, string> global) : AnalyzerConfigOptionsProvider
    {
        private sealed class Set(Dictionary<string, string> values) : AnalyzerConfigOptions
        {
            public override bool TryGetValue(string key, out string value) => values.TryGetValue(key, out value!);
        }

        public override AnalyzerConfigOptions GlobalOptions { get; } = new Set(global);
        public override AnalyzerConfigOptions GetOptions(SyntaxTree tree) => GlobalOptions;
        public override AnalyzerConfigOptions GetOptions(AdditionalText textFile) => GlobalOptions;
    }

    private static async Task<ImmutableArray<Diagnostic>> Run(string code, string? extras, bool strict = false)
    {
        var references = ((string)AppContext.GetData("TRUSTED_PLATFORM_ASSEMBLIES")!).Split(Path.PathSeparator).Select(p => MetadataReference.CreateFromFile(p)).ToList();
        references.Add(MetadataReference.CreateFromFile(typeof(PkAssets).Assembly.Location));
        var compilation = CSharpCompilation.Create("app", [CSharpSyntaxTree.ParseText(code)], references, new CSharpCompilationOptions(OutputKind.DynamicallyLinkedLibrary));
        var global = new Dictionary<string, string>();
        if (extras is not null) global["build_property.PlainKitExtras"] = extras;
        if (strict) global["build_property.PlainKitStrictExtras"] = "true";
        var withAnalyzer = compilation.WithAnalyzers([new PkRequiresExtraAnalyzer()], new AnalyzerOptions([], new Options(global)));
        return (await withAnalyzer.GetAnalyzerDiagnosticsAsync()).ToImmutableArray();
    }

    private const string Dock = "class C { object M() => new PlainKit.Blazor.Components.PkDock(); }";

    [Fact]
    public async Task an_undeclared_extra_warns_and_names_the_fix()
    {
        var d = Assert.Single(await Run(Dock, "canvas"));
        Assert.Equal("PKB001", d.Id);
        Assert.Equal(DiagnosticSeverity.Warning, d.Severity);
        Assert.Equal("PkDock needs the 'dock' extra: add dock to <PlainKitExtras> in the project file", d.GetMessage());
    }

    [Fact]
    public async Task strict_makes_it_an_error() => Assert.Equal(DiagnosticSeverity.Error, Assert.Single(await Run(Dock, "canvas", strict: true)).Severity);

    [Theory]
    [InlineData("dock")]
    [InlineData("canvas;dock")]
    [InlineData("Canvas, DOCK")]
    [InlineData("full")]
    [InlineData("")]
    [InlineData(null)]
    public async Task a_declared_extra_or_no_declaration_reports_nothing(string? extras) => Assert.Empty(await Run(Dock, extras));

    [Fact]
    public async Task a_type_of_core_and_a_type_argument_are_judged_by_their_own_attribute()
    {
        Assert.Empty(await Run("class C { object M() => new PlainKit.Blazor.PkButton(); }", "dock"));
        var d = Assert.Single(await Run("class C { System.Type M() => typeof(PlainKit.Blazor.PkHeatMap); }", "dock"));
        Assert.Contains("'canvas'", d.GetMessage());
    }

    [Fact]
    public async Task a_hand_written_tools_wrapper_needs_tools() => Assert.Contains("'tools'", Assert.Single(await Run("class C { object M() => new PlainKit.Blazor.PkConsole(); }", "dock")).GetMessage());
}
