using System.Text.Json;
using Xunit;

namespace PlainKit.Blazor.Tests;

public class PkIconNameTests
{
    [Fact]
    public void Constants_equal_the_names_of_the_sprite()
    {
        var dir = AppContext.BaseDirectory;
        while (dir is not null && !File.Exists(Path.Combine(dir, "core", "VERSION"))) dir = Path.GetDirectoryName(dir);
        Assert.NotNull(dir);
        using var doc = JsonDocument.Parse(File.ReadAllText(Path.Combine(dir!, "core", "icons", "icons.json")));
        var sprite = doc.RootElement.GetProperty("names").EnumerateArray().Select(n => n.GetString()!).OrderBy(n => n, StringComparer.Ordinal).ToList();
        var constants = typeof(PkIconName).GetFields().Where(f => f.IsLiteral).Select(f => (string)f.GetRawConstantValue()!).OrderBy(n => n, StringComparer.Ordinal).ToList();
        Assert.Equal(sprite, constants);
        Assert.Equal("search", PkIconName.Search);
    }
}
