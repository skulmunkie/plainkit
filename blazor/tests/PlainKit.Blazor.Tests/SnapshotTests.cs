using System.Text.Json;
using PlainKit.Blazor;

namespace PlainKit.Blazor.Tests;

public sealed class SnapshotTests : IDisposable
{
    private readonly string _root = Directory.CreateTempSubdirectory("pk-snapshot").FullName;

    public void Dispose() => Directory.Delete(_root, recursive: true);

    private void Write(string relative, string text)
    {
        var path = Path.Combine(_root, relative);
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        File.WriteAllText(path, text);
    }

    [Fact]
    public void Collects_text_files_with_forward_slash_paths_and_lf_endings()
    {
        Write("src/App.cs", "public class App\r\n{\r\n}\r\n");
        Write("README.md", "# Hi");
        var snapshot = PkSnapshot.FromDirectory(_root);

        Assert.Equal(["README.md", "src/App.cs"], snapshot.Files.Select(f => f.Path));
        Assert.DoesNotContain('\r', snapshot.Files[1].Content);
        Assert.Equal("cs", snapshot.Files[1].Language);
    }

    [Fact]
    public void Skips_build_output_dependencies_binary_files_and_excluded_folders()
    {
        Write("bin/x.js", "x"); Write("obj/y.js", "y"); Write("node_modules/z.js", "z"); Write(".git/config.json", "{}");
        Write("image.png", "not text"); Write("vendor/lib.js", "v"); Write("keep.js", "k");
        var snapshot = PkSnapshot.FromDirectory(_root, dir => dir == "vendor");

        Assert.Equal(["keep.js"], snapshot.Files.Select(f => f.Path));
    }

    [Fact]
    public void Outlines_csharp_types_javascript_declarations_and_css_rules()
    {
        Write("A.cs", "namespace X;\npublic sealed record Thing(int A);\ninternal static class Helper { }\n");
        Write("a.js", "export async function load() {}\nconst x = 1;\n");
        Write("a.css", ".btn { color: red; }\n");
        var byPath = PkSnapshot.FromDirectory(_root).Files.ToDictionary(f => f.Path, f => f.Symbols);

        Assert.Equal(["record Thing@2", "class Helper@3"], byPath["A.cs"].Select(s => $"{s.Kind} {s.Name}@{s.Line}"));
        Assert.Equal(["function load@1", "const x@2"], byPath["a.js"].Select(s => $"{s.Kind} {s.Name}@{s.Line}"));
        Assert.Equal(["rule .btn@1"], byPath["a.css"].Select(s => $"{s.Kind} {s.Name}@{s.Line}"));
    }

    [Fact]
    public void Serializes_to_the_format_the_code_explorer_reads()
    {
        Write("a.js", "const x = 1;");
        using var doc = JsonDocument.Parse(JsonSerializer.Serialize(PkSnapshot.FromDirectory(_root)));

        Assert.Equal(1, doc.RootElement.GetProperty("version").GetInt32());
        var file = doc.RootElement.GetProperty("files")[0];
        Assert.Equal("a.js", file.GetProperty("path").GetString());
        Assert.Equal("const x = 1;", file.GetProperty("content").GetString());
        Assert.Equal("const", file.GetProperty("symbols")[0].GetProperty("kind").GetString());
    }
}
